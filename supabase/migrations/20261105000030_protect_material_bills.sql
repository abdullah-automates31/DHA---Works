-- Material bills are evidence (audit of the worker app, 5 Nov 2026, finding L2).
--
-- Before: the storage rule job_media_owner_delete let a worker delete ANY file in their own job-media folder, including
-- the bill that jobs.material_bill_path points at after Complete Job. A worker could remove the proof the resident
-- relies on. complete_job also trusted the path without checking that a file exists there.
--
-- Now:
--   * a file that jobs.material_bill_path or quotes.material_bill_path points at cannot be deleted through the
--     storage API (a helper that bypasses row-level security, because a worker cannot read other people's job rows);
--   * complete_job refuses a bill path with no stored file behind it;
--   * two partial indexes make those lookups, and the existing job_media_read rule, use an index instead of reading
--     every job and quote.
-- Files that are not filed as a bill (an upload that was refused and is being cleaned up, photos, voice notes) can
-- still be deleted by their owner exactly as before.

create index jobs_material_bill_idx on public.jobs (material_bill_path) where material_bill_path is not null;
create index quotes_material_bill_idx on public.quotes (material_bill_path) where material_bill_path is not null;

-- True when the stored file is a material bill that a job or a quote refers to.
create function public.is_filed_bill(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.jobs j where j.material_bill_path = p_name)
      or exists (select 1 from public.quotes q where q.material_bill_path = p_name);
$$;

revoke execute on function public.is_filed_bill(text) from public, anon;
grant execute on function public.is_filed_bill(text) to authenticated;

drop policy job_media_owner_delete on storage.objects;
create policy job_media_owner_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'job-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not public.is_filed_bill(name)
  );

-- complete_job as in 0026, plus: the bill file must really exist in the worker's folder.
create or replace function public.complete_job(p_job_id uuid, p_bill_path text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker', false);
  v_job public.jobs;
  v_materials integer;
  v_bill text := nullif(trim(p_bill_path), '');
begin
  select * into v_job from public.jobs where id = p_job_id and accepted_worker_id = v_uid for update;
  if not found or v_job.status <> 'in_progress' then
    raise exception 'this job cannot be completed';
  end if;
  select materials into v_materials from public.quotes where id = v_job.accepted_quote_id;
  if coalesce(v_materials, 0) > 0 and v_bill is null then
    raise exception 'upload the material bill';
  end if;
  if v_bill is not null and split_part(v_bill, '/', 1) <> v_uid::text then
    raise exception 'invalid bill path';
  end if;
  if v_bill is not null
     and not exists (select 1 from storage.objects o where o.bucket_id = 'job-media' and o.name = v_bill) then
    raise exception 'invalid bill path';
  end if;
  update public.jobs set status = 'completed', completed_at = now(), material_bill_path = v_bill,
    stuck_since = null, stuck_reason = null
  where id = p_job_id;
  perform private.record(p_job_id, 'completed', v_uid);
  perform private.notify(v_job.resident_id, 'job_completed', p_job_id, jsonb_build_object('title', v_job.title));
end;
$$;
