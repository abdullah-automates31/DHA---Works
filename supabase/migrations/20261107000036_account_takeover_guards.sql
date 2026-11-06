-- Migration 0036: account-takeover guards (docs/SECURITY.md section 15).
--
-- Sign-in is phone + one-time code only, so a SIM swap or a recycled number gives an attacker a valid session.
-- Two guards limit the damage:
--   1. Every new sign-in tells the account's other devices ('new_sign_in' notification, which also becomes a push).
--      The very first sign-in of an account is not announced. A failure here never blocks a sign-in.
--   2. Suspending an account ends all of its sessions at once and removes its push tokens, so a suspended
--      worker is signed out everywhere, not only refused by each RPC.

-- 1. New sign-in notice ----------------------------------------------------------------------------------------
create function public.notify_new_sign_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    -- Announce only when the account already had a session; the first one is the person registering.
    if exists (select 1 from auth.sessions s where s.user_id = new.user_id and s.id <> new.id)
       and exists (select 1 from public.profiles p where p.id = new.user_id) then
      insert into public.notifications (user_id, type, payload)
      values (new.user_id, 'new_sign_in', '{}'::jsonb);
    end if;
  exception when others then
    null; -- a notice must never stop a person signing in
  end;
  return new;
end;
$$;

revoke all on function public.notify_new_sign_in() from public, anon, authenticated;
grant execute on function public.notify_new_sign_in() to supabase_auth_admin;

create trigger notify_new_sign_in
  after insert on auth.sessions
  for each row execute function public.notify_new_sign_in();

-- 2. Suspension ends every session ----------------------------------------------------------------------------
create function public.end_sessions_on_suspend()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_status = 'suspended' and old.account_status is distinct from 'suspended' then
    delete from auth.sessions where user_id = new.id;           -- refresh tokens go with their session
    delete from public.device_tokens where user_id = new.id;    -- no more pushes to the phone
  end if;
  return new;
end;
$$;

revoke all on function public.end_sessions_on_suspend() from public, anon, authenticated;

create trigger end_sessions_on_suspend
  after update of account_status on public.profiles
  for each row execute function public.end_sessions_on_suspend();
