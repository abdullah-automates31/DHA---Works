-- LOCAL DEVELOPMENT ONLY. A fake staff account and a fake verification queue for trying the admin portal.
-- Never run this against a hosted project: the password below is public on purpose.
--   docker exec -i supabase_db_dha-works psql -U postgres -d postgres < supabase/dev/seed_local_admin.sql
-- Sign in at http://localhost:3000 with  admin@dha-local.test  /  LocalAdmin#2026
-- (the second step: run `supabase functions serve` with ADMIN_MAIL_MODE=dev-log and read the code in its log).
begin;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, encrypted_password, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'admin@dha-local.test', now(), extensions.crypt('LocalAdmin#2026', extensions.gen_salt('bf')), now(), now(),
        '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', '')
on conflict (id) do update set encrypted_password = excluded.encrypted_password, email_confirmed_at = now(), updated_at = now();

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'email',
        '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","email":"admin@dha-local.test","email_verified":true}', now(), now(), now())
on conflict do nothing;

insert into public.profiles (id, role, full_name, email, verification_status, account_status)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'admin', 'Local Staff', 'admin@dha-local.test', 'approved', 'active')
on conflict (id) do update set role = 'admin', account_status = 'active', verification_status = 'approved';

-- A fake queue: three pending workers (one with only references), one pending resident, one worker asked to visit HQ.
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token, phone_change, phone_change_token)
select v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, now(), now(),
       '{"provider":"email","providers":["email"]}', '{}', '', '', '', '', '', '', '', ''
from (values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'q.ali@dha-local.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'q.imran@dha-local.test'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'q.zubair@dha-local.test'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'q.maryam@dha-local.test'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'q.hq@dha-local.test')
) as v(id, email)
on conflict (id) do nothing;

insert into public.profiles (id, role, full_name, email, phone, cnic, verification_status, verification_updated_at) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'worker', 'Ali Raza [FAKE]', 'q.ali@dha-local.test', '03215550114', '42101-1110114-7', 'pending', now() - interval '20 hours'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'worker', 'Imran Qureshi [FAKE]', 'q.imran@dha-local.test', '03005550171', '42101-1110171-9', 'pending', now() - interval '14 hours'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'worker', 'Zubair Ahmed [FAKE]', 'q.zubair@dha-local.test', '03335550192', '42101-1110192-5', 'pending', now() - interval '11 hours'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'resident', 'Maryam Siddiqui [FAKE]', 'q.maryam@dha-local.test', '03335550187', '42201-2220187-3', 'pending', now() - interval '9 hours'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'worker', 'Faisal Mehmood [FAKE]', 'q.hq@dha-local.test', '03125550163', '42101-1110163-2', 'visit_hq', now() - interval '5 hours')
on conflict (id) do update set verification_status = excluded.verification_status, verification_updated_at = excluded.verification_updated_at, verification_reason = null;

insert into public.worker_details (profile_id, experience_years, about, voice_intro_path) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 6, 'Licensed electrician, six years in DHA homes.', null),
  ('bbbbbbbb-0000-4000-8000-000000000002', 4, null, null),
  ('bbbbbbbb-0000-4000-8000-000000000003', 3, null, null),
  ('bbbbbbbb-0000-4000-8000-000000000005', 2, null, null)
on conflict (profile_id) do nothing;
insert into public.worker_categories (worker_id, category_id) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 2), ('bbbbbbbb-0000-4000-8000-000000000002', 1),
  ('bbbbbbbb-0000-4000-8000-000000000003', 3), ('bbbbbbbb-0000-4000-8000-000000000005', 1)
on conflict do nothing;
insert into public.worker_areas (worker_id, phase) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 5), ('bbbbbbbb-0000-4000-8000-000000000001', 6),
  ('bbbbbbbb-0000-4000-8000-000000000002', 6), ('bbbbbbbb-0000-4000-8000-000000000002', 7),
  ('bbbbbbbb-0000-4000-8000-000000000003', 5), ('bbbbbbbb-0000-4000-8000-000000000005', 6)
on conflict do nothing;
insert into public.worker_references (worker_id, name, phone, address) values
  ('bbbbbbbb-0000-4000-8000-000000000003', 'Resident One', '03001230001', 'Phase 5'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'Resident Two', '03001230002', 'Phase 6');
insert into public.addresses (id, resident_id, phase, lane, plot_no, is_default) values
  ('bbbbbbbb-0000-4000-8000-0000000000a4', 'bbbbbbbb-0000-4000-8000-000000000004', 7, 'Lane 3', '45-A', true)
on conflict (id) do nothing;

-- Document rows (the files themselves are uploaded by seed_admin_docs.mjs; without them the screens show "Could not load").
insert into public.verification_documents (profile_id, doc_type, storage_path)
select p.id, d.t::public.document_type, p.id || '/' || d.t || '.png'
from public.profiles p
cross join (values ('cnic_front'), ('cnic_back'), ('police_cert'), ('profile_photo')) as d(t)
where p.id in ('bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000005')
  and not (p.id = 'bbbbbbbb-0000-4000-8000-000000000002' and d.t = 'police_cert')
on conflict (profile_id, doc_type) do nothing;
insert into public.verification_documents (profile_id, doc_type, storage_path)
select 'bbbbbbbb-0000-4000-8000-000000000003', d.t::public.document_type, 'bbbbbbbb-0000-4000-8000-000000000003/' || d.t || '.png'
from (values ('cnic_front'), ('cnic_back'), ('profile_photo')) as d(t)
on conflict (profile_id, doc_type) do nothing;
insert into public.verification_documents (profile_id, doc_type, storage_path)
select 'bbbbbbbb-0000-4000-8000-000000000004', d.t::public.document_type, 'bbbbbbbb-0000-4000-8000-000000000004/' || d.t || '.png'
from (values ('cnic_front'), ('cnic_back'), ('utility_bill')) as d(t)
on conflict (profile_id, doc_type) do nothing;

commit;
