-- W03b / W04: trades, experience, visit fee, voice file, submit_for_review, and what the pending screen reads.
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
select ('00000000-0000-0000-0000-0000000000' || n)::uuid, 'authenticated', 'authenticated', 'u' || n || '@test.dev'
from unnest(array['b1', 'b2', 'a1']) n;
insert into public.profiles (id, role, full_name, email, phone, cnic, gender, date_of_birth, verification_status) values
  ('00000000-0000-0000-0000-0000000000b1', 'worker', 'Worker One', 'u1@test.dev', '+923001112222', '42101-1111111-1', 'male', date '1990-01-01', 'incomplete'),
  ('00000000-0000-0000-0000-0000000000b2', 'worker', 'Worker Two', 'u2@test.dev', '+923003334444', '42101-2222222-2', 'male', date '1990-01-01', 'incomplete'),
  ('00000000-0000-0000-0000-0000000000a1', 'resident', 'Rida', 'u3@test.dev', '+923005556666', '42101-3333333-3', 'female', date '1990-01-01', 'incomplete');
insert into public.worker_details (profile_id) values
  ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2');
insert into public.verification_documents (profile_id, doc_type, storage_path)
select '00000000-0000-0000-0000-0000000000b1', d, '00000000-0000-0000-0000-0000000000b1/' || d
from unnest(array['cnic_front', 'cnic_back', 'profile_photo', 'police_cert']::public.document_type[]) d;

-- ---------------------------------------------------------------- categories are readable and only active ones count
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from public.categories where active), 8::bigint, 'a signed-in worker reads the eight active trades');
select cmp_ok((select count(*) from public.categories), '>=', 8::bigint, 'and the list comes from the database');

-- ---------------------------------------------------------------- set_my_categories
select throws_ok($$select public.set_my_categories(array[]::smallint[])$$, null, 'choose at least one trade', 'an empty selection is refused');
select throws_ok($$select public.set_my_categories(array[99]::smallint[])$$, null, 'unknown or inactive trade', 'an unknown trade is refused');
select lives_ok($$select public.set_my_categories(array[1, 3, 3]::smallint[])$$, 'trades are saved (duplicates ignored)');
select is((select count(*) from public.worker_categories), 2::bigint, 'two distinct trades stored');
select lives_ok($$select public.set_my_categories(array[2]::smallint[])$$, 'saving again replaces the selection');
select is((select array_agg(category_id order by category_id) from public.worker_categories), array[2]::smallint[], 'only the new trade remains');
select tests.act('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.set_my_categories(array[1]::smallint[])$$, null, 'this action is not available for your account type',
  'a customer cannot set worker trades');
select tests.act('00000000-0000-0000-0000-0000000000b2');
select is((select count(*) from public.worker_categories), 0::bigint, 'another worker does not see these trades');
select tests.back();

-- ---------------------------------------------------------------- update_worker_details
select tests.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$select public.update_worker_details(6::smallint, 800, null)$$, 'experience and visit fee are saved');
select is((select experience_years from public.worker_details), 6::smallint, 'experience stored');
select is((select visit_fee from public.worker_details), 800, 'visit fee stored');
select lives_ok($$select public.update_worker_details(null, null, null)$$, 'blank values leave the details unchanged');
select is((select visit_fee from public.worker_details), 800, 'blank fee kept the old fee');
select lives_ok($$select public.update_worker_details(0::smallint, 0, null)$$, 'zero years and a zero fee are allowed');
select throws_ok($$select public.update_worker_details(71::smallint, null, null)$$, '23514', null, 'more than 70 years is refused');
select throws_ok($$select public.update_worker_details(null, -1, null)$$, '23514', null, 'a negative fee is refused');
select throws_ok($$select public.update_worker_details(null, null, '00000000-0000-0000-0000-0000000000b2/voice.m4a')$$, null, 'invalid file path',
  'a voice file in someone else''s folder is refused');
select lives_ok($$select public.update_worker_details(null, null, '00000000-0000-0000-0000-0000000000b1/voice_intro-1-aa.m4a')$$, 'the voice path is saved');
select is((select voice_intro_path from public.worker_details), '00000000-0000-0000-0000-0000000000b1/voice_intro-1-aa.m4a', 'and stored');
select tests.act('00000000-0000-0000-0000-0000000000b2');
select is((select count(*) from public.worker_details where profile_id = '00000000-0000-0000-0000-0000000000b1'), 0::bigint,
  'another worker cannot read these details');
select throws_ok($$update public.worker_details set visit_fee = 1$$, '42501', null, 'details cannot be written directly');
select tests.back();

-- ---------------------------------------------------------------- worker-media voice file rules
select tests.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('worker-media', '00000000-0000-0000-0000-0000000000b1/voice_intro-1-aa.m4a', '00000000-0000-0000-0000-0000000000b1', '{"mimetype":"audio/mp4"}')$$,
  'the worker can upload a voice file into their own folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values
  ('worker-media', '00000000-0000-0000-0000-0000000000b2/voice_intro-1-aa.m4a')$$, '42501', null, 'but not into another folder');
select is((select count(*) from storage.objects where bucket_id = 'worker-media' and name like '00000000-0000-0000-0000-0000000000b1/%'), 1::bigint,
  'the owner can read their own voice file');
select tests.act('00000000-0000-0000-0000-0000000000b2');
select is((select count(*) from storage.objects where bucket_id = 'worker-media' and name like '00000000-0000-0000-0000-0000000000b1/%'), 0::bigint,
  'another (unapproved) worker cannot read it');
select tests.back();
select ok((select 'audio/mp4' = any (allowed_mime_types) from storage.buckets where id = 'worker-media'), 'worker-media accepts m4a (audio/mp4)');
select is((select file_size_limit from storage.buckets where id = 'worker-media'), 5242880::bigint, 'and limits files to 5 MB');

-- ---------------------------------------------------------------- submit_for_review (areas are not needed any more)
select tests.act('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$select public.submit_for_review()$$, null, 'upload both sides of your CNIC', 'a worker without documents cannot submit');
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from public.worker_areas), 0::bigint, 'setup: no areas chosen');
select lives_ok($$select public.submit_for_review()$$, 'a complete application submits without any area');
select tests.back();
select is((select verification_status::text from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 'pending', 'status is pending');
select ok((select verification_updated_at is not null and verification_updated_at > now() - interval '1 minute'
           from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 'the submission time is recorded (shown on the W04 timeline)');
select tests.act('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.submit_for_review()$$, null, 'already submitted', 'a repeat submit is refused with the known message');
select ok((select verification_updated_at is not null from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 'the worker reads the submission time on their own profile');

-- ---------------------------------------------------------------- what W04 reads: settings
select is((select value from public.app_settings where key = 'helpline_enabled'), 'false'::jsonb, 'the helpline is off by default');
select is((select value from public.app_settings where key = 'helpline_number'), '""'::jsonb, 'and has no number');
update public.app_settings set value = 'true'::jsonb where key = 'helpline_enabled';
select is((select value from public.app_settings where key = 'helpline_enabled'), 'false'::jsonb, 'a worker cannot change settings (the update touches no row)');
select tests.back();

select * from finish();
rollback;
