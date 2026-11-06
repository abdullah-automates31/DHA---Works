-- Migration 0032: upload gate and caps, who may read worker-media, text and amount limits.
begin;
select no_plan();

create schema tests;
grant usage on schema tests to authenticated;
create function tests.act(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'session_id', p_uid)::text, true);
  execute 'set local role authenticated';
end $$;
create function tests.back() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end $$;
grant execute on function tests.act(uuid), tests.back() to authenticated;
-- Tries one storage insert as the current role and reports whether it was allowed.
create function tests.try_upload(p_bucket text, p_name text) returns boolean language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name, owner_id) values (p_bucket, p_name, (select auth.uid())::text);
  return true;
exception when others then
  return false;
end $$;
grant execute on function tests.try_upload(text, text) to authenticated;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'res1@test.dev'),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'res2@test.dev'),
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'w1@test.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'w2@test.dev'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'nobody@test.dev'),
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'susp@test.dev'),
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'admin@test.dev');
insert into public.profiles (id, role, full_name, email, phone, verification_status, account_status) values
  ('00000000-0000-0000-0000-0000000000a1', 'resident', 'Rida One', 'res1@test.dev', '03001110001', 'approved', 'active'),
  ('00000000-0000-0000-0000-0000000000a2', 'resident', 'Rana Two', 'res2@test.dev', '03001110002', 'approved', 'active'),
  ('00000000-0000-0000-0000-0000000000b1', 'worker', 'Usman One', 'w1@test.dev', '03003334444', 'approved', 'active'),
  ('00000000-0000-0000-0000-0000000000b2', 'worker', 'Bilal Two', 'w2@test.dev', '03005556666', 'approved', 'active'),
  ('00000000-0000-0000-0000-0000000000d1', 'worker', 'Suspended', 'susp@test.dev', '03007778888', 'approved', 'suspended'),
  ('00000000-0000-0000-0000-0000000000e1', 'admin', 'Staff', 'admin@test.dev', '03009990000', 'approved', 'active');
-- The test admin has passed the second step (migration 0037: is_admin() needs a verified session).
insert into auth.sessions (id, user_id) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1');
insert into public.admin_verified_sessions (session_id, user_id) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1');
insert into public.worker_details (profile_id) values
  ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2'), ('00000000-0000-0000-0000-0000000000d1');
insert into public.worker_categories (worker_id, category_id) select id, 1 from public.profiles where role = 'worker' and id::text like '00000000-0000-0000-0000-%';
insert into public.worker_areas (worker_id, phase) select id, 6 from public.profiles where role = 'worker' and id::text like '00000000-0000-0000-0000-%';

-- ---------------------------------------------------------------- A. upload gate
select tests.act('00000000-0000-0000-0000-0000000000c1');
select is(tests.try_upload('job-media', '00000000-0000-0000-0000-0000000000c1/a.jpg'), false, 'a user with no profile cannot upload to job-media');
select is(tests.try_upload('worker-media', '00000000-0000-0000-0000-0000000000c1/a.jpg'), false, '... nor worker-media');
select is(tests.try_upload('report-media', '00000000-0000-0000-0000-0000000000c1/a.jpg'), false, '... nor report-media');
select is(tests.try_upload('identity', '00000000-0000-0000-0000-0000000000c1/a.jpg'), false, '... nor identity');

select tests.act('00000000-0000-0000-0000-0000000000d1');
select is(tests.try_upload('worker-media', '00000000-0000-0000-0000-0000000000d1/a.jpg'), false, 'a suspended worker cannot upload');

select tests.act('00000000-0000-0000-0000-0000000000a1');
select is(tests.try_upload('job-media', '00000000-0000-0000-0000-0000000000a1/p1.jpg'), true, 'a resident can upload job photos');
select is(tests.try_upload('report-media', '00000000-0000-0000-0000-0000000000a1/r1.jpg'), true, 'a resident can upload report photos');
select is(tests.try_upload('worker-media', '00000000-0000-0000-0000-0000000000a1/x.jpg'), false, 'a resident cannot upload to worker-media');
select is(tests.try_upload('job-media', '00000000-0000-0000-0000-0000000000b1/steal.jpg'), false, 'nobody can write into another user''s folder');

select tests.act('00000000-0000-0000-0000-0000000000b1');
select is(tests.try_upload('worker-media', '00000000-0000-0000-0000-0000000000b1/photo.jpg'), true, 'an approved worker can upload their photo');
select is(tests.try_upload('job-media', '00000000-0000-0000-0000-0000000000b1/bill.jpg'), true, 'a worker can upload a bill');
select is(tests.try_upload('report-media', '00000000-0000-0000-0000-0000000000b1/r.jpg'), true, 'a worker can upload report photos');

-- the cap: fill the worker's report-media folder to the limit as the owner of the files, then one more is refused
select tests.back();
insert into storage.objects (bucket_id, name, owner_id)
select 'report-media', '00000000-0000-0000-0000-0000000000b2/f' || g || '.jpg', '00000000-0000-0000-0000-0000000000b2'
from generate_series(1, 100) g;
select tests.act('00000000-0000-0000-0000-0000000000b2');
select is(tests.try_upload('report-media', '00000000-0000-0000-0000-0000000000b2/over.jpg'), false, 'a user at the file cap cannot upload more');
select is(tests.try_upload('worker-media', '00000000-0000-0000-0000-0000000000b2/ok.jpg'), true, 'the cap is per bucket');
select tests.back();

-- ---------------------------------------------------------------- B. who reads worker-media
insert into storage.objects (bucket_id, name, owner_id) values
  ('worker-media', '00000000-0000-0000-0000-0000000000b1/voice.m4a', '00000000-0000-0000-0000-0000000000b1');

create function tests.visible(p_uid uuid) returns int language plpgsql as $$
declare n int;
begin
  perform tests.act(p_uid);
  select count(*)::int into n from storage.objects where bucket_id = 'worker-media' and name = '00000000-0000-0000-0000-0000000000b1/voice.m4a';
  perform tests.back();
  return n;
end $$;

-- a job of resident 1 with a quote from worker 1
create temp table t as select gen_random_uuid() as job;
grant select on t to authenticated;
select tests.act('00000000-0000-0000-0000-0000000000a1');
select set_config('t.addr', public.upsert_address(null, 'Home', 6::smallint, 'Lane 4', '12-C', '2nd', false)::text, true);
select set_config('t.job', public.save_job_draft(null, 1::smallint, current_setting('t.addr')::uuid, 'Pipe leak', 'Needs fixing today', 'asap', null, null, null, null,
  array['00000000-0000-0000-0000-0000000000a1/p1.jpg'])::text, true);
select public.post_job(current_setting('t.job')::uuid);
select tests.act('00000000-0000-0000-0000-0000000000b1');
select public.express_interest(current_setting('t.job')::uuid);
select public.submit_quote(current_setting('t.job')::uuid, 1000);
select tests.back();

select is(tests.visible('00000000-0000-0000-0000-0000000000b1'), 1, 'the owner reads their own file');
select is(tests.visible('00000000-0000-0000-0000-0000000000a1'), 1, 'a resident who received their quote reads it');
select is(tests.visible('00000000-0000-0000-0000-0000000000a2'), 0, 'a resident with no quote from them cannot');
select is(tests.visible('00000000-0000-0000-0000-0000000000b2'), 0, 'another approved worker cannot');
select is(tests.visible('00000000-0000-0000-0000-0000000000c1'), 0, 'a user with no profile cannot list or read it');
select is(tests.visible('00000000-0000-0000-0000-0000000000e1'), 1, 'staff can');
select ok(not exists (select 1 from pg_proc where proname = 'is_approved_worker' and pronamespace = 'public'::regnamespace), 'the is_approved_worker oracle is gone');

-- ---------------------------------------------------------------- C. limits
select tests.act('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.submit_quote((select gen_random_uuid()), 100) $$, 'this job is not available for quotes', 'sanity: the call path works');
select tests.back();
select throws_ok($$ update public.quotes set note = repeat('x', 501) where job_id = current_setting('t.job')::uuid $$, '23514', null, 'a quote note over 500 characters is refused');
select throws_ok($$ update public.quotes set labour = 10000000 where job_id = current_setting('t.job')::uuid $$, '23514', null, 'a labour amount over Rs 9,999,999 is refused');
select throws_ok($$ update public.quotes set materials_note = repeat('x', 1001) where job_id = current_setting('t.job')::uuid $$, '23514', null, 'a materials note over 1000 characters is refused');
select lives_ok($$ update public.quotes set note = repeat('x', 500), labour = 9999999 where job_id = current_setting('t.job')::uuid $$, 'values at the limit are accepted');
select throws_ok($$ update public.worker_details set visit_fee = 10000000 where profile_id = '00000000-0000-0000-0000-0000000000b1' $$, '23514', null, 'a visit fee over Rs 9,999,999 is refused');

select * from finish();
rollback;
