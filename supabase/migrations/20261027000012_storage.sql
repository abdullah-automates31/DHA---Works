-- 0012: private storage buckets and policies. Signed URLs only; nothing is public.
-- Path convention: "<user id>/<file>". The first folder is the owner, so policies can check it.
-- Apps must compress images and keep voice clips to about 30 s (free tier is about 1 GB).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('identity',     'identity',     false,  5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('job-media',    'job-media',    false,  5242880, array['image/jpeg', 'image/png', 'image/webp', 'audio/mp4', 'audio/m4a', 'audio/mpeg', 'audio/aac']),
  ('worker-media', 'worker-media', false,  5242880, array['image/jpeg', 'image/png', 'image/webp', 'audio/mp4', 'audio/m4a', 'audio/mpeg', 'audio/aac']),
  ('report-media', 'report-media', false,  5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- Storage policies run as the caller, who cannot read other profiles, so this check is a function.
create function public.is_approved_worker(p_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles
                 where id = p_id and role = 'worker' and verification_status = 'approved' and account_status = 'active');
$$;
revoke execute on function public.is_approved_worker(uuid) from public, anon;
grant execute on function public.is_approved_worker(uuid) to authenticated;

-- identity: the owner may upload while their verification is still editable, but never read back.
-- Only staff read CNIC, bills and certificates.
create policy identity_owner_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'identity'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles p
                where p.id = (select auth.uid()) and p.verification_status in ('incomplete', 'needs_changes'))
  );
create policy identity_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'identity' and public.is_admin());

-- job-media: the owner uploads; whoever may see the job may read its photos and voice note.
create policy job_media_owner_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'job-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy job_media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'job-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy job_media_read on storage.objects for select to authenticated
  using (
    bucket_id = 'job-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
      or exists (select 1 from public.job_photos ph where ph.storage_path = name and public.can_view_job(ph.job_id))
      or exists (select 1 from public.jobs j where j.voice_note_path = name and public.can_view_job(j.id))
    )
  );

-- worker-media: the worker manages their own files; approved workers' photo and voice intro are
-- readable by signed-in users (residents see them on quotes).
create policy worker_media_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'worker-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy worker_media_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'worker-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy worker_media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'worker-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy worker_media_read on storage.objects for select to authenticated
  using (
    bucket_id = 'worker-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
      or public.is_approved_worker(((storage.foldername(name))[1])::uuid)
    )
  );

-- report-media: the reporter uploads and reads their own evidence; staff read everything.
create policy report_media_owner_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'report-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy report_media_read on storage.objects for select to authenticated
  using (
    bucket_id = 'report-media'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );
