-- Migration 0025: (A) the customer controls the schedule, (B) rejected and cancelled jobs are hidden from workers in
-- the data layer. Worker-app improvement document, points 4 and 6 (3 Nov).
begin;
select no_plan();

create schema tests;
grant usage on schema tests to authenticated;
create function tests.act(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function tests.back() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end $$;
grant execute on function tests.act(uuid), tests.back() to authenticated;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'res1@test.dev'),
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'w1@test.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'w2@test.dev');
insert into public.profiles (id, role, full_name, email, phone, verification_status) values
  ('00000000-0000-0000-0000-0000000000a1', 'resident', 'Rida One', 'res1@test.dev', '03001110001', 'approved'),
  ('00000000-0000-0000-0000-0000000000b1', 'worker', 'Usman One', 'w1@test.dev', '03003334444', 'approved'),
  ('00000000-0000-0000-0000-0000000000b2', 'worker', 'Bilal Two', 'w2@test.dev', '03005556666', 'approved');
insert into public.worker_details (profile_id) select id from public.profiles where role = 'worker' and id::text like '00000000-0000-0000-0000-%';
insert into public.worker_categories (worker_id, category_id) select id, 1 from public.profiles where role = 'worker' and id::text like '00000000-0000-0000-0000-%';
insert into public.worker_areas (worker_id, phase) select id, 6 from public.profiles where role = 'worker' and id::text like '00000000-0000-0000-0000-%';
insert into public.addresses (id, resident_id, label, phase, lane, plot_no, floor, is_default)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'Home', 6, 'Lane 7', '118-C', 'Ground', true);

-- Jobs inserted directly so the customer's date and time are exact.
--   j1 date + window, j2 date only, j3 ASAP (no date), j4 rejected-quote job, j5 cancelled-after-acceptance job, j6 replaced-worker job
insert into public.jobs (id, resident_id, category_id, address_id, phase, lane, title, description, urgency, preferred_date, window_from, window_to, status, posted_at) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'J1 dated window', 'secret description 1', 'scheduled', current_date + 2, time '10:00', time '12:00', 'open', now()),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'J2 date only',     'secret description 2', 'scheduled', current_date + 3, null, null, 'open', now()),
  ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'J3 asap',          'secret description 3', 'asap', null, null, null, 'open', now()),
  ('00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'J4 rejected',      'secret description 4', 'asap', null, null, null, 'open', now()),
  ('00000000-0000-0000-0000-00000000f005', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'J5 cancelled',     'secret description 5', 'asap', null, null, null, 'open', now()),
  ('00000000-0000-0000-0000-00000000f006', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'J6 replaced',      'secret description 6', 'asap', null, null, null, 'open', now()),
  ('00000000-0000-0000-0000-00000000f007', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'J7 open then cancelled', 'secret description 7', 'asap', null, null, null, 'open', now());
insert into public.job_private (job_id, plot_no, floor, resident_phone)
select id, '118-C', 'Ground', '+923001110001' from public.jobs where title like 'J_ %';
insert into public.job_photos (job_id, storage_path, sort)
select id, '00000000-0000-0000-0000-0000000000a1/' || title || '.jpg', 0 from public.jobs where title like 'J_ %';

-- A worker shows interest and quotes; the quote carries NO visit time (the two arguments are ignored).
create function tests.quote_as(p_worker uuid, p_job uuid) returns void language plpgsql as $$
begin
  perform tests.act(p_worker);
  perform public.express_interest(p_job);
  perform public.submit_quote(p_job, 1000, now() + interval '1 day', now() + interval '1 day 2 hours');
  perform tests.back();
end $$;

-- ================================================================ A. the customer controls the schedule
select tests.quote_as('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f001');
select tests.quote_as('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f002');
select tests.quote_as('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f003');

select ok((select bool_and(visit_start is null and visit_end is null) from public.quotes where worker_id = '00000000-0000-0000-0000-0000000000b1'), 'a quote never stores a worker-chosen visit time');

select tests.act('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.accept_quote((select id from public.quotes where job_id = '00000000-0000-0000-0000-00000000f001'))$$, 'the customer accepts the quote on the dated job');
select lives_ok($$select public.accept_quote((select id from public.quotes where job_id = '00000000-0000-0000-0000-00000000f002'))$$, 'and on the date-only job');
select lives_ok($$select public.accept_quote((select id from public.quotes where job_id = '00000000-0000-0000-0000-00000000f003'))$$, 'and on the ASAP job');
select tests.back();

select is((select scheduled_start from public.jobs where id = '00000000-0000-0000-0000-00000000f001'), ((current_date + 2) + time '10:00') at time zone 'Asia/Karachi', 'the schedule starts at the customer''s chosen time (Karachi)');
select is((select scheduled_end from public.jobs where id = '00000000-0000-0000-0000-00000000f001'), ((current_date + 2) + time '12:00') at time zone 'Asia/Karachi', 'and ends at the customer''s chosen end');
select is((select scheduled_start from public.jobs where id = '00000000-0000-0000-0000-00000000f002'), ((current_date + 3) + time '08:00') at time zone 'Asia/Karachi', 'a date without a window starts at 8 AM');
select is((select scheduled_end - scheduled_start from public.jobs where id = '00000000-0000-0000-0000-00000000f002'), interval '2 hours', 'and lasts two hours');
select ok((select scheduled_start is null and scheduled_end is null from public.jobs where id = '00000000-0000-0000-0000-00000000f003'), 'an ASAP job has no scheduled time (the worker calls the customer)');
select ok((select (payload ->> 'start')::timestamptz = scheduled_start from public.job_events e join public.jobs j on j.id = e.job_id where e.job_id = '00000000-0000-0000-0000-00000000f001' and e.event_type = 'scheduled'), 'the schedule event records the customer''s time');

-- The worker sees the customer's time and cannot change it by any route.
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select scheduled_start from public.worker_jobs where id = '00000000-0000-0000-0000-00000000f001'), ((current_date + 2) + time '10:00') at time zone 'Asia/Karachi', 'the worker sees the customer''s date and time on their job');
select throws_ok($$update public.jobs set scheduled_start = now() where id = '00000000-0000-0000-0000-00000000f001'$$, '42501', null, 'a worker cannot update a job (so cannot reschedule it)');
select throws_ok($$update public.jobs set preferred_date = current_date where id = '00000000-0000-0000-0000-00000000f001'$$, '42501', null, 'nor change the customer''s preferred date');
select throws_ok($$update public.quotes set visit_start = now() where job_id = '00000000-0000-0000-0000-00000000f001'$$, '42501', null, 'nor write a visit time on a quote');
select throws_ok($$insert into public.jobs (resident_id, category_id, phase, lane, title, description) values ('00000000-0000-0000-0000-0000000000b1', 1, 6, 'x', 'sneaky job', 'x')$$, '42501', null, 'nor create jobs');
select tests.back();

-- ================================================================ B1. a rejected worker is shut out of the job
select tests.quote_as('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f004');
select tests.quote_as('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000f004');
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from public.jobs where id = '00000000-0000-0000-0000-00000000f004'), 1::bigint, 'before the rejection the worker reads the job');
select tests.act('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.reject_quote((select id from public.quotes where job_id = '00000000-0000-0000-0000-00000000f004' and worker_id = '00000000-0000-0000-0000-0000000000b1'), 'too expensive')$$, 'the customer rejects w1''s quote');
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from public.jobs where id = '00000000-0000-0000-0000-00000000f004'), 0::bigint, 'the rejected worker cannot read the job through the API');
select is((select count(*) from public.job_photos where job_id = '00000000-0000-0000-0000-00000000f004'), 0::bigint, 'nor its photos');
select ok(not public.can_view_job('00000000-0000-0000-0000-00000000f004'), 'can_view_job says no');
select throws_ok($$select public.record_job_view('00000000-0000-0000-0000-00000000f004')$$, null, 'job not found', 'and the worker cannot register a view');
select throws_ok($$select public.express_interest('00000000-0000-0000-0000-00000000f004')$$, null, null, 'cannot show interest again');
select throws_ok($$select public.submit_quote('00000000-0000-0000-0000-00000000f004', 900)$$, null, null, 'cannot quote again');
select is((select count(*) from public.worker_feed where id = '00000000-0000-0000-0000-00000000f004'), 0::bigint, 'it is not in Open jobs');
select is((select status::text from public.worker_jobs where id = '00000000-0000-0000-0000-00000000f004'), 'open', 'the one worker_jobs row has a neutral status');
select ok((select description is null and lane is null and voice_note_path is null and scheduled_start is null and resident_name is null and resident_phone is null and plot_no is null from public.worker_jobs where id = '00000000-0000-0000-0000-00000000f004'), 'and no description, lane, voice, schedule or customer details');
select is((select my_quote_status::text from public.worker_jobs where id = '00000000-0000-0000-0000-00000000f004'), 'rejected', 'but it still records that the quote was rejected');
select is((select count(*) from public.notifications where type = 'quote_rejected' and job_id = '00000000-0000-0000-0000-00000000f004'), 1::bigint, 'the worker got the rejection notice');
select tests.back();
-- Later news about the job is not sent to the rejected worker; it still reaches the other worker.
select private.notify('00000000-0000-0000-0000-0000000000b1', 'job_cancelled', '00000000-0000-0000-0000-00000000f004');
select private.notify('00000000-0000-0000-0000-0000000000b2', 'job_cancelled', '00000000-0000-0000-0000-00000000f004');
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-0000000000b1' and type = 'job_cancelled'), 0::bigint, 'no further notifications reach the rejected worker');
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-0000000000b2' and type = 'job_cancelled'), 1::bigint, 'other workers are unaffected');
select tests.act('00000000-0000-0000-0000-0000000000b2');
select is((select count(*) from public.jobs where id = '00000000-0000-0000-0000-00000000f004'), 1::bigint, 'the other worker still reads the job');
select tests.act('00000000-0000-0000-0000-0000000000a1');
select is((select count(*) from public.jobs where id = '00000000-0000-0000-0000-00000000f004'), 1::bigint, 'and the customer too');
select tests.back();

-- ================================================================ B2. a cancelled job disappears for the worker
select tests.quote_as('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f005');
select tests.act('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.accept_quote((select id from public.quotes where job_id = '00000000-0000-0000-0000-00000000f005'))$$, 'a job is accepted');
select tests.back();
-- After acceptance only staff cancel a job (there is no staff RPC yet), so this is done by hand in the database.
update public.jobs set status = 'cancelled', cancel_reason = 'staff decision' where id = '00000000-0000-0000-0000-00000000f005';
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from public.worker_jobs where id = '00000000-0000-0000-0000-00000000f005'), 0::bigint, 'it is gone from the accepted worker''s list');
select is((select count(*) from public.jobs where id = '00000000-0000-0000-0000-00000000f005'), 0::bigint, 'and unreadable through the API');
select is((select count(*) from public.job_private where job_id = '00000000-0000-0000-0000-00000000f005'), 0::bigint, 'the plot and phone are gone too');
select is((select count(*) from public.job_photos where job_id = '00000000-0000-0000-0000-00000000f005'), 0::bigint, 'and the photos');
select throws_ok($$select public.start_job('00000000-0000-0000-0000-00000000f005')$$, null, null, 'the worker cannot start a cancelled job');
select is((select count(*) from public.worker_feed where id = '00000000-0000-0000-0000-00000000f005'), 0::bigint, 'it is not in Open jobs');
select tests.act('00000000-0000-0000-0000-0000000000a1');
select is((select status::text from public.jobs where id = '00000000-0000-0000-0000-00000000f005'), 'cancelled', 'the customer still sees their cancelled job');
select tests.back();
select is((select count(*) from public.jobs where id = '00000000-0000-0000-0000-00000000f005' and status = 'cancelled'), 1::bigint, 'the database row keeps its status (staff and the customer need it)');

-- A job cancelled by the customer before anyone was accepted also disappears for a worker who was interested.
select tests.act('00000000-0000-0000-0000-0000000000b2');
select public.express_interest('00000000-0000-0000-0000-00000000f007');
select is((select count(*) from public.worker_jobs where id = '00000000-0000-0000-0000-00000000f007'), 1::bigint, 'w2 has J7 in their list while it is open');
select tests.act('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.cancel_job('00000000-0000-0000-0000-00000000f007', 'changed my mind')$$, 'the customer cancels the open job');
select tests.act('00000000-0000-0000-0000-0000000000b2');
select is((select count(*) from public.worker_jobs where id = '00000000-0000-0000-0000-00000000f007'), 0::bigint, 'it disappears from w2''s list');
select is((select count(*) from public.jobs where id = '00000000-0000-0000-0000-00000000f007'), 0::bigint, 'and cannot be read directly');
select tests.back();

-- ================================================================ B3. a replaced worker, and workers who lost a closed job
select tests.quote_as('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000f006');
select tests.quote_as('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000f006');
select tests.act('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.accept_quote((select id from public.quotes where job_id = '00000000-0000-0000-0000-00000000f006' and worker_id = '00000000-0000-0000-0000-0000000000b2'))$$, 'the customer accepts w2 on J6');
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from public.jobs where id = '00000000-0000-0000-0000-00000000f006'), 0::bigint, 'w1, who lost the closed job to w2, can no longer read it');
select tests.act('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.replace_worker('00000000-0000-0000-0000-00000000f006', 'late')$$, 'the customer replaces w2, so the job reopens');
select tests.act('00000000-0000-0000-0000-0000000000b2');
select is((select count(*) from public.jobs where id = '00000000-0000-0000-0000-00000000f006'), 0::bigint, 'the replaced worker is shut out');
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from public.jobs where id = '00000000-0000-0000-0000-00000000f006'), 1::bigint, 'while w1, who only lost because the job closed, can read the reopened job again');
select tests.back();

select ok(not has_function_privilege('anon', 'public.worker_may_see_job(uuid)', 'execute'), 'anon cannot execute worker_may_see_job');
select ok(not has_function_privilege('anon', 'public.worker_is_rejected_on(uuid)', 'execute'), 'nor worker_is_rejected_on');

select * from finish();
rollback;
