-- W07 Open jobs: what worker_feed returns (matching, order, expiry, exclusions), who can see job photos, and privacy.
-- Fixture jobs all start with 'W07 ' so the test ignores any other jobs in the database (for example the local seed).
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

-- People: a resident; w1 (plumbing + AC, phases 6 and 7), w2 (electrical only), w3 (pending), w4 (approved, no areas).
insert into auth.users (id, aud, role, email)
select ('00000000-0000-0000-0000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'f' || n || '@test.dev'
from unnest(array['a1', 'b1', 'b2', 'b3', 'b4']) n;
insert into public.profiles (id, role, full_name, email, phone, verification_status) values
  ('00000000-0000-0000-0000-0000000000a1', 'resident', 'Feed Resident', 'f1@test.dev', '+923000000010', 'approved'),
  ('00000000-0000-0000-0000-0000000000b1', 'worker', 'Feed Worker One', 'f2@test.dev', '+923000000011', 'approved'),
  ('00000000-0000-0000-0000-0000000000b2', 'worker', 'Feed Worker Two', 'f3@test.dev', '+923000000012', 'approved'),
  ('00000000-0000-0000-0000-0000000000b3', 'worker', 'Feed Worker Three', 'f4@test.dev', '+923000000013', 'pending'),
  ('00000000-0000-0000-0000-0000000000b4', 'worker', 'Feed Worker Four', 'f5@test.dev', '+923000000014', 'approved');
insert into public.worker_details (profile_id)
select id from public.profiles where id::text like '00000000-0000-0000-0000-0000000000b%';
insert into public.worker_categories (worker_id, category_id) values
  ('00000000-0000-0000-0000-0000000000b1', 1), ('00000000-0000-0000-0000-0000000000b1', 3),
  ('00000000-0000-0000-0000-0000000000b2', 2), ('00000000-0000-0000-0000-0000000000b3', 1),
  ('00000000-0000-0000-0000-0000000000b4', 1);
insert into public.worker_areas (worker_id, phase) values
  ('00000000-0000-0000-0000-0000000000b1', 6), ('00000000-0000-0000-0000-0000000000b1', 7),
  ('00000000-0000-0000-0000-0000000000b2', 6), ('00000000-0000-0000-0000-0000000000b3', 6);
insert into public.addresses (id, resident_id, label, phase, lane, plot_no, floor, is_default)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'Home', 6, 'Lane 7', '118-C', 'Ground', true);

-- Jobs (posted_at drives the order). C = category, P = phase.
insert into public.jobs (id, resident_id, category_id, address_id, phase, lane, title, description, urgency, preferred_date, window_from, window_to, status, posted_at)
values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'W07 urgent old',   'x', 'asap',      null, null, null, 'open', now() - interval '5 hours'),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000a1', 3, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'W07 urgent new',   'x', 'asap',      null, null, null, 'open', now() - interval '10 minutes'),
  ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 7, 'Lane 4', 'W07 scheduled new', 'x', 'scheduled', current_date + 1, '16:00', '18:00', 'open', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 7, 'Lane 4', 'W07 scheduled old', 'x', 'scheduled', null, null, null, 'open', now() - interval '8 hours'),
  ('00000000-0000-0000-0000-00000000f005', '00000000-0000-0000-0000-0000000000a1', 2, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'W07 electrical',     'x', 'asap',      null, null, null, 'open', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000f006', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 5, 'Lane 2', 'W07 wrong phase',    'x', 'asap',      null, null, null, 'open', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000f007', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'W07 expired',        'x', 'asap',      null, null, null, 'open', now() - interval '30 hours'),
  ('00000000-0000-0000-0000-00000000f008', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'W07 draft',          'x', 'asap',      null, null, null, 'draft', null),
  ('00000000-0000-0000-0000-00000000f009', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'W07 cancelled',      'x', 'asap',      null, null, null, 'cancelled', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-00000000f00a', '00000000-0000-0000-0000-0000000000a1', 1, '00000000-0000-0000-0000-0000000000d1', 6, 'Lane 7', 'W07 engaged',        'x', 'asap',      null, null, null, 'open', now() - interval '2 hours');
insert into public.job_private (job_id, plot_no, floor, resident_phone)
select id, '118-C', 'Ground', '+923000000010' from public.jobs where title like 'W07 %';
insert into public.job_photos (job_id, storage_path, sort) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000a1/w07-1-0.jpg', 0),
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000a1/w07-1-1.jpg', 1),
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000a1/w07-1-2.jpg', 2),
  ('00000000-0000-0000-0000-00000000f005', '00000000-0000-0000-0000-0000000000a1/w07-5-0.jpg', 0);

-- w1 already showed interest in one job: it leaves their feed.
insert into public.job_interests (job_id, worker_id) values ('00000000-0000-0000-0000-00000000f00a', '00000000-0000-0000-0000-0000000000b1');

-- ---------------------------------------------------------------- what w1 (plumbing + AC, phases 6 and 7) sees
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from public.worker_feed where title like 'W07 %'), 4::bigint, 'w1 sees exactly the four matching open jobs');
select is((select array_agg(title order by urgency, posted_at desc) from public.worker_feed where title like 'W07 %'),
  array['W07 urgent new', 'W07 urgent old', 'W07 scheduled new', 'W07 scheduled old'],
  'order: urgent first, newest first within each group (urgency enum order, then posted_at desc)');
select is((select count(*) from public.worker_feed where title = 'W07 electrical'), 0::bigint, 'another trade is not shown');
select is((select count(*) from public.worker_feed where title = 'W07 wrong phase'), 0::bigint, 'another phase is not shown');
select is((select count(*) from public.worker_feed where title = 'W07 expired'), 0::bigint, 'a job past the 24 hour window is not shown');
select is((select count(*) from public.worker_feed where title in ('W07 draft', 'W07 cancelled')), 0::bigint, 'drafts and cancelled jobs are not shown');
select is((select count(*) from public.worker_feed where title = 'W07 engaged'), 0::bigint, 'a job this worker already engaged with is not shown');

-- the fields the cards use
select is((select urgency::text from public.worker_feed where title = 'W07 scheduled new'), 'scheduled', 'urgency is exposed');
select is((select window_from::text || '-' || window_to::text from public.worker_feed where title = 'W07 scheduled new'), '16:00:00-18:00:00',
  'the preferred time window is exposed as postgres time values');
select is((select preferred_date from public.worker_feed where title = 'W07 scheduled new'), current_date + 1, 'and the preferred date');
select is((select photo_count from public.worker_feed where title = 'W07 urgent old'), 3::bigint, 'photo_count counts all photos');

-- ---------------------------------------------------------------- photos
select is((select count(*) from public.job_photos where job_id = '00000000-0000-0000-0000-00000000f001'), 3::bigint,
  'a matching worker can read the photo rows of a job in their feed');
select is((select array_agg(sort order by sort) from public.job_photos where job_id = '00000000-0000-0000-0000-00000000f001' and sort < 2),
  array[0, 1]::smallint[], 'the first two photos by sort (the two thumbnails)');
select is((select count(*) from public.job_photos where job_id = '00000000-0000-0000-0000-00000000f005'), 0::bigint,
  'but not the photos of a job outside their trades');

-- ---------------------------------------------------------------- privacy
select tests.back();
select is((select count(*) from information_schema.columns
           where table_schema = 'public' and table_name = 'worker_feed'
             and (column_name ~ '(resident|phone|plot|floor|address|cnic|email)' or column_name = 'full_name')),
  0::bigint, 'worker_feed has no resident, phone, plot, floor, address, CNIC or email column');
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from public.job_private where job_id in (select id from public.jobs where title like 'W07 %')), 0::bigint,
  'plot, floor and phone stay hidden from a matching worker before acceptance');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 0::bigint, 'and the resident profile is not readable');

-- ---------------------------------------------------------------- other workers
select tests.act('00000000-0000-0000-0000-0000000000b2');
select is((select array_agg(title) from public.worker_feed where title like 'W07 %'), array['W07 electrical'], 'w2 (electrical) sees only the electrical job');
select tests.act('00000000-0000-0000-0000-0000000000b3');
select is((select count(*) from public.worker_feed where title like 'W07 %'), 0::bigint, 'a worker still under review sees no jobs');
select tests.act('00000000-0000-0000-0000-0000000000b4');
select is((select count(*) from public.worker_feed where title like 'W07 %'), 0::bigint, 'an approved worker with no areas sees no jobs');
select tests.act('00000000-0000-0000-0000-0000000000a1');
select is((select count(*) from public.worker_feed where title like 'W07 %'), 0::bigint, 'a resident gets nothing from the worker feed');
select tests.back();

-- ---------------------------------------------------------------- grants
select ok(has_table_privilege('authenticated', 'public.worker_feed', 'SELECT'), 'signed-in users can read the feed view');
select ok(not has_table_privilege('anon', 'public.worker_feed', 'SELECT'), 'signed-out users cannot');
select ok(not has_table_privilege('authenticated', 'public.worker_feed', 'INSERT, UPDATE, DELETE'), 'and nobody can write to it');

select * from finish();
rollback;
