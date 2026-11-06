-- Migration 0037: admin second factor (email code) and staff invites (docs/SECURITY.md section 16).
--
-- Supabase's own MFA needs the Pro plan, so the admin portal uses a code sent by email as the second step:
--   1. password sign-in gives a normal session, which is NOT yet an admin session;
--   2. the Edge Function `admin-2fa` (service role) asks `admin_issue_challenge` for a code and emails it;
--   3. the admin types it into `admin_verify_code`, which marks THAT session as verified for 12 hours.
-- `is_admin()` now also requires the verified session, so every admin RLS and storage rule that already uses it
-- (and every admin RPC added later) is protected in one place. A password alone opens nothing.
-- Ending the session (sign out, suspension, "sign out other devices") deletes the verification with it.
--
-- Admin accounts are created only by an existing, verified admin: `invite_staff` returns a one-time token that the
-- invited person presents with their email to `accept_staff_invite`. The token, not the email confirmation, is the
-- proof, because hosted email sign-up may auto-confirm and then anyone could claim an invited address.

-- Tables ------------------------------------------------------------------------------------------------------
alter table public.staff_invites
  add column token_hash text,
  add column expires_at timestamptz not null default (now() + interval '7 days'),
  add column accepted_by uuid references public.profiles (id),
  add column accepted_at timestamptz;

create table public.admin_factor_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id uuid not null,
  code_hash text not null,
  tries smallint not null default 0,
  consumed boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
create index admin_factor_challenges_user_idx on public.admin_factor_challenges (user_id, created_at desc);

create table public.admin_verified_sessions (
  session_id uuid primary key references auth.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  verified_at timestamptz not null default now()
);

alter table public.admin_factor_challenges enable row level security;
alter table public.admin_verified_sessions enable row level security;
-- No policy and no grant: only the security-definer functions below touch these tables.

-- The admin check now needs the verified session ----------------------------------------------------------------
create function private.is_admin_account()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and account_status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_admin_account()
     and exists (
       select 1 from public.admin_verified_sessions v
       where v.session_id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
         and v.user_id = (select auth.uid())
         and v.verified_at > now() - interval '12 hours'
     );
$$;

-- Issue a code (service role only: called by the admin-2fa Edge Function, which emails it) ---------------------
create function public.admin_issue_challenge(p_user uuid, p_session uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_code text;
begin
  if not exists (select 1 from public.profiles where id = p_user and role = 'admin' and account_status = 'active') then
    raise exception 'not an active admin' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.sessions where id = p_session and user_id = p_user) then
    raise exception 'no such session' using errcode = '42501';
  end if;
  if exists (select 1 from public.admin_verified_sessions where session_id = p_session) then
    raise exception 'session already verified';
  end if;
  -- One code per minute, five per hour per account.
  if exists (select 1 from public.admin_factor_challenges where user_id = p_user and created_at > now() - interval '1 minute') then
    raise exception 'wait a minute before asking for another code' using errcode = 'P0001';
  end if;
  if (select count(*) from public.admin_factor_challenges where user_id = p_user and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too many codes requested; try again later' using errcode = 'P0001';
  end if;

  update public.admin_factor_challenges set consumed = true where session_id = p_session and not consumed;
  v_code := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
  insert into public.admin_factor_challenges (id, user_id, session_id, code_hash)
  values (v_id, p_user, p_session,
          encode(extensions.digest(convert_to(v_code || v_id::text, 'utf8'), 'sha256'), 'hex'));
  insert into public.audit_log (actor_id, action, table_name, record_id)
  values (p_user, 'admin_code_issued', 'admin_factor_challenges', v_id::text); -- never the code itself
  return v_code;
end;
$$;

-- Check a code. Returns a status instead of raising, so a wrong guess is counted and kept (a raise would roll the
-- counter back): 'ok', 'wrong', 'locked' (too many wrong tries), 'expired' or 'none' (no open code).
create function public.admin_verify_code(p_code text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session uuid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
  v_c public.admin_factor_challenges;
begin
  if v_uid is null or v_session is null or not private.is_admin_account() then
    raise exception 'not available' using errcode = '42501';
  end if;
  select * into v_c from public.admin_factor_challenges
  where session_id = v_session and user_id = v_uid and not consumed
  order by created_at desc limit 1
  for update;
  if not found then return 'none'; end if;
  if v_c.expires_at < now() then
    update public.admin_factor_challenges set consumed = true where id = v_c.id;
    return 'expired';
  end if;
  if v_c.tries >= 5 then return 'locked'; end if;

  if p_code is not null
     and v_c.code_hash = encode(extensions.digest(convert_to(p_code || v_c.id::text, 'utf8'), 'sha256'), 'hex') then
    update public.admin_factor_challenges set consumed = true where id = v_c.id;
    insert into public.admin_verified_sessions (session_id, user_id) values (v_session, v_uid)
    on conflict (session_id) do update set verified_at = now();
    insert into public.audit_log (actor_id, action, table_name, record_id)
    values (v_uid, 'admin_signed_in', 'admin_verified_sessions', v_session::text);
    return 'ok';
  end if;

  update public.admin_factor_challenges set tries = tries + 1 where id = v_c.id;
  if v_c.tries + 1 >= 5 then
    insert into public.audit_log (actor_id, action, table_name, record_id)
    values (v_uid, 'admin_code_locked', 'admin_factor_challenges', v_c.id::text);
    return 'locked';
  end if;
  return 'wrong';
end;
$$;

-- What the portal middleware asks on every request: 'verified', 'needs_code' or 'not_admin'.
create function public.admin_session_status()
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when not private.is_admin_account() then 'not_admin'
    when public.is_admin() then 'verified'
    else 'needs_code'
  end;
$$;

-- Staff invites -----------------------------------------------------------------------------------------------
create function public.invite_staff(p_email text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_id uuid := gen_random_uuid();
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'enter a valid email address';
  end if;
  if exists (select 1 from public.profiles where lower(email) = v_email and role = 'admin') then
    raise exception 'that person is already an admin';
  end if;
  update public.staff_invites set status = 'revoked' where lower(email) = v_email and status = 'pending';
  insert into public.staff_invites (id, email, invited_by, token_hash)
  values (v_id, v_email, v_uid, encode(extensions.digest(convert_to(v_token, 'utf8'), 'sha256'), 'hex'));
  insert into public.audit_log (actor_id, action, table_name, record_id, new_data)
  values (v_uid, 'staff_invited', 'staff_invites', v_id::text, jsonb_build_object('email', v_email));
  return v_token; -- shown once to the inviter; only its hash is stored
end;
$$;

create function public.revoke_staff_invite(p_invite uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  update public.staff_invites set status = 'revoked' where id = p_invite and status = 'pending';
  if not found then raise exception 'no pending invite'; end if;
  insert into public.audit_log (actor_id, action, table_name, record_id)
  values (auth.uid(), 'staff_invite_revoked', 'staff_invites', p_invite::text);
end;
$$;

-- The invited person has signed up with email + password; this turns that account into an admin account.
-- Every refusal is the same message so the endpoint cannot be used to learn which emails were invited.
create function public.accept_staff_invite(p_email text, p_token text, p_full_name text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_invite public.staff_invites;
  v_jwt_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select * into v_invite from public.staff_invites
  where lower(email) = v_email and status = 'pending' and expires_at > now()
    and token_hash = encode(extensions.digest(convert_to(coalesce(p_token, ''), 'utf8'), 'sha256'), 'hex')
  for update;
  if not found or v_jwt_email <> v_email
     or char_length(btrim(coalesce(p_full_name, ''))) not between 2 and 100
     or exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'this invitation is not valid' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, role, full_name, email, verification_status)
  values (v_uid, 'admin', btrim(p_full_name), v_email, 'approved');
  update public.staff_invites set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = v_invite.id;
  insert into public.audit_log (actor_id, action, table_name, record_id, new_data)
  values (v_uid, 'staff_invite_accepted', 'staff_invites', v_invite.id::text, jsonb_build_object('email', v_email));
end;
$$;

-- Grants ------------------------------------------------------------------------------------------------------
revoke all on function public.admin_issue_challenge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_issue_challenge(uuid, uuid) to service_role;

revoke all on function
  public.admin_verify_code(text), public.admin_session_status(), public.invite_staff(text),
  public.revoke_staff_invite(uuid), public.accept_staff_invite(text, text, text)
from public, anon;
grant execute on function
  public.admin_verify_code(text), public.admin_session_status(), public.invite_staff(text),
  public.revoke_staff_invite(uuid), public.accept_staff_invite(text, text, text)
to authenticated;

revoke all on function private.is_admin_account() from public, anon, authenticated;
