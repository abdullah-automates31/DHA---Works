-- Migrations 0022 (replace_worker) and 0023 (worker_public_profile), both from Shariq Bhai's drafts of 3 Nov.
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
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'res2@test.dev'),
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'w1@test.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'w2@test.dev');
insert into public.profiles (id, role, full_name, email, phone, verification_status) values
  ('00000000-0000-0000-0000-0000000000a1', 'resident', 'Rida One', 'res1@test.dev', '03001110001', 'approved'),
  ('00000000-0000-0000-0000-0000000000a2', 'resident', 'Rana Two', 'res2@test.dev', '03001110002', 'approved'),
  ('00000000-0000-0000-0000-0000000000b1', 'worker', 'Usman One', 'w1@test.dev', '03003334444', 'approved'),
  ('00000000-0000-0000-0000-0000000000b2', 'worker', 'Bilal Two', 'w2@test.dev', '03005556666', 'approved');
insert into public.worker_details (profile_id, about) values
  ('00000000-0000-0000-0000-0000000000b1', 'Plumber for ten years'),
  ('00000000-0000-0000-0000-0000000000b2', null);
insert into public.worker_categories (worker_id, category_id) select id, 1 from public.profiles where role = 'worker' and id::text like '00000000-0000-0000-0000-%';
insert into public.worker_areas (worker_id, phase) select id, 6 from public.profiles where role = 'worker' and id::text like '00000000-0000-0000-0000-%';

create function tests.make_job(p_title text, p_photo text, p_stop text) returns uuid
language plpgsql as $$
declare
  v_job uuid;
  v_addr uuid;
begin
  perform tests.act('00000000-0000-0000-0000-0000000000a1');
  v_addr := public.upsert_address(null, 'Home', 6::smallint, 'Lane 4', '12-C', '2nd', true);
  v_job := public.save_job_draft(null, 1::smallint, v_addr, p_title, 'Needs fixing today', 'asap', null, null, null, null, array[p_photo]);
  perform public.post_job(v_job);
  if p_stop in ('quoted', 'scheduled') then
    perform tests.act('00000000-0000-0000-0000-0000000000b1');
    perform public.express_interest(v_job);
    perform public.submit_quote(v_job, 3000, now() + interval '1 day', now() + interval '1 day 2 hours');
  end if;
  if p_stop = 'scheduled' then
    perform tests.act('00000000-0000-0000-0000-0000000000a1');
    perform public.accept_quote((select id from public.quotes where job_id = v_job and status = 'sent'));
  end if;
  perform tests.back();
  return v_job;
end $$;

create temp table t as
select tests.make_job('Scheduled job', '00000000-0000-0000-0000-0000000000a1/p1.jpg', 'scheduled') as sched,
       tests.make_job('Open job', '00000000-0000-0000-0000-0000000000a1/p2.jpg', 'open') as open_job;
grant select on t to authenticated;

-- ---------------------------------------------------------------- worker_public_profile (before the worker is replaced)
select tests.act('00000000-0000-0000-0000-0000000000a1');
select is((select public.worker_public_profile('00000000-0000-0000-0000-0000000000b1') ->> 'about'), 'Plumber for ten years', 'the resident sees the about text of a worker who quoted');
select is((select jsonb_array_length(public.worker_public_profile('00000000-0000-0000-0000-0000000000b1') -> 'categories')), 1, 'and the trades');
select is((select public.worker_public_profile('00000000-0000-0000-0000-0000000000b1') -> 'phases'), '[6]'::jsonb, 'and the areas');
select is((select public.worker_public_profile('00000000-0000-0000-0000-0000000000b1') -> 'reviews'), '[]'::jsonb, 'reviews are an empty list when there are none');
select throws_ok($$select public.worker_public_profile('00000000-0000-0000-0000-0000000000b2')$$, null, 'worker not found', 'a worker who never quoted this resident cannot be read');
select tests.act('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.worker_public_profile('00000000-0000-0000-0000-0000000000b1')$$, null, 'worker not found', 'another resident cannot read that worker');
select tests.act('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.worker_public_profile('00000000-0000-0000-0000-0000000000b1')$$, null, null, 'a worker cannot call it');
select tests.back();
select ok(not has_function_privilege('anon', 'public.worker_public_profile(uuid)', 'execute'), 'anon cannot execute worker_public_profile');
select ok(not has_function_privilege('anon', 'public.replace_worker(uuid, text)', 'execute'), 'anon cannot execute replace_worker');

-- ---------------------------------------------------------------- replace_worker
select tests.act('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.replace_worker((select sched from t), 'x')$$, null, 'job not found', 'another resident cannot replace the worker');
select tests.act('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.replace_worker((select sched from t), 'x')$$, null, null, 'a worker cannot replace anyone');
select tests.act('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.replace_worker((select open_job from t), 'x')$$, null, 'the worker can only be replaced before the work starts', 'an open job has no worker to replace');
select lives_ok($$select public.replace_worker((select sched from t), 'running late')$$, 'the resident replaces the worker of a scheduled job');
select tests.back();

select is((select status::text from public.jobs where id = (select sched from t)), 'open', 'the job reopens');
select ok((select accepted_worker_id is null and accepted_quote_id is null and scheduled_start is null from public.jobs where id = (select sched from t)), 'the worker, quote and schedule are cleared');
select is((select status::text from public.quotes where job_id = (select sched from t) and worker_id = '00000000-0000-0000-0000-0000000000b1'), 'rejected', 'the replaced worker quote is rejected');
select is((select reject_reason from public.quotes where job_id = (select sched from t)), 'running late', 'with the reason');
select ok(exists (select 1 from public.job_interests where job_id = (select sched from t) and worker_id = '00000000-0000-0000-0000-0000000000b1' and withdrawn_at is not null), 'their interest is withdrawn');
select ok(exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000000b1' and type = 'quote_rejected' and job_id = (select sched from t)), 'they get the quote rejected notification');
select ok(exists (select 1 from public.job_events where job_id = (select sched from t) and event_type = 'worker_replaced'), 'the event is recorded');

select tests.act('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.submit_quote((select sched from t), 2500, now() + interval '1 day', now() + interval '1 day 2 hours')$$, null, null, 'the replaced worker cannot quote the job again');
select tests.act('00000000-0000-0000-0000-0000000000b2');
select lives_ok($$select public.express_interest((select sched from t))$$, 'another worker can take interest in the reopened job');
select tests.act('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.replace_worker((select sched from t), 'again')$$, null, 'the worker can only be replaced before the work starts', 'a reopened job cannot be replaced again');
select tests.back();

select * from finish();
rollback;
