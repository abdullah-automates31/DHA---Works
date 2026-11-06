-- 0033: authentication and identity hardening (6 Nov security review of 15 bypass classes).
--  A. set_my_references took any JSON: any shape, any number of elements. Now a strict list of at most 5 objects with
--     only name / phone / address, each a string within its length.
--  B. The contact phone is now the phone that signed in. A phone-OTP account's profiles.phone is set from the verified
--     auth.users.phone (never from what the client sends) and is unique. Email accounts (legacy / staff) keep the typed phone.
--  C. register_profile is race-safe: concurrent registrations of one user are serialised and a duplicate CNIC or
--     phone is reported as one clean error instead of a raw key violation.

-- ---------------------------------------------------------------------------
-- A. Strict JSON for references
-- ---------------------------------------------------------------------------
create or replace function public.set_my_references(p_refs jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker', false);
  v_status public.verification_status;
  v_refs jsonb := coalesce(p_refs, '[]'::jsonb);
begin
  select verification_status into v_status from public.profiles where id = v_uid;
  if v_status not in ('incomplete', 'needs_changes') then
    raise exception 'references can only be changed before submission or when staff ask for changes';
  end if;

  -- Shape: a list of at most 5 objects that carry only name, phone and address, each a string.
  if jsonb_typeof(v_refs) <> 'array' then
    raise exception 'references must be a list';
  end if;
  if jsonb_array_length(v_refs) > 5 then
    raise exception 'at most 5 references are allowed';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_refs) r
    where jsonb_typeof(r) <> 'object'
       or exists (select 1 from jsonb_object_keys(r) k where k not in ('name', 'phone', 'address'))
       or jsonb_typeof(coalesce(r -> 'name', '""'::jsonb)) <> 'string'
       or jsonb_typeof(coalesce(r -> 'phone', '""'::jsonb)) <> 'string'
       or jsonb_typeof(coalesce(r -> 'address', '""'::jsonb)) <> 'string'
       or char_length(coalesce(r ->> 'name', '')) > 100
       or char_length(coalesce(r ->> 'phone', '')) > 20
       or char_length(coalesce(r ->> 'address', '')) > 300
  ) then
    raise exception 'a reference has the wrong shape or is too long';
  end if;

  delete from public.worker_references where worker_id = v_uid;
  insert into public.worker_references (worker_id, name, phone, address)
  select v_uid, btrim(r ->> 'name'), btrim(r ->> 'phone'), nullif(btrim(coalesce(r ->> 'address', '')), '')
  from jsonb_array_elements(v_refs) r
  where btrim(coalesce(r ->> 'name', '')) <> '' and btrim(coalesce(r ->> 'phone', '')) <> '';
end;
$$;

-- ---------------------------------------------------------------------------
-- B. The contact phone follows the verified login phone
-- ---------------------------------------------------------------------------
-- Keep the phone of anyone who signed in with a phone number identical to the verified one.
update public.profiles p
   set phone = '+' || u.phone
  from auth.users u
 where u.id = p.id and nullif(u.phone, '') is not null and p.phone is distinct from '+' || u.phone;

create unique index profiles_phone_unique on public.profiles (phone) where phone is not null;

-- ---------------------------------------------------------------------------
-- C. register_profile: race-safe, phone from the verified login
-- ---------------------------------------------------------------------------
create or replace function public.register_profile(
  p_role public.user_role,
  p_full_name text,
  p_phone text,
  p_gender public.gender default null,
  p_date_of_birth date default null,
  p_cnic text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_auth_phone text;
  v_email text;
  v_phone text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_role not in ('resident', 'worker') then
    raise exception 'only resident and worker accounts can be registered here';
  end if;

  -- Two requests for the same user (double tap, retry, second device) queue here, so only the first one inserts.
  perform pg_advisory_xact_lock(hashtextextended('register_profile:' || v_uid::text, 0));
  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile already exists';
  end if;

  select nullif(phone, ''), email into v_auth_phone, v_email from auth.users where id = v_uid;
  -- A phone-OTP account uses the number it proved; only email accounts may type one.
  v_phone := case when v_auth_phone is not null then '+' || v_auth_phone else nullif(trim(p_phone), '') end;

  begin
    insert into public.profiles (id, role, full_name, email, phone, gender, date_of_birth, cnic)
    values (v_uid, p_role, nullif(trim(p_full_name), ''), v_email, v_phone, p_gender, p_date_of_birth,
            nullif(trim(p_cnic), ''));
    if p_role = 'worker' then
      insert into public.worker_details (profile_id) values (v_uid);
    end if;
  exception when unique_violation then
    -- Either this user's own row appeared in the meantime, or the CNIC / phone belongs to another account.
    if exists (select 1 from public.profiles where id = v_uid) then
      raise exception 'profile already exists';
    end if;
    raise;
  end;

  insert into public.audit_log (actor_id, action, table_name, record_id)
  values (v_uid, 'register_profile', 'profiles', v_uid::text);
end;
$$;

-- update_my_profile: a phone-OTP account's contact phone cannot be typed over; it is always the number that signed in.
-- (Same body as 0007 otherwise.)
create or replace function public.update_my_profile(
  p_full_name text default null,
  p_phone text default null,
  p_gender public.gender default null,
  p_date_of_birth date default null,
  p_cnic text default null,
  p_avatar_path text default null,
  p_locale text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles;
  v_auth_phone text;
begin
  select * into v_p from public.profiles where id = v_uid;
  if not found then
    raise exception 'no profile';
  end if;
  if v_p.verification_status = 'approved'
     and (p_full_name is not null or p_gender is not null or p_date_of_birth is not null or p_cnic is not null) then
    raise exception 'name, gender, date of birth and CNIC are locked after approval; contact DHA staff';
  end if;
  if p_avatar_path is not null and p_avatar_path not like v_uid::text || '/%' then
    raise exception 'invalid file path';
  end if;
  select nullif(phone, '') into v_auth_phone from auth.users where id = v_uid;
  update public.profiles set
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    phone = case when v_auth_phone is not null then '+' || v_auth_phone else coalesce(nullif(trim(p_phone), ''), phone) end,
    gender = coalesce(p_gender, gender),
    date_of_birth = coalesce(p_date_of_birth, date_of_birth),
    cnic = coalesce(nullif(trim(p_cnic), ''), cnic),
    avatar_path = coalesce(p_avatar_path, avatar_path),
    locale = coalesce(p_locale, locale)
  where id = v_uid;
end;
$$;
