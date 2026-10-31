-- LOCAL DEVELOPMENT ONLY. Puts one local test worker into every job state so My jobs (W11), Job status (W12),
-- cash, reports and notifications can be tried on a phone. Fake data only: the jobs belong to the fake "Seed Resident"
-- from seed_open_jobs.sql (run that first). Never run this on hosted DEV or production.
--
-- Apply (repo root, local stack running), for a phone-auth worker:
--   docker exec -i supabase_db_dha-works psql -U postgres -d postgres -v phone=+923001234567 < supabase/dev/seed_worker_journey.sql
-- Or for an email-auth worker:
--   docker exec -i supabase_db_dha-works psql -U postgres -d postgres -v email=you@example.com < supabase/dev/seed_worker_journey.sql
-- Safe to run again: it first removes the rows it created before (ids start with bbbbbbbb-) and rebuilds them with
-- fresh times. It is not supabase/seed.sql on purpose: pgTAP expects an empty database apart from its own fixtures.

begin;

-- the test worker, found by phone or email
\if :{?phone}
create temp table me on commit drop as
select id from public.profiles where role = 'worker' and phone = :'phone';
\else
create temp table me on commit drop as
select id from public.profiles where role = 'worker' and email = :'email';
\endif
do $$ begin
  if (select count(*) from me) <> 1 then raise exception 'no worker profile with that phone/email; sign in and finish onboarding first'; end if;
end $$;

-- a second fake worker who wins one job (so one of yours shows as "not chosen")
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token)
values ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'seed.worker@example.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', '')
on conflict (id) do nothing;
insert into public.profiles (id, role, full_name, email, phone, cnic, gender, date_of_birth, verification_status)
values ('22222222-2222-4222-8222-222222222222', 'worker', 'Seed Worker', 'seed.worker@example.test', '+923000000002',
        '42101-0000002-1', 'male', date '1990-01-01', 'approved')
on conflict (id) do nothing;
insert into public.worker_details (profile_id) values ('22222222-2222-4222-8222-222222222222') on conflict do nothing;

-- clean up an earlier run
update public.jobs set accepted_quote_id = null where id::text like 'bbbbbbbb-%';
delete from public.notifications where job_id::text like 'bbbbbbbb-%';
delete from public.cash_records where job_id::text like 'bbbbbbbb-%';
delete from public.job_events where job_id::text like 'bbbbbbbb-%';
delete from public.cancellation_requests where job_id::text like 'bbbbbbbb-%';
delete from public.reports where job_id::text like 'bbbbbbbb-%';
delete from public.quotes where job_id::text like 'bbbbbbbb-%';
delete from public.job_interests where job_id::text like 'bbbbbbbb-%';
delete from public.job_private where job_id::text like 'bbbbbbbb-%';
delete from public.jobs where id::text like 'bbbbbbbb-%';

-- jobs: 1 interested, 2 quoted, 3 scheduled today (with materials), 4 in progress, 5 completed (cash due),
--       6 cash collected, 7 cancelled, 8 lost to another worker
insert into public.jobs (id, resident_id, category_id, address_id, phase, lane, title, description, urgency, status, posted_at,
  scheduled_start, scheduled_end, started_at, completed_at)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 1, '11111111-1111-4111-8111-1111111111a1', 5, 'Lane 2', 'Journey: geyser not heating',  'Gas geyser pilot goes off.',        'asap', 'interested', now() - interval '2 hours', null, null, null, null),
  ('bbbbbbbb-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 1, '11111111-1111-4111-8111-1111111111a1', 6, 'Lane 7', 'Journey: bathroom tap leaks',   'The mixer tap drips.',             'asap', 'quoted',     now() - interval '3 hours', null, null, null, null),
  ('bbbbbbbb-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 1, '11111111-1111-4111-8111-1111111111a1', 6, 'Lane 7', 'Journey: kitchen sink leakage', 'Water drips under the cabinet.',    'asap', 'scheduled',  now() - interval '5 hours', now() + interval '1 hour', now() + interval '3 hours', null, null),
  ('bbbbbbbb-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 1, '11111111-1111-4111-8111-1111111111a1', 6, 'Lane 7', 'Journey: drain blocked',         'The kitchen drain is blocked.',    'asap', 'in_progress', now() - interval '6 hours', now() - interval '2 hours', now(), now() - interval '90 minutes', null),
  ('bbbbbbbb-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 1, '11111111-1111-4111-8111-1111111111a1', 6, 'Lane 7', 'Journey: bathroom drain blockage', 'Slow drain in the bathroom.',     'asap', 'completed',  now() - interval '8 hours', now() - interval '4 hours', now() - interval '2 hours', now() - interval '210 minutes', now() - interval '100 minutes'),
  ('bbbbbbbb-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 1, '11111111-1111-4111-8111-1111111111a1', 6, 'Lane 7', 'Journey: flush tank repair',    'The flush tank keeps running.',    'asap', 'cash_collected', now() - interval '2 days', now() - interval '2 days' + interval '2 hours', now() - interval '2 days' + interval '4 hours', now() - interval '2 days' + interval '2 hours', now() - interval '2 days' + interval '3 hours'),
  ('bbbbbbbb-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 1, '11111111-1111-4111-8111-1111111111a1', 6, 'Lane 7', 'Journey: cancelled job',         'Cancelled by the resident.',       'asap', 'cancelled',  now() - interval '4 hours', null, null, null, null),
  ('bbbbbbbb-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', 1, '11111111-1111-4111-8111-1111111111a1', 7, 'Lane 4', 'Journey: shower mixer',          'Replace the shower mixer.',        'asap', 'scheduled',  now() - interval '7 hours', now() + interval '1 day', now() + interval '1 day 2 hours', null, null);

insert into public.job_private (job_id, plot_no, floor, resident_phone)
select id, '118-C', 'Ground', '+923000000001' from public.jobs where id::text like 'bbbbbbbb-%';

-- interest for every job (all but job 8 are yours; on job 8 you only quoted)
insert into public.job_interests (job_id, worker_id, created_at)
select j.id, (select id from me), j.posted_at + interval '20 minutes' from public.jobs j where j.id::text like 'bbbbbbbb-%';

-- quotes (labour, materials, other, status)
insert into public.quotes (id, job_id, worker_id, labour, materials, materials_note, other_amount, other_note, visit_start, visit_end, status, created_at, decided_at)
values
  ('bbbbbbbb-1111-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', (select id from me), 2800, 0, null, 0, null, now() + interval '1 day', now() + interval '1 day 2 hours', 'sent',       now() - interval '150 minutes', null),
  ('bbbbbbbb-1111-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000003', (select id from me), 1500, 1450, 'Trap pipe, flexible hose, washers', 250, 'Fittings and washers', now() + interval '1 hour', now() + interval '3 hours', 'accepted', now() - interval '4 hours', now() - interval '3 hours'),
  ('bbbbbbbb-1111-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000004', (select id from me), 2000, 0, null, 0, null, now() - interval '2 hours', now(), 'accepted', now() - interval '5 hours', now() - interval '4 hours'),
  ('bbbbbbbb-1111-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000005', (select id from me), 1800, 0, null, 0, null, now() - interval '4 hours', now() - interval '2 hours', 'accepted', now() - interval '7 hours', now() - interval '6 hours'),
  ('bbbbbbbb-1111-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000006', (select id from me), 2200, 0, null, 0, null, now() - interval '2 days' + interval '2 hours', now() - interval '2 days' + interval '4 hours', 'accepted', now() - interval '2 days' - interval '1 hour', now() - interval '2 days'),
  ('bbbbbbbb-1111-4000-8000-000000000008', 'bbbbbbbb-0000-4000-8000-000000000008', (select id from me), 2600, 0, null, 0, null, now() + interval '1 day', now() + interval '1 day 2 hours', 'not_selected', now() - interval '6 hours', now() - interval '5 hours'),
  ('bbbbbbbb-2222-4000-8000-000000000008', 'bbbbbbbb-0000-4000-8000-000000000008', '22222222-2222-4222-8222-222222222222', 2400, 0, null, 0, null, now() + interval '1 day', now() + interval '1 day 2 hours', 'accepted', now() - interval '6 hours', now() - interval '5 hours');

update public.jobs set accepted_worker_id = (select id from me), accepted_quote_id = ('bbbbbbbb-1111-4000-8000-00000000000' || right(id::text, 1))::uuid
where id::text in ('bbbbbbbb-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000006');
update public.jobs set accepted_worker_id = '22222222-2222-4222-8222-222222222222', accepted_quote_id = 'bbbbbbbb-2222-4000-8000-000000000008'
where id = 'bbbbbbbb-0000-4000-8000-000000000008';
update public.jobs set cancelled_by = '11111111-1111-4111-8111-111111111111', cancel_reason = 'no_longer_needed' where id = 'bbbbbbbb-0000-4000-8000-000000000007';

-- cash: the completed job is waiting for the worker's amount; the other one is closed and matched
insert into public.cash_records (job_id, agreed_amount) values ('bbbbbbbb-0000-4000-8000-000000000005', 1800), ('bbbbbbbb-0000-4000-8000-000000000003', 3200), ('bbbbbbbb-0000-4000-8000-000000000004', 2000);
insert into public.cash_records (job_id, agreed_amount, worker_amount, worker_recorded_at, resident_amount, resident_confirmed_at, matched, quote_difference)
values ('bbbbbbbb-0000-4000-8000-000000000006', 2200, 2200, now() - interval '2 days' + interval '3 hours', 2200, now() - interval '2 days' + interval '3 hours', true, 0);

-- a few notifications for the worker (bell and the notifications screen)
insert into public.notifications (user_id, type, job_id, payload, created_at)
select (select id from me), v.type, v.job, jsonb_build_object('title', v.title), now() - v.age
from (values
  ('quote_accepted',     'bbbbbbbb-0000-4000-8000-000000000003'::uuid, 'Journey: kitchen sink leakage',  interval '3 hours'),
  ('quote_not_selected', 'bbbbbbbb-0000-4000-8000-000000000008'::uuid, 'Journey: shower mixer',          interval '5 hours'),
  ('quote_accepted',     'bbbbbbbb-0000-4000-8000-000000000006'::uuid, 'Journey: flush tank repair',     interval '2 days')
) as v(type, job, title, age);

commit;
