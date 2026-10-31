-- W11 My jobs / W12 Job status: what each worker can read about their jobs, start_job, complete_job (material bill),
-- and the rows behind the timeline. Fixture jobs start with 'W11 ' so other jobs in the database are ignored.
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

insert into auth.users (id, aud, role, email)
select ('00000000-0000-0000-0000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'm' || n || '@test.dev'
from unnest(array['a1', 'b1', 'b2', 'b3']) n;
insert into public.profiles (id, role, full_name, email, phone, verification_status) values
  ('00000000-0000-0000-0000-0000000000a1', 'resident', 'Hira Farooq', 'm1@test.dev', '+923215550148', 'approved'),
  ('00000000-0000-0000-0000-0000000000b1', 'worker', 'Winner Worker', 'm2@test.dev', '+923001110001', 'approved'),
  ('00000000-0000-0000-0000-0000000000b2', 'worker', 'Other Worker', 'm3@test.dev', '+923001110002', 'approved'),
  ('00000000-0000-0000-0000-0000000000b3', 'worker', 'Unrelated Worker', 'm4@test.dev', '+923001110003', 'approved');
insert into public.worker_details (profile_id) select id from public.profiles where id::text like '00000000-0000-0000-0000-0000000000b%';
insert into public.worker_categories (worker_id, category_id) select id, 1 from public.profiles where id::text like '00000000-0000-0000-0000-0000000000b%';
insert into public.worker_areas (worker_id, phase) select id, 6 from public.profiles where id::text like '00000000-0000-0000-0000-0000000000b%';
insert into public.addresses (id, resident_id, label, phase, lane, plot_no, floor, is_default)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'Home', 6, 'Lane 7', '118-C', 'Ground', true);
insert into public.jobs (id, resident_id, category_id, address_id, phase, lane, title, description, urgency, status, posted_at) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'W11 with materials', 'x', 'asap', 'open', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'W11 labour only',   'x', 'asap', 'open', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'W11 cancelled',     'x', 'asap', 'open', now() - interval '1 hour');
insert into public.job_private (job_id, plot_no, floor, resident_phone) select id, '118-C', 'Ground', '+923215550148' from public.jobs where title like 'W11 %';

-- ---------------------------------------------------------------- the flow up to scheduled (real RPCs)
select tests.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$select public.express_interest('00000000-0000-0000-0000-00000000a001')$$, 'w1 shows interest in the job with materials');
select lives_ok($$select public.submit_quote('00000000-0000-0000-0000-00000000a001', 1500, now() + interval '2 hours', now() + interval '4 hours', 1450, 'Pipe and washers', 250, 'Fittings')$$, 'w1 quotes Rs 3,200 with materials');
select lives_ok($$select public.express_interest('00000000-0000-0000-0000-00000000a002')$$, 'w1 shows interest in the labour-only job');
select lives_ok($$select public.submit_quote('00000000-0000-0000-0000-00000000a002', 900, now() + interval '2 hours', now() + interval '4 hours')$$, 'and quotes Rs 900');
select lives_ok($$select public.express_interest('00000000-0000-0000-0000-00000000a003')$$, 'w1 shows interest in a third job');
select tests.act('00000000-0000-0000-0000-0000000000b2');
select lives_ok($$select public.express_interest('00000000-0000-0000-0000-00000000a001')$$, 'w2 shows interest in the first job');
select lives_ok($$select public.submit_quote('00000000-0000-0000-0000-00000000a001', 2500, now() + interval '3 hours', now() + interval '5 hours')$$, 'and quotes Rs 2,500');

-- before acceptance the workers see their own rows but nothing about the resident
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select status::text from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), 'quoted', 'w1 sees the job as quoted');
select is((select my_quote_total from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), 3200, 'with their own total');
select ok((select resident_name is null and resident_phone is null and plot_no is null and floor is null from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'),
  'and no resident name, phone, plot or floor before acceptance');
select is((select count(*) from public.worker_jobs where title like 'W11 %'), 3::bigint, 'w1 lists the three jobs they engaged with');
select tests.act('00000000-0000-0000-0000-0000000000b3');
select is((select count(*) from public.worker_jobs where title like 'W11 %'), 0::bigint, 'a worker who engaged with nothing sees none of them');

-- the resident accepts w1 on the first job and cancels the third
select tests.act('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.accept_quote((select id from public.quotes where worker_id = '00000000-0000-0000-0000-0000000000b1' and job_id = '00000000-0000-0000-0000-00000000a001'))$$, 'the resident accepts w1''s quote');
select lives_ok($$select public.accept_quote((select id from public.quotes where worker_id = '00000000-0000-0000-0000-0000000000b1' and job_id = '00000000-0000-0000-0000-00000000a002'))$$, 'and w1''s quote on the labour-only job');
select lives_ok($$select public.cancel_job('00000000-0000-0000-0000-00000000a003')$$, 'and cancels the third job');

-- ---------------------------------------------------------------- what each worker now sees
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select status::text from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), 'scheduled', 'w1: scheduled');
select ok((select is_mine from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), 'and it is theirs');
select is((select resident_name from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), 'Hira Farooq', 'now the resident name is revealed to the winner');
select is((select plot_no from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), '118-C', 'and the plot');
select is((select resident_phone from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), '+923215550148', 'and the phone (for the Call button)');
select ok((select scheduled_start is not null and scheduled_end > scheduled_start from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), 'with the visit window from the accepted quote');
select is((select status::text from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a003'), 'cancelled', 'a cancelled job stays visible to a worker who engaged with it');

select tests.act('00000000-0000-0000-0000-0000000000b2');
select is((select my_quote_status::text from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), 'not_selected', 'w2: their quote was not selected');
select is((select is_mine from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), false, 'and the job is not theirs');
select ok((select resident_name is null and resident_phone is null and plot_no is null from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), 'and w2 still sees no resident details');

-- ---------------------------------------------------------------- the rows behind the timeline
select tests.act('00000000-0000-0000-0000-0000000000b1');
select ok((select created_at is not null from public.job_interests where job_id = '00000000-0000-0000-0000-00000000a001'), 'the worker reads their own interest time');
select is((select total from public.quotes where job_id = '00000000-0000-0000-0000-00000000a001'), 3200, 'and only their own quote (not the other worker''s)');
select is((select count(*) from public.quotes where job_id = '00000000-0000-0000-0000-00000000a001'), 1::bigint, 'one quote row');
select is((select agreed_amount from public.cash_records where job_id = '00000000-0000-0000-0000-00000000a001'), 3200, 'the agreed cash amount is readable by the winner');
select tests.act('00000000-0000-0000-0000-0000000000b2');
select is((select count(*) from public.cash_records where job_id = '00000000-0000-0000-0000-00000000a001'), 0::bigint, 'but not by the worker who lost');

-- ---------------------------------------------------------------- start_job
select throws_ok($$select public.start_job('00000000-0000-0000-0000-00000000a001')$$, null, 'this job cannot be started', 'the losing worker cannot start the job');
select tests.act('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.start_job('00000000-0000-0000-0000-00000000a001')$$, null, 'this action is not available for your account type', 'the resident cannot start it');
select tests.act('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.complete_job('00000000-0000-0000-0000-00000000a001')$$, null, 'this job cannot be completed', 'a job that has not started cannot be completed');
select lives_ok($$select public.start_job('00000000-0000-0000-0000-00000000a001')$$, 'the winner starts the job');
select is((select status::text from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), 'in_progress', 'it is in progress');
select ok((select started_at is not null from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), 'with a start time');
select throws_ok($$select public.start_job('00000000-0000-0000-0000-00000000a001')$$, null, 'this job cannot be started', 'starting twice is refused');
select tests.back();
select is((select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and type = 'job_started'), 1::bigint, 'the resident was told, once');

-- ---------------------------------------------------------------- complete_job and the material bill
select tests.act('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.complete_job('00000000-0000-0000-0000-00000000a001')$$, null, 'upload the material bill', 'materials in the quote: no bill, no completion');
select throws_ok($$select public.complete_job('00000000-0000-0000-0000-00000000a001', '  ')$$, null, 'upload the material bill', 'a blank bill path does not count');
select throws_ok($$select public.complete_job('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000b2/bill.jpg')$$, null, 'invalid bill path', 'a bill in someone else''s folder is refused');
select is((select status::text from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), 'in_progress', 'refused attempts changed nothing');
select lives_ok($$select public.complete_job('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000b1/bill-1-aa.jpg')$$, 'with a bill in their own folder the job completes');
select is((select status::text from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), 'completed', 'completed');
select ok((select completed_at is not null from public.worker_jobs where id = '00000000-0000-0000-0000-00000000a001'), 'with a completion time');
select tests.back();
select is((select material_bill_path from public.jobs where id = '00000000-0000-0000-0000-00000000a001'), '00000000-0000-0000-0000-0000000000b1/bill-1-aa.jpg', 'the bill path is stored on the job');

-- a labour-only job needs no bill
select tests.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$select public.start_job('00000000-0000-0000-0000-00000000a002')$$, 'the labour-only job starts');
select lives_ok($$select public.complete_job('00000000-0000-0000-0000-00000000a002')$$, 'and completes without a bill');
select is((select material_bill_path from public.worker_jobs wj join public.jobs j on j.id = wj.id where wj.id = '00000000-0000-0000-0000-00000000a002'), null, 'no bill is stored');
select throws_ok($$select public.complete_job('00000000-0000-0000-0000-00000000a002')$$, null, 'this job cannot be completed', 'completing twice is refused');
select tests.act('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$select public.complete_job('00000000-0000-0000-0000-00000000a002')$$, null, 'this job cannot be completed', 'and another worker cannot complete it');

-- the owner of a completed job gets the cash amount to record (agreed amount, no worker entry yet)
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select worker_amount from public.cash_records where job_id = '00000000-0000-0000-0000-00000000a002'), null, 'cash is still to be recorded');
select is((select agreed_amount from public.cash_records where job_id = '00000000-0000-0000-0000-00000000a002'), 900, 'against the agreed Rs 900');
select tests.back();

select * from finish();
rollback;
