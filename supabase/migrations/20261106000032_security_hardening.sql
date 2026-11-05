-- 0032: security hardening from the 6 Nov audit of the worker app and its backend.
--  A. Uploads: any signed-in user, even with no profile, could add unlimited files to job-media, worker-media and
--     report-media (5 MB each) and fill the free-tier storage. Now only a registered, active user of the right role may
--     upload, and each user has a file cap per bucket.
--  B. worker-media (profile photo, voice introduction): every signed-in user could list and read approved workers'
--     files. Now only the owner, staff, and a resident who received a quote from that worker.
--  C. Limits: free text and amounts get real upper bounds (the apps already stay inside them).
--  (The profile phone stays editable after approval on purpose: that is an open product question, OPEN-QUESTIONS #9.)

-- ---------------------------------------------------------------------------
-- A. Upload gate
-- ---------------------------------------------------------------------------
-- The caller must be a registered, active user of a role that uses the bucket, and must be under the file cap.
-- Security definer so it can count objects and read profiles whatever the caller's own read rights are.
create function public.can_upload_media(p_bucket text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
           select 1 from public.profiles p
           where p.id = (select auth.uid()) and p.account_status = 'active'
             and p.role = any (case p_bucket
                                 when 'job-media' then array['resident', 'worker']::public.user_role[]
                                 when 'worker-media' then array['worker']::public.user_role[]
                                 when 'report-media' then array['resident', 'worker']::public.user_role[]
                                 when 'identity' then array['resident', 'worker']::public.user_role[]
                                 else array[]::public.user_role[]
                               end))
     and (select count(*) from storage.objects o
          where o.bucket_id = p_bucket and o.name like (select auth.uid())::text || '/%')
         < case p_bucket when 'job-media' then 600 when 'worker-media' then 100 when 'report-media' then 100 when 'identity' then 30 else 0 end;
$$;
revoke execute on function public.can_upload_media(text) from public, anon;
grant execute on function public.can_upload_media(text) to authenticated;

drop policy identity_owner_upload on storage.objects;
create policy identity_owner_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'identity'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.profiles p
                where p.id = (select auth.uid()) and p.verification_status in ('incomplete', 'needs_changes'))
    and public.can_upload_media('identity')
  );

drop policy job_media_owner_upload on storage.objects;
create policy job_media_owner_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_upload_media('job-media')
  );

drop policy worker_media_owner_write on storage.objects;
create policy worker_media_owner_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'worker-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_upload_media('worker-media')
  );

drop policy report_media_owner_upload on storage.objects;
create policy report_media_owner_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_upload_media('report-media')
  );

-- ---------------------------------------------------------------------------
-- B. Who may read a worker's files
-- ---------------------------------------------------------------------------
-- True when the caller is a resident who has received a quote from the worker whose folder this is. Compared as text
-- so a folder name that is not a uuid can never raise an error.
create function public.resident_may_see_worker_media(p_folder text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.quotes q join public.jobs j on j.id = q.job_id
    where q.worker_id::text = p_folder and j.resident_id = (select auth.uid())
  );
$$;
revoke execute on function public.resident_may_see_worker_media(text) from public, anon;
grant execute on function public.resident_may_see_worker_media(text) to authenticated;

drop policy worker_media_read on storage.objects;
create policy worker_media_read on storage.objects for select to authenticated
  using (
    bucket_id = 'worker-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
      or public.resident_may_see_worker_media((storage.foldername(name))[1])
    )
  );

-- Only the old worker-media read rule used it, and it answered "is this uuid an approved worker?" for anyone.
drop function public.is_approved_worker(uuid);

-- ---------------------------------------------------------------------------
-- C. Limits on free text and amounts (checked against the data on DEV first: nothing is over)
-- ---------------------------------------------------------------------------
alter table public.reports
  add constraint reports_reason_text_len check (reason_text is null or char_length(reason_text) <= 1100);
alter table public.quotes
  add constraint quotes_note_len check (note is null or char_length(note) <= 500),
  add constraint quotes_materials_note_len check (materials_note is null or char_length(materials_note) <= 1000),
  add constraint quotes_other_note_len check (other_note is null or char_length(other_note) <= 300),
  add constraint quotes_reject_reason_len check (reject_reason is null or char_length(reject_reason) <= 500),
  add constraint quotes_labour_max check (labour <= 9999999),
  add constraint quotes_materials_max check (materials <= 9999999),
  add constraint quotes_other_amount_max check (other_amount <= 9999999);
alter table public.cancellation_requests
  add constraint cancellation_details_len check (details is null or char_length(details) <= 500),
  add constraint cancellation_decision_note_len check (decision_note is null or char_length(decision_note) <= 1000);
alter table public.cash_records
  add constraint cash_worker_reason_len check (worker_reason is null or char_length(worker_reason) <= 500),
  add constraint cash_worker_amount_max check (worker_amount is null or worker_amount <= 30000000),
  add constraint cash_resident_amount_max check (resident_amount is null or resident_amount <= 30000000),
  add constraint cash_agreed_amount_max check (agreed_amount <= 30000000);
alter table public.worker_details
  add constraint worker_visit_fee_max check (visit_fee is null or visit_fee <= 9999999);
alter table public.worker_references
  add constraint reference_name_len check (char_length(name) <= 100),
  add constraint reference_address_len check (address is null or char_length(address) <= 300),
  add constraint reference_phone_len check (phone is null or char_length(phone) <= 20);
