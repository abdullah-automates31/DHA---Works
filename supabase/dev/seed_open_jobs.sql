-- LOCAL DEVELOPMENT ONLY. Fake data for trying the worker app against the local stack. Never run on hosted DEV
-- or production, and never put real names, numbers or CNICs here.
-- Apply:  docker exec -i supabase_db_dha-works psql -U postgres -d postgres < supabase/dev/seed_open_jobs.sql
-- Safe to run again: it refreshes the jobs' posted time so they stay open (open jobs expire after 24 hours).
-- It is not supabase/seed.sql on purpose: that file runs on every `supabase db reset` and would add rows the
-- pgTAP tests do not expect.

begin;

-- instance_id and a confirmed email are what the auth service needs to find this user, so the fake resident can also
-- sign in locally with an email code (read it in Mailpit) to accept quotes while testing.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
values ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'seed.resident@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}',
        '', '', '', '', '', '', '', '')
on conflict (id) do update set instance_id = excluded.instance_id, encrypted_password = '',
  created_at = coalesce(auth.users.created_at, now()), updated_at = now(),
  raw_app_meta_data = excluded.raw_app_meta_data, raw_user_meta_data = excluded.raw_user_meta_data,
  confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = '', email_change_token_current = '',
  reauthentication_token = '', phone_change = '', phone_change_token = '',
  email_confirmed_at = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at);

insert into public.profiles (id, role, full_name, email, phone, cnic, gender, date_of_birth, verification_status)
values ('11111111-1111-4111-8111-111111111111', 'resident', 'Seed Resident', 'seed.resident@example.test',
        '+923000000001', '42101-0000001-1', 'female', date '1990-01-01', 'approved')
on conflict (id) do nothing;

insert into public.addresses (id, resident_id, label, phase, lane, plot_no, floor, is_default)
values ('11111111-1111-4111-8111-1111111111a1', '11111111-1111-4111-8111-111111111111', 'Home', 6, 'Lane 7', '118-C', 'Ground', true)
on conflict (id) do nothing;

-- Start the seeded jobs from a clean state: forget any interest, quotes or events from earlier test runs.
update public.jobs set status = 'open', accepted_quote_id = null, accepted_worker_id = null, scheduled_start = null, scheduled_end = null,
  started_at = null, completed_at = null
where resident_id = '11111111-1111-4111-8111-111111111111';
-- accepting a quote creates a cash record; leftovers from an earlier test run would make the next accept fail
delete from public.cash_records where job_id in (select id from public.jobs where resident_id = '11111111-1111-4111-8111-111111111111');
delete from public.cancellation_requests where job_id in (select id from public.jobs where resident_id = '11111111-1111-4111-8111-111111111111');
delete from public.job_events where job_id in (select id from public.jobs where resident_id = '11111111-1111-4111-8111-111111111111');
delete from public.quotes where job_id in (select id from public.jobs where resident_id = '11111111-1111-4111-8111-111111111111');
delete from public.job_interests where job_id in (select id from public.jobs where resident_id = '11111111-1111-4111-8111-111111111111');
delete from public.job_views where job_id in (select id from public.jobs where resident_id = '11111111-1111-4111-8111-111111111111');

-- category ids: 1 Plumbing, 2 Electrical, 3 AC & Refrigeration, 4 Carpentry, 5 Painting
insert into public.jobs (id, resident_id, category_id, address_id, phase, lane, title, description, urgency, status, posted_at)
values
  ('11111111-1111-4111-8111-1111111111b1', '11111111-1111-4111-8111-111111111111', 1, '11111111-1111-4111-8111-1111111111a1', 6, 'Lane 7',
   'Kitchen sink leakage', 'Water drips from the pipe under the sink all day.', 'asap', 'open', now()),
  ('11111111-1111-4111-8111-1111111111b2', '11111111-1111-4111-8111-111111111111', 3, '11111111-1111-4111-8111-1111111111a1', 6, 'Lane 7',
   'AC not cooling', 'The split AC runs but the room stays warm.', 'asap', 'open', now()),
  ('11111111-1111-4111-8111-1111111111b3', '11111111-1111-4111-8111-111111111111', 1, '11111111-1111-4111-8111-1111111111a1', 5, 'Lane 2',
   'Geyser not heating', 'The gas geyser lights but the water stays cold.', 'asap', 'open', now()),
  ('11111111-1111-4111-8111-1111111111b4', '11111111-1111-4111-8111-111111111111', 2, '11111111-1111-4111-8111-1111111111a1', 7, 'Lane 4',
   'Ceiling fan wobbling', 'The bedroom fan shakes at high speed.', 'asap', 'open', now()),
  ('11111111-1111-4111-8111-1111111111b5', '11111111-1111-4111-8111-111111111111', 4, '11111111-1111-4111-8111-1111111111a1', 6, 'Lane 7',
   'Wardrobe door off its hinge', 'The sliding door came off the track.', 'asap', 'open', now())
on conflict (id) do update set status = 'open', posted_at = now(), accepted_worker_id = null, accepted_quote_id = null;

insert into public.job_private (job_id, plot_no, floor, resident_phone)
select id, '118-C', 'Ground', '+923000000001' from public.jobs where resident_id = '11111111-1111-4111-8111-111111111111'
on conflict (job_id) do nothing;

commit;
