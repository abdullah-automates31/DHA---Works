-- Migration 0040: admin_dashboard(). Wrong callers first, then the numbers on a small known data set.
begin;
select no_plan();

create schema tests;
grant usage on schema tests to authenticated;
create function tests.act(p_uid uuid, p_session uuid default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'session_id', coalesce(p_session, p_uid))::text, true);
  execute 'set local role authenticated';
end $$;
create function tests.back() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end $$;
grant execute on function tests.act(uuid, uuid), tests.back() to authenticated;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin@test.dev'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'res@test.dev'),
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'w1@test.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'w2@test.dev'),
  ('00000000-0000-0000-0000-0000000000b3', 'authenticated', 'authenticated', 'w3@test.dev'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'res2@test.dev');
insert into public.profiles (id, role, full_name, email, phone, verification_status, verification_updated_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin', 'Staff A', 'admin@test.dev', '03009990001', 'approved', null),
  ('00000000-0000-0000-0000-0000000000c1', 'resident', 'Rida Resident', 'res@test.dev', '03001110001', 'approved', null),
  ('00000000-0000-0000-0000-0000000000b1', 'worker', 'Ali Raza', 'w1@test.dev', '03213334444', 'approved', null),
  ('00000000-0000-0000-0000-0000000000b2', 'worker', 'Imran Waiting', 'w2@test.dev', '03005556666', 'pending', now() - interval '20 hours'),
  ('00000000-0000-0000-0000-0000000000b3', 'worker', 'Zubair Waiting', 'w3@test.dev', '03339990005', 'pending', now() - interval '5 hours'),
  ('00000000-0000-0000-0000-0000000000c2', 'resident', 'Maryam Waiting', 'res2@test.dev', '03001110002', 'pending', now() - interval '9 hours');
insert into public.worker_details (profile_id) values ('00000000-0000-0000-0000-0000000000b1');
insert into public.worker_categories (worker_id, category_id) values ('00000000-0000-0000-0000-0000000000b1', 1);
insert into public.worker_areas (worker_id, phase) values ('00000000-0000-0000-0000-0000000000b1', 6);
insert into auth.sessions (id, user_id) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-0000000000a1');
insert into public.admin_verified_sessions (session_id, user_id) values ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-0000000000a1');

create function tests.make_job(p_title text, p_n text) returns uuid language plpgsql as $$
declare v_job uuid; v_addr uuid;
begin
  perform tests.act('00000000-0000-0000-0000-0000000000c1');
  v_addr := public.upsert_address(null, 'Home' || p_n, 6::smallint, 'Lane 4', '12-C', '2nd', false);
  v_job := public.save_job_draft(null, 1::smallint, v_addr, p_title, 'Needs fixing today', 'asap', null, null, null, null,
                                 array['00000000-0000-0000-0000-0000000000c1/p' || p_n || '.jpg']);
  perform public.post_job(v_job);
  perform tests.back();
  return v_job;
end $$;
create temp table t as select
  tests.make_job('Open job', '1') as j_open, tests.make_job('Scheduled job', '2') as j_sched, tests.make_job('Progress job', '3') as j_prog,
  tests.make_job('Cash job', '4') as j_cash, tests.make_job('Stuck job', '5') as j_stuck, tests.make_job('Old job', '6') as j_old;
grant select on t to authenticated;

-- 1. Wrong callers ------------------------------------------------------------------------------------------------------
select tests.act('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000a102');   -- admin, password only
select throws_ok($$select public.admin_dashboard()$$, '42501', 'not available', 'a password-only admin session is refused');
select tests.back();
select tests.act('00000000-0000-0000-0000-0000000000c1');
select throws_ok($$select public.admin_dashboard()$$, '42501', 'not available', 'a resident is refused');
select tests.back();
select tests.act('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.admin_dashboard()$$, '42501', 'not available', 'a worker is refused');
select tests.back();
select is(has_function_privilege('anon', 'public.admin_dashboard()', 'execute'), false, 'anon cannot run it');

-- 2. Put the jobs in different stages (as the database owner; the stage rules are tested elsewhere) -----------------------
update public.jobs set status = 'scheduled' where id = (select j_sched from t);
update public.jobs set status = 'in_progress' where id = (select j_prog from t);
update public.jobs set status = 'cash_collected' where id = (select j_cash from t);
update public.jobs set status = 'in_progress', stuck_since = now() - interval '30 hours', stuck_reason = 'no update from worker' where id = (select j_stuck from t);
update public.jobs set status = 'disputed', posted_at = now() - interval '3 days' where id = (select j_old from t);
insert into public.reports (job_id, reporter_id, against_id, reporter_role, kind) values
  ((select j_prog from t), '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'worker', 'unsafe'),
  ((select j_cash from t), '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'resident', 'poor_work'),
  ((select j_old from t), '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'resident', 'no_show');
update public.reports set status = 'resolved', action = 'no_action', resolved_at = now() where kind = 'no_show';
insert into public.cancellation_requests (job_id, requester_id, requester_role, reason_code) values
  ((select j_sched from t), '00000000-0000-0000-0000-0000000000c1', 'resident', 'schedule_conflict');

-- 3. The numbers --------------------------------------------------------------------------------------------------------
select tests.act('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000a101');
create temp table d as select public.admin_dashboard() as j;
grant select on d to authenticated;
select is((select j -> 'workers_pending' ->> 'count' from d), '2', 'two workers are waiting');
select ok((select (j -> 'workers_pending' ->> 'oldest_since')::timestamptz from d) < now() - interval '19 hours', 'the oldest waiting worker is the 20-hour one');
select is((select j -> 'residents_pending' ->> 'count' from d), '1', 'one resident is waiting');
select is((select j -> 'reports_open' ->> 'count' from d), '2', 'two reports are open (the resolved one is not counted)');
select is((select j -> 'reports_open' ->> 'unsafe' from d), '1', 'one of them is unsafe');
select is((select j -> 'jobs_today' ->> 'count' from d), '5', 'five jobs were posted today (the 3-day-old one is not)');
select is((select j -> 'jobs_today' ->> 'in_progress' from d), '2', 'two jobs are in progress now');
select is((select j -> 'stages' from d), '{"open":1,"scheduled":1,"in_progress":2,"completed":0,"cash_collected":1,"disputed":1}'::jsonb, 'jobs by stage');
select is((select jsonb_array_length(j -> 'attention') from d), 7, 'needs attention: 2 reports + 3 applications + 1 cancellation + 1 stuck job');
select is((select j -> 'attention' -> 0 ->> 'kind' from d), 'unsafe', 'the unsafe report is first');
select is((select j -> 'attention' -> 1 ->> 'kind' from d), 'stuck', 'then the oldest of the rest: the job stuck for 30 hours');
select is((select j -> 'attention' -> 2 ->> 'kind' from d), 'worker', 'then the worker waiting 20 hours');
select is((select j -> 'attention' -> 2 ->> 'title' from d), 'Imran Waiting is waiting for review', 'with the name');
select ok((select bool_and(e ->> 'id' is not null and e ->> 'title' is not null and e ->> 'since' is not null) from d, jsonb_array_elements(j -> 'attention') e), 'every item has an id, a title and a time');
select is((select count(*) from d, jsonb_array_elements(j -> 'attention') e where e ->> 'kind' = 'stuck'), 1::bigint, 'the stuck job is listed');
select is((select count(*) from d, jsonb_array_elements(j -> 'attention') e where e ->> 'kind' = 'cancellation'), 1::bigint, 'the cancellation request is listed');
select ok((select position('0300' in j::text) = 0 and position('1111' in j::text) = 0 from d), 'no phone number or CNIC leaks into the summary');

-- The list is capped at 10 ------------------------------------------------------------------------------------------------
select tests.back();
insert into auth.users (id, aud, role, email) select ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid, 'authenticated', 'authenticated', 'bulk' || g || '@test.dev' from generate_series(1, 15) g;
insert into public.profiles (id, role, full_name, email, phone, verification_status, verification_updated_at)
select ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid, 'resident', 'Bulk ' || g, 'bulk' || g || '@test.dev', '0310000' || lpad(g::text, 4, '0'), 'pending', now() - (g || ' minutes')::interval from generate_series(1, 15) g;
select tests.act('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000a101');
select is(jsonb_array_length(public.admin_dashboard() -> 'attention'), 10, 'at most ten items are listed however many are waiting');
select is((public.admin_dashboard() -> 'residents_pending' ->> 'count'), '16', 'but the count still shows all 16 waiting residents');
select tests.back();

select * from finish();
rollback;
