-- LOCAL DEVELOPMENT ONLY. Fake phone-auth worker accounts for the static OTPs in supabase/config.toml.
-- Never run this on hosted DEV or production. Reset the local database when you want a clean "no profile" case.
--
-- Apply after `supabase start` (repo root):
--   docker exec -i supabase_db_dha-works psql -U postgres -d postgres < supabase/dev/seed_phone_workers.sql
--
-- The approved worker can receive the full journey with:
--   docker exec -i supabase_db_dha-works psql -U postgres -d postgres -v phone=+923001234567 < supabase/dev/seed_worker_journey.sql

begin;

-- auth.users.phone stores the international number without "+"; profiles.phone keeps "+92..." for the app.
insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, encrypted_password, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token)
values
  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '923001234567', now(), '', now(), now(), '{"provider":"phone","providers":["phone"]}', '{}', '', '', '', '', '', '', '', ''),
  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '923211234567', now(), '', now(), now(), '{"provider":"phone","providers":["phone"]}', '{}', '', '', '', '', '', '', '', ''),
  ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '923331234567', now(), '', now(), now(), '{"provider":"phone","providers":["phone"]}', '{}', '', '', '', '', '', '', '', ''),
  ('66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '923451234567', now(), '', now(), now(), '{"provider":"phone","providers":["phone"]}', '{}', '', '', '', '', '', '', '', ''),
  ('77777777-7777-4777-8777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   '923561234567', now(), '', now(), now(), '{"provider":"phone","providers":["phone"]}', '{}', '', '', '', '', '', '', '', '')
on conflict (id) do update set
  phone = excluded.phone,
  phone_confirmed_at = excluded.phone_confirmed_at,
  updated_at = now(),
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = '',
  email_change_token_current = '', reauthentication_token = '', phone_change = '', phone_change_token = '';

-- +923001234567: approved, active, with categories and areas; use seed_worker_journey.sql for jobs.
insert into public.profiles (id, role, full_name, phone, cnic, gender, date_of_birth, verification_status, account_status)
values ('33333333-3333-4333-8333-333333333333', 'worker', 'Phone Test Approved', '+923001234567',
        '42101-0000003-1', 'male', date '1990-01-01', 'approved', 'active')
on conflict (id) do update set
  full_name = excluded.full_name, phone = excluded.phone, cnic = excluded.cnic, gender = excluded.gender,
  date_of_birth = excluded.date_of_birth, verification_status = excluded.verification_status,
  verification_reason = null, account_status = excluded.account_status, suspended_at = null,
  suspended_until = null, suspension_reason = null;

insert into public.worker_details (profile_id) values ('33333333-3333-4333-8333-333333333333')
on conflict (profile_id) do update set available_today = true;

delete from public.worker_categories where worker_id = '33333333-3333-4333-8333-333333333333';
insert into public.worker_categories (worker_id, category_id)
values ('33333333-3333-4333-8333-333333333333', 1), ('33333333-3333-4333-8333-333333333333', 2);

delete from public.worker_areas where worker_id = '33333333-3333-4333-8333-333333333333';
insert into public.worker_areas (worker_id, phase)
values ('33333333-3333-4333-8333-333333333333', 5), ('33333333-3333-4333-8333-333333333333', 6);

-- +923211234567: pending review.
insert into public.profiles (id, role, full_name, phone, cnic, gender, date_of_birth, verification_status, account_status)
values ('44444444-4444-4444-8444-444444444444', 'worker', 'Phone Test Pending', '+923211234567',
        '42101-0000004-1', 'female', date '1992-02-02', 'pending', 'active')
on conflict (id) do update set
  full_name = excluded.full_name, phone = excluded.phone, cnic = excluded.cnic, gender = excluded.gender,
  date_of_birth = excluded.date_of_birth, verification_status = excluded.verification_status,
  verification_reason = null, account_status = excluded.account_status;

-- +923331234567: approved but suspended.
insert into public.profiles (id, role, full_name, phone, cnic, gender, date_of_birth, verification_status, account_status,
  suspended_at, suspension_reason)
values ('55555555-5555-4555-8555-555555555555', 'worker', 'Phone Test Suspended', '+923331234567',
        '42101-0000005-1', 'male', date '1988-03-03', 'approved', 'suspended', now(), 'Local test suspension')
on conflict (id) do update set
  full_name = excluded.full_name, phone = excluded.phone, cnic = excluded.cnic, gender = excluded.gender,
  date_of_birth = excluded.date_of_birth, verification_status = excluded.verification_status,
  verification_reason = null, account_status = excluded.account_status, suspended_at = excluded.suspended_at,
  suspended_until = null, suspension_reason = excluded.suspension_reason;

-- +923451234567: rejected.
insert into public.profiles (id, role, full_name, phone, cnic, gender, date_of_birth, verification_status, account_status,
  verification_reason)
values ('66666666-6666-4666-8666-666666666666', 'worker', 'Phone Test Rejected', '+923451234567',
        '42101-0000006-1', 'female', date '1994-04-04', 'rejected', 'active', 'Local test rejection')
on conflict (id) do update set
  full_name = excluded.full_name, phone = excluded.phone, cnic = excluded.cnic, gender = excluded.gender,
  date_of_birth = excluded.date_of_birth, verification_status = excluded.verification_status,
  verification_reason = excluded.verification_reason, account_status = excluded.account_status,
  suspended_at = null, suspended_until = null, suspension_reason = null;

-- +923561234567: auth user only, no profile, so the app starts at W02 "About you".

commit;
