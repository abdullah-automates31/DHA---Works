-- Edge cases and security checks: resident isolation, cancellation requests, report rules,
-- hourly sweeps and storage policies (docs/DB-API-DESIGN.md sections 5, 7, 9).
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

-- People: residents a1 and a2, approved workers b1 and b2, pending worker b3, incomplete worker b4, admin c1.
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'res1@test.dev'),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'res2@test.dev'),
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'w1@test.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'w2@test.dev'),
  ('00000000-0000-0000-0000-0000000000b3', 'authenticated', 'authenticated', 'w3@test.dev'),
  ('00000000-0000-0000-0000-0000000000b4', 'authenticated', 'authenticated', 'w4@test.dev'),
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'admin@test.dev');

insert into public.profiles (id, role, full_name, email, phone, verification_status) values
  ('00000000-0000-0000-0000-0000000000a1', 'resident', 'Rida One', 'res1@test.dev', '03001110001', 'approved'),
  ('00000000-0000-0000-0000-0000000000a2', 'resident', 'Rana Two', 'res2@test.dev', '03001110002', 'approved'),
  ('00000000-0000-0000-0000-0000000000b1', 'worker', 'Usman One', 'w1@test.dev', '03003334444', 'approved'),
  ('00000000-0000-0000-0000-0000000000b2', 'worker', 'Bilal Two', 'w2@test.dev', '03005556666', 'approved'),
  ('00000000-0000-0000-0000-0000000000b3', 'worker', 'Pending Three', 'w3@test.dev', '03007778888', 'pending'),
  ('00000000-0000-0000-0000-0000000000b4', 'worker', 'Incomplete Four', 'w4@test.dev', '03007779999', 'incomplete'),
  ('00000000-0000-0000-0000-0000000000c1', 'admin', 'Staff', 'admin@test.dev', '03009990000', 'approved');

insert into public.worker_details (profile_id) select id from public.profiles where role = 'worker' and id::text like '00000000-0000-0000-0000-%';
insert into public.worker_categories (worker_id, category_id) select id, 1 from public.profiles where role = 'worker' and id::text like '00000000-0000-0000-0000-%';
insert into public.worker_areas (worker_id, phase) select id, 6 from public.profiles where role = 'worker' and id::text like '00000000-0000-0000-0000-%';

-- One job per resident, driven through the real RPCs up to a given point.
-- p_stop: 'open', 'quoted' (b1 quoted) or 'scheduled' (b1 accepted).
create function tests.make_job(p_resident uuid, p_title text, p_photo text, p_stop text) returns uuid
language plpgsql as $$
declare
  v_job uuid;
  v_addr uuid;
begin
  perform tests.act(p_resident);
  select id into v_addr from public.addresses where resident_id = p_resident limit 1;
  if v_addr is null then
    v_addr := public.upsert_address(null, 'Home', 6::smallint, 'Lane 4', '12-C', '2nd', true);
  end if;
  v_job := public.save_job_draft(null, 1::smallint, v_addr, p_title, 'Needs fixing today', 'asap',
    null, null, null, null, array[p_photo]);
  perform public.post_job(v_job);
  if p_stop in ('quoted', 'scheduled') then
    perform tests.act('00000000-0000-0000-0000-0000000000b1');
    perform public.express_interest(v_job);
    perform public.submit_quote(v_job, 3000, now() + interval '1 day', now() + interval '1 day 2 hours');
  end if;
  if p_stop = 'scheduled' then
    perform tests.act(p_resident);
    perform public.accept_quote((select id from public.quotes where job_id = v_job and status = 'sent'));
  end if;
  perform tests.back();
  return v_job;
end $$;

create temp table t as
select tests.make_job('00000000-0000-0000-0000-0000000000a1', 'A1 scheduled job', '00000000-0000-0000-0000-0000000000a1/p1.jpg', 'scheduled') as sched,
       tests.make_job('00000000-0000-0000-0000-0000000000a1', 'A1 open job', '00000000-0000-0000-0000-0000000000a1/p2.jpg', 'open') as open_job,
       tests.make_job('00000000-0000-0000-0000-0000000000a2', 'A2 open job', '00000000-0000-0000-0000-0000000000a2/p3.jpg', 'open') as a2_job;
grant select on t to authenticated;

-- ---------------------------------------------------------------- residents cannot see each other
select tests.act('00000000-0000-0000-0000-0000000000a2');
select is((select count(*) from public.jobs where title like 'A1 %'), 0::bigint, 'resident 2 cannot read resident 1 jobs');
select is((select count(*) from public.resident_jobs), 1::bigint, 'resident 2 sees only their own job in the list');
select is((select count(*) from public.resident_quotes), 0::bigint, 'resident 2 sees no quotes from resident 1 jobs');
select is((select count(*) from public.job_private), 1::bigint, 'resident 2 reads only their own private details');
select is((select count(*) from public.addresses), 1::bigint, 'resident 2 sees only their own addresses');
select throws_ok($$select public.post_job((select open_job from t))$$, null, null, 'resident 2 cannot post resident 1 draft/job');
select throws_ok($$select public.cancel_job((select open_job from t))$$, null, null, 'resident 2 cannot cancel resident 1 job');
select throws_ok($$select public.file_report((select sched from t), 'other')$$, null, null, 'resident 2 cannot report a job they are not part of');
select throws_ok($$select public.request_cancellation((select sched from t), 'other')$$, null, null, 'resident 2 cannot request cancellation of resident 1 job');

-- Direct writes are not allowed for signed-in users.
select tests.act('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$update public.jobs set status = 'cancelled' where id = (select open_job from t)$$, null, null,
  'status cannot be changed with a direct update');
select throws_ok($$update public.profiles set role = 'admin' where id = auth.uid()$$, null, null, 'a user cannot promote themselves');
select throws_ok($$insert into public.cash_records (job_id, agreed_amount) values ((select sched from t), 1)$$, null, null,
  'cash records cannot be inserted directly');

-- ---------------------------------------------------------------- cancellation requests
select tests.act('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.request_cancellation((select open_job from t), 'other')$$, null, null,
  'cancellation requests need an accepted job');
select tests.act('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$select public.request_cancellation((select sched from t), 'other')$$, null, null,
  'a worker who did not win cannot request cancellation');

select tests.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$select public.request_cancellation((select sched from t), 'schedule_conflict', 'Cannot make it')$$,
  'the accepted worker requests cancellation');
select throws_ok($$select public.request_cancellation((select sched from t), 'other')$$, null, null,
  'only one pending request per job');
select is((select status from public.jobs where id = (select sched from t)), 'scheduled'::public.job_status,
  'requesting cancellation does not change the job status');
select is((select cancellation_pending from public.worker_jobs where id = (select sched from t)), true,
  'the worker view shows the pending request');

select tests.act('00000000-0000-0000-0000-0000000000a1');
select is((select cancellation_pending from public.resident_jobs where id = (select sched from t)), true,
  'the resident view shows the pending request');
select is((select count(*) from public.cancellation_requests), 1::bigint, 'the resident can read the request');
select tests.act('00000000-0000-0000-0000-0000000000a2');
select is((select count(*) from public.cancellation_requests), 0::bigint, 'another resident cannot read it');

select tests.act('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$select public.withdraw_cancellation_request((select id from public.cancellation_requests limit 1))$$, null, null,
  'only the requester can withdraw');
select tests.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$select public.withdraw_cancellation_request((select id from public.cancellation_requests where status = 'pending'))$$,
  'the requester withdraws it');
select lives_ok($$select public.request_cancellation((select sched from t), 'other')$$, 'a new request is possible after withdrawal');

-- ---------------------------------------------------------------- reports
select tests.act('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.file_report((select open_job from t), 'other')$$, null, null,
  'reports are not possible before the job is scheduled');
select lives_ok($$select public.file_report((select sched from t), 'unsafe', 'Behaved badly')$$, 'resident reports an unsafe situation');
select is((select status from public.jobs where id = (select sched from t)), 'scheduled'::public.job_status,
  'an unsafe report does not change the job status');
select is((select under_review_reason from public.resident_jobs where id = (select sched from t)), 'report_unsafe',
  'an unsafe report flags the job for staff');
select tests.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$select public.file_report((select sched from t), 'no_show')$$, 'the worker can also report');
select tests.act('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$select public.file_report((select sched from t), 'other')$$, null, null, 'an uninvolved worker cannot report');

select tests.back();
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-0000000000c1' and type = 'unsafe_report'),
  1::bigint, 'staff are notified of the unsafe report');

-- Window: a job completed more than report_window_days ago can no longer be reported.
update public.jobs set status = 'completed', started_at = now() - interval '9 days', completed_at = now() - interval '8 days'
where id = (select sched from t);
select tests.act('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.file_report((select sched from t), 'poor_work')$$, null, null,
  'the reporting window closes 7 days after completion');
select tests.back();
update public.jobs set completed_at = now() - interval '6 days' where id = (select sched from t);
select tests.act('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.file_report((select sched from t), 'poor_work')$$, 'a report inside the window is accepted');
select tests.back();
-- Put the job back for the sweeps below.
update public.jobs set status = 'scheduled', started_at = null, completed_at = null where id = (select sched from t);

-- ---------------------------------------------------------------- sweeps
-- Expiry: open job older than 24 hours expires, its live quote expires, workers who quoted are told.
select tests.back();
create temp table t2 as
select tests.make_job('00000000-0000-0000-0000-0000000000a2', 'A2 quoted job', '00000000-0000-0000-0000-0000000000a2/p4.jpg', 'quoted') as quoted_job;
update public.jobs set posted_at = now() - interval '21 hours' where id = (select quoted_job from t2);
select private.sweep_expired_jobs();
select is((select status from public.jobs where id = (select quoted_job from t2)), 'quoted'::public.job_status,
  'a job inside 24 hours does not expire');
select is((select count(*) from public.job_events where job_id = (select quoted_job from t2) and event_type = 'expiry_reminder'),
  1::bigint, 'the 20 hour reminder is recorded');
select private.sweep_expired_jobs();
select is((select count(*) from public.job_events where job_id = (select quoted_job from t2) and event_type = 'expiry_reminder'),
  1::bigint, 'the reminder is sent only once');

update public.jobs set posted_at = now() - interval '25 hours' where id = (select quoted_job from t2);
select private.sweep_expired_jobs();
select is((select status from public.jobs where id = (select quoted_job from t2)), 'expired'::public.job_status,
  'a job older than 24 hours expires');
select is((select status from public.quotes where job_id = (select quoted_job from t2)), 'expired'::public.quote_status,
  'its live quote expires with it');
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-0000000000b1' and type = 'job_expired'),
  1::bigint, 'the worker who quoted is told');
select is((select status from public.jobs where id = (select sched from t)), 'scheduled'::public.job_status,
  'accepted jobs never expire');

-- Stuck jobs are flagged, not cancelled, and only once.
update public.jobs set scheduled_start = now() - interval '25 hours', scheduled_end = now() - interval '23 hours'
where id = (select sched from t);
select private.sweep_stuck_jobs();
select is((select stuck_reason from public.jobs where id = (select sched from t)), 'scheduled_not_started',
  'a scheduled job that never started is flagged');
select is((select status from public.jobs where id = (select sched from t)), 'scheduled'::public.job_status,
  'flagging does not change the status');
select is((select count(*) from public.notifications where type = 'job_stuck' and job_id = (select sched from t)), 3::bigint,
  'resident, worker and staff are each told once');

-- Rating reminder: one reminder 24 hours after completion, inside the review window.
update public.jobs set status = 'cash_collected', completed_at = now() - interval '25 hours' where id = (select sched from t);
select private.sweep_rating_reminders();
select private.sweep_rating_reminders();
select is((select count(*) from public.job_events where job_id = (select sched from t) and event_type = 'rating_reminder'),
  1::bigint, 'one rating reminder, not repeated');
update public.jobs set completed_at = now() - interval '9 days' where id = (select sched from t);
delete from public.job_events where job_id = (select sched from t) and event_type = 'rating_reminder';
select private.sweep_rating_reminders();
select is((select count(*) from public.job_events where job_id = (select sched from t) and event_type = 'rating_reminder'),
  0::bigint, 'no reminder once the review window has closed');

-- ---------------------------------------------------------------- storage policies
update public.jobs set status = 'scheduled', completed_at = null where id = (select sched from t);
insert into storage.objects (bucket_id, name, owner) values
  ('job-media', '00000000-0000-0000-0000-0000000000a1/p1.jpg', '00000000-0000-0000-0000-0000000000a1'),
  ('identity', '00000000-0000-0000-0000-0000000000a1/cnic.jpg', '00000000-0000-0000-0000-0000000000a1');

select tests.act('00000000-0000-0000-0000-0000000000a1');
select is((select count(*) from storage.objects where bucket_id = 'job-media'), 1::bigint, 'the owner reads their job photo');
select is((select count(*) from storage.objects where bucket_id = 'identity'), 0::bigint, 'nobody reads identity files back, not even the owner');
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from storage.objects where bucket_id = 'job-media' and name like '00000000-0000-0000-0000-%'), 1::bigint, 'the accepted worker reads the job photo');
select tests.act('00000000-0000-0000-0000-0000000000a2');
select is((select count(*) from storage.objects where bucket_id = 'job-media'), 0::bigint, 'another resident cannot read it');
select tests.act('00000000-0000-0000-0000-0000000000c1');
select is((select count(*) from storage.objects where bucket_id = 'identity' and name like '00000000-0000-0000-0000-%'), 1::bigint, 'staff read identity files');

select tests.act('00000000-0000-0000-0000-0000000000b4');
select lives_ok($$insert into storage.objects (bucket_id, name, owner)
  values ('identity', '00000000-0000-0000-0000-0000000000b4/cnic.jpg', '00000000-0000-0000-0000-0000000000b4')$$,
  'a worker with an incomplete application uploads into their own folder');
select throws_ok($$insert into storage.objects (bucket_id, name, owner)
  values ('identity', '00000000-0000-0000-0000-0000000000a1/evil.jpg', '00000000-0000-0000-0000-0000000000b4')$$, null, null,
  'uploading into someone else''s folder is refused');
select tests.act('00000000-0000-0000-0000-0000000000b3');
select throws_ok($$insert into storage.objects (bucket_id, name, owner)
  values ('identity', '00000000-0000-0000-0000-0000000000b3/cnic.jpg', '00000000-0000-0000-0000-0000000000b3')$$, null, null,
  'documents cannot be added while the application is under review');
select tests.act('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$insert into storage.objects (bucket_id, name, owner)
  values ('worker-media', '00000000-0000-0000-0000-0000000000b4/photo.jpg', '00000000-0000-0000-0000-0000000000a1')$$, null, null,
  'worker-media uploads must go in the uploader''s own folder');

select * from finish();
rollback;
