-- LOCAL DEVELOPMENT ONLY. Fake approved people, jobs, reports, reviews and helpline calls for trying the admin portal
-- screens (reports, jobs, users, reviews, helpline). Run after seed_local_admin.sql. Never run against a hosted project.
--   docker exec -i supabase_db_dha-works psql -U postgres -d postgres < supabase/dev/seed_local_operations.sql
-- Everything is marked [FAKE] in the name. `npm run db:local -- db reset` removes it.
begin;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, now(), now(),
       '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''
from (values
  ('cccccccc-0000-4000-8000-000000000001', 'hira@dha-local.test'),   ('cccccccc-0000-4000-8000-000000000002', 'ayesha@dha-local.test'),
  ('cccccccc-0000-4000-8000-000000000003', 'omar@dha-local.test'),   ('cccccccc-0000-4000-8000-000000000011', 'usman@dha-local.test'),
  ('cccccccc-0000-4000-8000-000000000012', 'bilal@dha-local.test'),  ('cccccccc-0000-4000-8000-000000000013', 'asif@dha-local.test')
) as v(id, email)
on conflict (id) do nothing;

insert into public.profiles (id, role, full_name, email, phone, cnic, verification_status, verification_updated_at, created_at) values
  ('cccccccc-0000-4000-8000-000000000001', 'resident', 'Hira Farooq [FAKE]', 'hira@dha-local.test', '03215550148', '42101-5550148-1', 'approved', now() - interval '40 days', now() - interval '41 days'),
  ('cccccccc-0000-4000-8000-000000000002', 'resident', 'Ayesha M. [FAKE]', 'ayesha@dha-local.test', '03455550126', '42101-5550126-2', 'approved', now() - interval '30 days', now() - interval '31 days'),
  ('cccccccc-0000-4000-8000-000000000003', 'resident', 'Omar Farooqui [FAKE]', 'omar@dha-local.test', '03005550133', '42101-5550133-3', 'approved', now() - interval '20 days', now() - interval '21 days'),
  ('cccccccc-0000-4000-8000-000000000011', 'worker', 'Usman Khan [FAKE]', 'usman@dha-local.test', '03214567890', '42101-4567890-1', 'approved', now() - interval '56 days', now() - interval '57 days'),
  ('cccccccc-0000-4000-8000-000000000012', 'worker', 'Bilal K. [FAKE]', 'bilal@dha-local.test', '03005550136', '42101-5550134-5', 'approved', now() - interval '50 days', now() - interval '51 days'),
  ('cccccccc-0000-4000-8000-000000000013', 'worker', 'Asif Javed [FAKE]', 'asif@dha-local.test', '03455550177', '42101-5550177-9', 'approved', now() - interval '45 days', now() - interval '46 days')
on conflict (id) do nothing;

insert into public.worker_details (profile_id, experience_years, about, jobs_done) values
  ('cccccccc-0000-4000-8000-000000000011', 8, 'Plumber for eight years in DHA.', 312),
  ('cccccccc-0000-4000-8000-000000000012', 5, 'Plumber and geyser repair.', 140),
  ('cccccccc-0000-4000-8000-000000000013', 6, 'House painter.', 96)
on conflict (profile_id) do nothing;
insert into public.worker_categories (worker_id, category_id) values
  ('cccccccc-0000-4000-8000-000000000011', 1), ('cccccccc-0000-4000-8000-000000000012', 1), ('cccccccc-0000-4000-8000-000000000013', 5)
on conflict do nothing;
insert into public.worker_areas (worker_id, phase) values
  ('cccccccc-0000-4000-8000-000000000011', 5), ('cccccccc-0000-4000-8000-000000000011', 6), ('cccccccc-0000-4000-8000-000000000011', 7),
  ('cccccccc-0000-4000-8000-000000000012', 5), ('cccccccc-0000-4000-8000-000000000012', 6), ('cccccccc-0000-4000-8000-000000000013', 6), ('cccccccc-0000-4000-8000-000000000013', 8)
on conflict do nothing;
insert into public.addresses (id, resident_id, label, phase, lane, plot_no, is_default) values
  ('cccccccc-1000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Home', 6, 'Lane 7', '118-C', true),
  ('cccccccc-1000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002', 'Home', 5, 'Lane 3', '22-A', true),
  ('cccccccc-1000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000003', 'Home', 8, 'Lane 1', '9-B', true)
on conflict do nothing;

-- Jobs ---------------------------------------------------------------------------------------------------------------
insert into public.jobs (id, resident_id, category_id, address_id, phase, lane, title, description, urgency, status, posted_at, created_at, updated_at) values
  ('cccccccc-2000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 1, 'cccccccc-1000-4000-8000-000000000001', 6, 'Lane 7', 'Kitchen sink leakage [FAKE]', 'Water drips from the trap pipe under the kitchen sink. It started two days ago and the cabinet floor is wet.', 'asap', 'draft', now() - interval '3 hours', now() - interval '3 hours', now() - interval '12 minutes'),
  ('cccccccc-2000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002', 1, 'cccccccc-1000-4000-8000-000000000002', 5, 'Lane 3', 'Geyser repair [FAKE]', 'The geyser trips the switch after ten minutes.', 'asap', 'draft', now() - interval '2 days', now() - interval '2 days', now() - interval '3 hours'),
  ('cccccccc-2000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000003', 2, 'cccccccc-1000-4000-8000-000000000003', 8, 'Lane 1', 'Light switch not working [FAKE]', 'The bedroom light switch sparks.', 'asap', 'open', now() - interval '3 hours', now() - interval '3 hours', now() - interval '3 hours'),
  ('cccccccc-2000-4000-8000-000000000004', 'cccccccc-0000-4000-8000-000000000001', 1, 'cccccccc-1000-4000-8000-000000000001', 6, 'Lane 7', 'Tap replacement [FAKE]', 'Replace two bathroom taps.', 'asap', 'draft', now() - interval '6 hours', now() - interval '6 hours', now() - interval '6 hours'),
  ('cccccccc-2000-4000-8000-000000000005', 'cccccccc-0000-4000-8000-000000000003', 5, 'cccccccc-1000-4000-8000-000000000003', 8, 'Lane 1', 'Wall painting, 2 rooms [FAKE]', 'Two bedrooms, white emulsion.', 'asap', 'draft', now() - interval '1 day', now() - interval '1 day', now() - interval '5 hours'),
  ('cccccccc-2000-4000-8000-000000000006', 'cccccccc-0000-4000-8000-000000000002', 1, 'cccccccc-1000-4000-8000-000000000002', 5, 'Lane 3', 'Bathroom tap [FAKE]', 'Tap drips all night.', 'asap', 'draft', now() - interval '2 days', now() - interval '2 days', now() - interval '1 hour'),
  ('cccccccc-2000-4000-8000-000000000007', 'cccccccc-0000-4000-8000-000000000001', 1, 'cccccccc-1000-4000-8000-000000000001', 6, 'Lane 7', 'Bathroom drain blockage [FAKE]', 'Floor drain is blocked.', 'asap', 'draft', now() - interval '4 days', now() - interval '4 days', now() - interval '1 day')
on conflict (id) do nothing;
insert into public.job_private (job_id, plot_no, floor, resident_phone) values
  ('cccccccc-2000-4000-8000-000000000001', '118-C', null, '03215550148'), ('cccccccc-2000-4000-8000-000000000002', '22-A', null, '03455550126'),
  ('cccccccc-2000-4000-8000-000000000003', '9-B', '1st', '03005550133'), ('cccccccc-2000-4000-8000-000000000004', '118-C', null, '03215550148'),
  ('cccccccc-2000-4000-8000-000000000005', '9-B', null, '03005550133'), ('cccccccc-2000-4000-8000-000000000006', '22-A', null, '03455550126'),
  ('cccccccc-2000-4000-8000-000000000007', '118-C', null, '03215550148')
on conflict do nothing;

-- Accepted quotes and the jobs' final statuses (set by the database owner; the lifecycle itself is tested elsewhere).
insert into public.quotes (id, job_id, worker_id, labour, materials, materials_note, visit_start, visit_end, status, decided_at, created_at) values
  ('cccccccc-3000-4000-8000-000000000001', 'cccccccc-2000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000011', 2200, 1000, 'Two washers and a trap pipe', now() + interval '1 hour', now() + interval '3 hours', 'accepted', now() - interval '2 hours', now() - interval '2 hours 30 minutes'),
  ('cccccccc-3000-4000-8000-000000000002', 'cccccccc-2000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000012', 2800, 0, null, now() - interval '1 day', now() - interval '1 day' + interval '2 hours', 'accepted', now() - interval '30 hours', now() - interval '31 hours'),
  ('cccccccc-3000-4000-8000-000000000004', 'cccccccc-2000-4000-8000-000000000004', 'cccccccc-0000-4000-8000-000000000012', 1500, 0, null, now() + interval '1 day', now() + interval '1 day 2 hours', 'accepted', now() - interval '5 hours', now() - interval '5 hours 30 minutes'),
  ('cccccccc-3000-4000-8000-000000000005', 'cccccccc-2000-4000-8000-000000000005', 'cccccccc-0000-4000-8000-000000000013', 15000, 3000, 'Paint and rollers', now() + interval '1 day', now() + interval '1 day 6 hours', 'accepted', now() - interval '20 hours', now() - interval '22 hours'),
  ('cccccccc-3000-4000-8000-000000000006', 'cccccccc-2000-4000-8000-000000000006', 'cccccccc-0000-4000-8000-000000000012', 1400, 100, 'One washer', now() - interval '3 hours', now() - interval '1 hour', 'accepted', now() - interval '1 day', now() - interval '26 hours'),
  ('cccccccc-3000-4000-8000-000000000007', 'cccccccc-2000-4000-8000-000000000007', 'cccccccc-0000-4000-8000-000000000011', 1800, 0, null, now() - interval '3 days', now() - interval '3 days' + interval '2 hours', 'accepted', now() - interval '4 days', now() - interval '4 days')
on conflict (id) do nothing;
-- the open job has a sent quote from the painter-plumber pair (shows "interested/quoted" counts)
insert into public.job_interests (job_id, worker_id) values ('cccccccc-2000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000011') on conflict do nothing;

update public.jobs set status = 'in_progress', accepted_quote_id = 'cccccccc-3000-4000-8000-000000000001', accepted_worker_id = 'cccccccc-0000-4000-8000-000000000011', started_at = now() - interval '1 hour', under_review_reason = 'report_unsafe', updated_at = now() - interval '12 minutes' where id = 'cccccccc-2000-4000-8000-000000000001';
update public.jobs set status = 'disputed', accepted_quote_id = 'cccccccc-3000-4000-8000-000000000002', accepted_worker_id = 'cccccccc-0000-4000-8000-000000000012', started_at = now() - interval '1 day', completed_at = now() - interval '20 hours', updated_at = now() - interval '3 hours' where id = 'cccccccc-2000-4000-8000-000000000002';
update public.jobs set status = 'scheduled', accepted_quote_id = 'cccccccc-3000-4000-8000-000000000004', accepted_worker_id = 'cccccccc-0000-4000-8000-000000000012', scheduled_start = now() + interval '1 day', scheduled_end = now() + interval '1 day 2 hours', updated_at = now() - interval '5 hours' where id = 'cccccccc-2000-4000-8000-000000000004';
update public.jobs set status = 'scheduled', accepted_quote_id = 'cccccccc-3000-4000-8000-000000000005', accepted_worker_id = 'cccccccc-0000-4000-8000-000000000013', scheduled_start = now() + interval '1 day', scheduled_end = now() + interval '1 day 6 hours', updated_at = now() - interval '5 hours' where id = 'cccccccc-2000-4000-8000-000000000005';
update public.jobs set status = 'completed', accepted_quote_id = 'cccccccc-3000-4000-8000-000000000006', accepted_worker_id = 'cccccccc-0000-4000-8000-000000000012', started_at = now() - interval '3 hours', completed_at = now() - interval '1 hour', updated_at = now() - interval '1 hour' where id = 'cccccccc-2000-4000-8000-000000000006';
update public.jobs set status = 'cash_collected', accepted_quote_id = 'cccccccc-3000-4000-8000-000000000007', accepted_worker_id = 'cccccccc-0000-4000-8000-000000000011', started_at = now() - interval '3 days', completed_at = now() - interval '3 days' + interval '2 hours', updated_at = now() - interval '1 day' where id = 'cccccccc-2000-4000-8000-000000000007';

insert into public.cash_records (job_id, agreed_amount, worker_amount, worker_recorded_at, resident_amount, resident_confirmed_at, matched, quote_difference) values
  ('cccccccc-2000-4000-8000-000000000001', 3200, null, null, null, null, null, null),
  ('cccccccc-2000-4000-8000-000000000002', 2800, 3300, now() - interval '19 hours', 2800, now() - interval '18 hours', false, null),
  ('cccccccc-2000-4000-8000-000000000004', 1500, null, null, null, null, null, null),
  ('cccccccc-2000-4000-8000-000000000005', 18000, null, null, null, null, null, null),
  ('cccccccc-2000-4000-8000-000000000006', 1500, 1500, now() - interval '30 minutes', null, null, null, null),
  ('cccccccc-2000-4000-8000-000000000007', 1800, 1800, now() - interval '3 days', 1800, now() - interval '3 days', true, 0)
on conflict do nothing;

-- Reports, a call and a note, a pending cancellation request ------------------------------------------------------------
insert into public.reports (id, job_id, reporter_id, against_id, reporter_role, kind, reason_text, status, created_at) values
  ('cccccccc-4000-4000-8000-000000000001', 'cccccccc-2000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000011', 'cccccccc-0000-4000-8000-000000000001', 'worker', 'unsafe', 'The customer''s relative is shouting at me and blocking the door. I want to leave but my tools are inside.', 'new', now() - interval '12 minutes'),
  ('cccccccc-4000-4000-8000-000000000002', 'cccccccc-2000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000012', 'resident', 'cash_price', 'He asked for more money than the quote. I paid but I was not happy.', 'in_review', now() - interval '3 hours'),
  ('cccccccc-4000-4000-8000-000000000003', 'cccccccc-2000-4000-8000-000000000007', 'cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000011', 'resident', 'poor_work', 'The drain is slow again after two days.', 'new', now() - interval '2 days')
on conflict (id) do nothing;
update public.reports set assigned_to = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' where id = 'cccccccc-4000-4000-8000-000000000002';
insert into public.report_calls (report_id, called_id, called_by, outcome) values
  ('cccccccc-4000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Resident confirms the extra amount was asked for.');
insert into public.report_notes (report_id, author_id, note) values
  ('cccccccc-4000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Will call the worker tomorrow morning.');
insert into public.cancellation_requests (job_id, requester_id, requester_role, reason_code, details) values
  ('cccccccc-2000-4000-8000-000000000005', 'cccccccc-0000-4000-8000-000000000003', 'resident', 'schedule_conflict', 'We are travelling that week.');

-- Reviews (the trigger recomputes each worker's average) ----------------------------------------------------------------
insert into public.reviews (job_id, resident_id, worker_id, behaviour, completeness, quality, hire_again, comment) values
  ('cccccccc-2000-4000-8000-000000000007', 'cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000011', 5, 5, 5, true, 'On time, tidy, and the price was exactly what he quoted.'),
  ('cccccccc-2000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000012', 2, 2, 3, false, 'He asked for more money than the quote. I paid but I was not happy.')
on conflict do nothing;

-- Helpline calls and a staff note ----------------------------------------------------------------------------------------
insert into public.helpline_calls (called_at, caller_name, caller_phone, caller_role, reason, outcome, notes, report_id, logged_by) values
  (now() - interval '25 minutes', 'Usman Khan [FAKE]', '03214567890', 'worker', 'unsafe', 'callback_pending', 'Feels unsafe at the job.', 'cccccccc-4000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  (now() - interval '2 hours', 'Maryam Siddiqui [FAKE]', '03335550187', 'resident', 'question', 'answered', 'Asked how verification works.', null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  (now() - interval '5 hours', 'Rashid Mehmood [FAKE]', '03125550142', 'worker', 'cash_price', 'advised', 'Asked what to do if the price changes.', null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
insert into public.staff_notes (profile_id, author_id, note) values
  ('cccccccc-0000-4000-8000-000000000011', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Documents checked. Police certificate valid until Mar 2027.');

commit;
