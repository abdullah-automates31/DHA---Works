-- Test for the PROPOSAL 20261029000019_identity_owner_delete.sql (run by run_proposal_test.sh inside a rolled-back transaction).
select no_plan();
-- Supabase blocks direct SQL deletes on storage tables; allow them in this rolled-back transaction only.
set local storage.allow_delete_query = 'true';

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
  ('00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'w1@test.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'w2@test.dev');
insert into public.profiles (id, role, full_name, email, verification_status) values
  ('00000000-0000-0000-0000-0000000000b1', 'worker', 'One', 'w1@test.dev', 'incomplete'),
  ('00000000-0000-0000-0000-0000000000b2', 'worker', 'Two', 'w2@test.dev', 'incomplete');
insert into storage.objects (bucket_id, name, owner_id) values
  ('identity', '00000000-0000-0000-0000-0000000000b1/old-front.jpg', '00000000-0000-0000-0000-0000000000b1'),
  ('identity', '00000000-0000-0000-0000-0000000000b1/old-back.jpg', '00000000-0000-0000-0000-0000000000b1'),
  ('identity', '00000000-0000-0000-0000-0000000000b2/other.jpg', '00000000-0000-0000-0000-0000000000b2'),
  ('worker-media', '00000000-0000-0000-0000-0000000000b1/photo.jpg', '00000000-0000-0000-0000-0000000000b1');

select tests.act('00000000-0000-0000-0000-0000000000b1');
delete from storage.objects where bucket_id = 'identity' and name = '00000000-0000-0000-0000-0000000000b1/old-front.jpg';
select tests.back();
select is((select count(*) from storage.objects where name = '00000000-0000-0000-0000-0000000000b1/old-front.jpg'), 0::bigint,
  'the owner can delete their own identity file while editable');

select tests.act('00000000-0000-0000-0000-0000000000b1');
delete from storage.objects where bucket_id = 'identity' and name = '00000000-0000-0000-0000-0000000000b2/other.jpg';
select tests.back();
select is((select count(*) from storage.objects where name = '00000000-0000-0000-0000-0000000000b2/other.jpg'), 1::bigint,
  'but not someone else''s file');

-- Reading is limited to the owner's own files, and only while editable (needed for the delete to work).
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from storage.objects where bucket_id = 'identity'), 1::bigint, 'the owner reads only their own remaining identity file while editable');
update storage.objects set name = name || 'x' where bucket_id = 'identity';
select is((select count(*) from storage.objects where bucket_id = 'identity' and name like '%x'), 0::bigint, 'and still cannot rename or overwrite it');
select tests.back();

-- Locked once submitted.
update public.profiles set verification_status = 'pending' where id = '00000000-0000-0000-0000-0000000000b1';
select tests.act('00000000-0000-0000-0000-0000000000b1');
delete from storage.objects where bucket_id = 'identity' and name = '00000000-0000-0000-0000-0000000000b1/old-back.jpg';
select tests.back();
select is((select count(*) from storage.objects where name = '00000000-0000-0000-0000-0000000000b1/old-back.jpg'), 1::bigint,
  'after submission the file can no longer be deleted by its owner');
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from storage.objects where bucket_id = 'identity'), 0::bigint, 'and can no longer be read by its owner');
select tests.back();

-- Other buckets are unaffected by the new policy (worker-media already allowed owner deletes).
update public.profiles set verification_status = 'incomplete' where id = '00000000-0000-0000-0000-0000000000b1';
select tests.act('00000000-0000-0000-0000-0000000000b2');
delete from storage.objects where bucket_id = 'worker-media' and name = '00000000-0000-0000-0000-0000000000b1/photo.jpg';
select tests.back();
select is((select count(*) from storage.objects where bucket_id = 'worker-media' and name = '00000000-0000-0000-0000-0000000000b1/photo.jpg'), 1::bigint, 'one worker cannot delete another''s worker-media file');

select * from finish();
