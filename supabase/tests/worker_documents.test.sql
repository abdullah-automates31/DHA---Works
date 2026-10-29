-- W03 documents: add_verification_document, set_my_references, who can read the rows, and the identity bucket rules.
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
from unnest(array['b1', 'b2', 'a1', 'c1']) n;
insert into public.profiles (id, role, full_name, email, phone, cnic, verification_status) values
  ('00000000-0000-0000-0000-0000000000b1', 'worker', 'Worker One', 'u1@test.dev', '+923001112222', '42101-1111111-1', 'incomplete'),
  ('00000000-0000-0000-0000-0000000000b2', 'worker', 'Worker Two', 'u2@test.dev', '+923003334444', '42101-2222222-2', 'incomplete'),
  ('00000000-0000-0000-0000-0000000000a1', 'resident', 'Rida', 'u3@test.dev', '+923005556666', '42101-3333333-3', 'incomplete'),
  ('00000000-0000-0000-0000-0000000000c1', 'admin', 'Staff', 'u4@test.dev', '+923007778888', null, 'approved');
insert into public.worker_details (profile_id) values
  ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2');

-- ---------------------------------------------------------------- add_verification_document
select tests.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$select public.add_verification_document('cnic_front', '00000000-0000-0000-0000-0000000000b1/cnic_front-1-aa.jpg')$$, 'records CNIC front');
select lives_ok($$select public.add_verification_document('cnic_back', '00000000-0000-0000-0000-0000000000b1/cnic_back-1-aa.jpg')$$, 'records CNIC back');
select lives_ok($$select public.add_verification_document('police_cert', '00000000-0000-0000-0000-0000000000b1/police_cert-1-aa.pdf')$$, 'records a certificate (PDF)');
select lives_ok($$select public.add_verification_document('profile_photo', '00000000-0000-0000-0000-0000000000b1/profile_photo-1-aa.jpg')$$, 'records the profile photo');
select throws_ok($$select public.add_verification_document('cnic_front', '00000000-0000-0000-0000-0000000000b2/cnic_front-1-aa.jpg')$$,
  null, 'invalid file path', 'a path in someone else''s folder is refused');
select throws_ok($$select public.add_verification_document('cnic_front', 'cnic_front-1-aa.jpg')$$, null, 'invalid file path', 'a path without the user folder is refused');

-- Replacing keeps one row per type and points to the newest file.
select lives_ok($$select public.add_verification_document('cnic_front', '00000000-0000-0000-0000-0000000000b1/cnic_front-2-bb.jpg')$$, 'replacing the front works');
select is((select count(*) from public.verification_documents where doc_type = 'cnic_front'), 1::bigint, 'still one CNIC front row');
select is((select storage_path from public.verification_documents where doc_type = 'cnic_front'),
  '00000000-0000-0000-0000-0000000000b1/cnic_front-2-bb.jpg', 'it points to the newest file');
select is((select count(*) from public.verification_documents), 4::bigint, 'four documents in total');
select tests.back();
select is((select avatar_path from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'),
  '00000000-0000-0000-0000-0000000000b1/profile_photo-1-aa.jpg', 'the profile photo also becomes the avatar');

select tests.act('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.add_verification_document('utility_bill', '00000000-0000-0000-0000-0000000000a1/bill-1.jpg')$$,
  'residents use the same function for their bill');
select tests.back();

-- No profile at all.
insert into auth.users (id, aud, role, email) values ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'u5@test.dev');
select tests.act('00000000-0000-0000-0000-0000000000d1');
select throws_ok($$select public.add_verification_document('cnic_front', '00000000-0000-0000-0000-0000000000d1/x.jpg')$$, null, 'no profile',
  'no profile, no documents');
select tests.back();

-- ---------------------------------------------------------------- who can read the rows
select tests.act('00000000-0000-0000-0000-0000000000b1');
select is((select count(*) from public.verification_documents), 4::bigint, 'the owner reads their own documents while editable');
select tests.act('00000000-0000-0000-0000-0000000000b2');
select is((select count(*) from public.verification_documents), 0::bigint, 'another worker reads none of them');
select tests.act('00000000-0000-0000-0000-0000000000c1');
select ok((select count(*) from public.verification_documents) >= 4, 'staff read all documents');
select tests.back();

-- ---------------------------------------------------------------- references
select tests.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$select public.set_my_references('[
  {"name":"Hira Farooq","phone":"+923215550148","address":"Phase 6, Lane 7"},
  {"name":"Bilal Ahmed","phone":"+923001112222","address":"Phase 5, Lane 2"}]'::jsonb)$$, 'two references are saved');
select is((select count(*) from public.worker_references), 2::bigint, 'two rows');
select lives_ok($$select public.set_my_references('[
  {"name":"Only Name","phone":"","address":"x"},
  {"name":"","phone":"+923001112222","address":"x"},
  {"name":"Kept","phone":"+923215550148","address":"Phase 4"}]'::jsonb)$$, 'entries without a name or a phone are dropped');
select is((select count(*) from public.worker_references), 1::bigint, 'saving replaces the old references');
select is((select name from public.worker_references), 'Kept', 'and keeps only the complete one');
select tests.act('00000000-0000-0000-0000-0000000000b2');
select is((select count(*) from public.worker_references), 0::bigint, 'another worker cannot read references');
select tests.act('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.set_my_references('[]'::jsonb)$$, null, 'this action is not available for your account type',
  'a resident cannot set worker references');
select tests.back();

-- ---------------------------------------------------------------- identity bucket (storage policies)
select tests.act('00000000-0000-0000-0000-0000000000b1');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) values
  ('identity', '00000000-0000-0000-0000-0000000000b1/cnic_front-9-zz.jpg', '00000000-0000-0000-0000-0000000000b1')$$,
  'a worker can upload into their own identity folder while editable');
select throws_ok($$insert into storage.objects (bucket_id, name) values
  ('identity', '00000000-0000-0000-0000-0000000000b2/cnic_front-9-zz.jpg')$$, '42501', null,
  'but not into someone else''s folder');
select is((select count(*) from storage.objects where bucket_id = 'identity'), 0::bigint,
  'the owner cannot read identity files back, not even their own');
select throws_ok($$delete from storage.objects where bucket_id = 'identity'$$, '42501', null, 'and cannot delete them (no delete policy yet)');
select tests.act('00000000-0000-0000-0000-0000000000c1');
select is((select count(*) from storage.objects where bucket_id = 'identity' and name like '00000000-0000-0000-0000-%'), 1::bigint, 'staff can read identity files');
select tests.back();

update public.profiles set verification_status = 'pending' where id = '00000000-0000-0000-0000-0000000000b1';
select tests.act('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$insert into storage.objects (bucket_id, name) values
  ('identity', '00000000-0000-0000-0000-0000000000b1/cnic_back-10-zz.jpg')$$, '42501', null,
  'uploads stop once the application is under review');
select throws_ok($$select public.add_verification_document('cnic_back', '00000000-0000-0000-0000-0000000000b1/cnic_back-10-zz.jpg')$$,
  null, 'documents can only be changed before submission or when staff ask for changes', 'recording a document stops too');
select throws_ok($$select public.set_my_references('[]'::jsonb)$$, null,
  'references can only be changed before submission or when staff ask for changes', 'and so do references');
select is((select count(*) from public.verification_documents), 0::bigint, 'the owner no longer reads their documents after submitting');
select tests.back();

-- Limits of the buckets the app relies on.
select is((select file_size_limit from storage.buckets where id = 'identity'), 5242880::bigint, 'identity files are limited to 5 MB');
select ok((select 'application/pdf' = any (allowed_mime_types) from storage.buckets where id = 'identity'), 'identity allows PDF');
select ok((select not ('application/pdf' = any (allowed_mime_types)) from storage.buckets where id = 'worker-media'), 'worker-media does not allow PDF');
select ok((select not public from storage.buckets where id = 'identity'), 'the identity bucket is private');

select * from finish();
rollback;
