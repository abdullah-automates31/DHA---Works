-- Migration 0031: accept_job (claim-and-lock). A worker accepts an open job with a price; it is scheduled at once.
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
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'w2@test.dev'),
  ('00000000-0000-0000-0000-0000000000b3', 'authenticated', 'authenticated', 'w3@test.dev'),
  ('00000000-0000-0000-0000-0000000000b4', 'authenticated', 'authenticated', 'w4@test.dev');
insert into public.profiles (id, role, full_name, email, phone, verification_status) values
  ('00000000-0000-0000-0000-0000000000a1', 'resident', 'Rida One', 'res1@test.dev', '03001110001', 'approved'),
  ('00000000-0000-0000-0000-0000000000b1', 'worker', 'Usman One', 'w1@test.dev', '03003334444', 'approved'),
  ('00000000-0000-0000-0000-0000000000b2', 'worker', 'Bilal Two', 'w2@test.dev', '03005556666', 'approved'),
  ('00000000-0000-0000-0000-0000000000b3', 'worker', 'Wrong Trade', 'w3@test.dev', '03007778888', 'approved'),
  ('00000000-0000-0000-0000-0000000000b4', 'worker', 'Not Approved', 'w4@test.dev', '03009990000', 'incomplete');
insert into public.worker_details (profile_id) values
  ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000b3'), ('00000000-0000-0000-0000-0000000000b4');
insert into public.worker_categories (worker_id, category_id) values
  ('00000000-0000-0000-0000-0000000000b1', 1), ('00000000-0000-0000-0000-0000000000b2', 1),
  ('00000000-0000-0000-0000-0000000000b3', 2), ('00000000-0000-0000-0000-0000000000b4', 1);
insert into public.worker_areas (worker_id, phase) select id, 6 from public.profiles where role = 'worker' and id::text like '00000000-0000-0000-0000-%';

create function tests.make_job(p_title text, p_n text) returns uuid
language plpgsql as $$
declare
  v_job uuid;
  v_addr uuid;
begin
  perform tests.act('00000000-0000-0000-0000-0000000000a1');
  v_addr := public.upsert_address(null, 'Home' || p_n, 6::smallint, 'Lane 4', '12-C', '2nd', false);
  v_job := public.save_job_draft(null, 1::smallint, v_addr, p_title, 'Needs fixing today', 'asap', null, null, null, null,
                                 array['00000000-0000-0000-0000-0000000000a1/p' || p_n || '.jpg']);
  perform public.post_job(v_job);
  perform tests.back();
  return v_job;
end $$;

create temp table t as
select tests.make_job('Job A', '1') as a, tests.make_job('Job B', '2') as b, tests.make_job('Job C', '3') as c;
grant select on t to authenticated;

-- ---------------------------------------------------------------- happy path
select tests.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$ select public.accept_job((select a from t), 3000, 500, 'pipes') $$, 'an approved matching worker can accept an open job');
select tests.back();

select is((select status::text from public.jobs where id = (select a from t)), 'scheduled', 'the job is scheduled at once');
select is((select accepted_worker_id from public.jobs where id = (select a from t)), '00000000-0000-0000-0000-0000000000b1'::uuid, 'it is locked to the worker');
select is((select count(*)::int from public.quotes where job_id = (select a from t) and status = 'accepted'), 1, 'one accepted quote exists');
select is((select agreed_amount from public.cash_records where job_id = (select a from t)), 3500, 'agreed amount = labour + materials');
select is((select accepted_quote_id from public.jobs where id = (select a from t)), (select id from public.quotes where job_id = (select a from t) and status = 'accepted'), 'accepted_quote_id points at the quote');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and type = 'job_accepted' and job_id = (select a from t)), 1, 'the resident is notified');
select is((select payload ->> 'title' from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and type = 'job_accepted' and job_id = (select a from t)), 'Job A', 'the notification carries the title only');
select ok(not exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and type = 'job_accepted' and payload::text ilike '%Usman%'), 'the notification does not name the worker');

-- the worker sees it as theirs with the resident details unlocked
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select is_mine from public.worker_jobs where id = (select a from t)), true, 'worker_jobs shows it as mine');
select is((select resident_name from public.worker_jobs where id = (select a from t)), 'Rida One', 'resident details unlock after accepting');
select tests.back();

-- ---------------------------------------------------------------- second worker loses
select tests.act('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$ select public.accept_job((select a from t), 100) $$, 'this job is not available', 'a second worker cannot take a locked job');
select is((select count(*)::int from public.worker_feed where id = (select a from t)), 0, 'a locked job leaves the feed');
select tests.back();

-- ---------------------------------------------------------------- who may not accept
select tests.act('00000000-0000-0000-0000-0000000000b3');
select throws_ok($$ select public.accept_job((select b from t), 100) $$, 'this job is not available', 'a worker of another trade cannot accept');
select tests.act('00000000-0000-0000-0000-0000000000b4');
select throws_ok($$ select public.accept_job((select b from t), 100) $$, 'your account is not approved yet', 'an unapproved worker cannot accept');
select tests.act('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.accept_job((select b from t), 100) $$, 'this action is not available for your account type', 'a resident cannot call accept_job');
select tests.back();
set local role anon;
select throws_ok($$ select public.accept_job((select b from t), 100) $$, '42501', null, 'anon cannot call accept_job');
reset role;

select tests.act('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.accept_job((select b from t), 0, 0) $$, 'enter a price', 'a zero price is refused');
select throws_ok($$ select public.accept_job((select b from t), -5, 100) $$, 'amounts cannot be negative', 'a negative price is refused');
select throws_ok($$ select public.accept_job(gen_random_uuid(), 100) $$, 'this job is not available', 'an unknown job is refused');
select tests.back();

update public.jobs set posted_at = now() - interval '30 hours' where id = (select c from t);
select tests.act('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.accept_job((select c from t), 100) $$, 'this job has expired', 'an expired job cannot be accepted');
select tests.back();

-- ---------------------------------------------------------------- the material bill rule still applies
select tests.act('00000000-0000-0000-0000-0000000000b1');
select public.start_job((select a from t));
select throws_ok($$ select public.complete_job((select a from t), null) $$, 'upload the material bill', 'materials above 0 still need the bill at completion');
select tests.back();

-- ---------------------------------------------------------------- replace worker, then someone else accepts
create temp table t2 as select tests.make_job('Job D', '4') as d;
grant select on t2 to authenticated;
select tests.act('00000000-0000-0000-0000-0000000000b1');
select public.accept_job((select d from t2), 2000);
select tests.act('00000000-0000-0000-0000-0000000000a1');
select public.replace_worker((select d from t2), 'too expensive');
select tests.back();
select is((select status::text from public.jobs where id = (select d from t2)), 'open', 'replace_worker reopens the job');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-0000000000b1' and type = 'quote_rejected' and job_id = (select d from t2)), 1, 'the replaced worker is told');

select tests.act('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.accept_job((select d from t2), 100) $$, 'the resident did not accept your quote on this job', 'the replaced worker cannot take it again');
select tests.act('00000000-0000-0000-0000-0000000000b2');
select lives_ok($$ select public.accept_job((select d from t2), 2500) $$, 'another worker can take the reopened job');
select tests.back();
select is((select agreed_amount from public.cash_records where job_id = (select d from t2)), 2500, 'agreed amount follows the new worker (stale cash row replaced)');
select is((select accepted_worker_id from public.jobs where id = (select d from t2)), '00000000-0000-0000-0000-0000000000b2'::uuid, 'locked to the new worker');

-- ---------------------------------------------------------------- an old-style quote loses when someone accepts
create temp table t3 as select tests.make_job('Job E', '5') as e;
grant select on t3 to authenticated;
select tests.act('00000000-0000-0000-0000-0000000000b2');
select public.express_interest((select e from t3));
select public.submit_quote((select e from t3), 1500);
select tests.act('00000000-0000-0000-0000-0000000000b1');
select public.accept_job((select e from t3), 1800);
select tests.back();
select is((select status::text from public.quotes where job_id = (select e from t3) and worker_id = '00000000-0000-0000-0000-0000000000b2'), 'not_selected', 'an earlier sent quote becomes not_selected');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-0000000000b2' and type = 'quote_not_selected' and job_id = (select e from t3)), 1, 'that worker is told');

select * from finish();
rollback;
