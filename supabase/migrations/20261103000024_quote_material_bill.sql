-- 0024: the material bill is uploaded WITH the quote (Shariq's mentor, 3 Nov), not when the job is completed.
--   * quotes.material_bill_path: a job-media path "<worker id>/..." (a photo of the bill).
--   * submit_quote gets a last argument p_material_bill_path; a quote with materials above 0 must carry one.
--   * complete_job no longer asks for a bill when the accepted quote already has one (it is copied to the job so the
--     resident keeps reading it through jobs.material_bill_path). Quotes sent before this migration have no bill, so
--     for them complete_job still asks for it, exactly as before.
--   * the resident who owns the job can read the bill of a quote on it (storage policy), and resident_quotes exposes the path.

alter table public.quotes add column material_bill_path text;

-- ---------------------------------------------------------------------------
-- submit_quote with the bill (same body as 0009 plus the bill rules)
-- ---------------------------------------------------------------------------
drop function public.submit_quote(uuid, integer, timestamptz, timestamptz, integer, text, integer, text, text);

create function public.submit_quote(
  p_job_id uuid,
  p_labour integer,
  p_visit_start timestamptz,
  p_visit_end timestamptz,
  p_materials integer default 0,
  p_materials_note text default null,
  p_other_amount integer default 0,
  p_other_note text default null,
  p_note text default null,
  p_material_bill_path text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker');
  v_job public.jobs;
  v_id uuid;
  v_expiry integer := private.setting_int('job_expiry_hours', 24);
  v_bill text := nullif(btrim(p_material_bill_path), '');
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.status not in ('interested', 'quoted')
     or not public.worker_matches_job(v_job.category_id, v_job.phase) then
    raise exception 'this job is not available for quotes';
  end if;
  if v_job.posted_at + make_interval(hours => v_expiry) < now() then
    raise exception 'this job has expired';
  end if;
  if not exists (select 1 from public.job_interests where job_id = p_job_id and worker_id = v_uid and withdrawn_at is null) then
    raise exception 'show interest in the job before sending a quote';
  end if;
  if exists (select 1 from public.quotes where job_id = p_job_id and worker_id = v_uid and status = 'rejected') then
    raise exception 'the resident did not accept your quote on this job';
  end if;
  if exists (select 1 from public.quotes where job_id = p_job_id and worker_id = v_uid and status = 'sent') then
    raise exception 'you already sent a quote; withdraw it first';
  end if;
  if p_visit_start <= now() then
    raise exception 'choose a visit time in the future';
  end if;
  if coalesce(p_materials, 0) > 0 and v_bill is null then
    raise exception 'upload the material bill';
  end if;
  if v_bill is not null and split_part(v_bill, '/', 1) <> v_uid::text then
    raise exception 'invalid bill path';
  end if;

  insert into public.quotes (job_id, worker_id, labour, materials, materials_note, other_amount, other_note,
                             visit_start, visit_end, note, material_bill_path)
  values (p_job_id, v_uid, p_labour, coalesce(p_materials, 0), p_materials_note, coalesce(p_other_amount, 0),
          p_other_note, p_visit_start, p_visit_end, p_note,
          case when coalesce(p_materials, 0) > 0 then v_bill end)
  returning id into v_id;
  perform private.recompute_job_stage(p_job_id);
  perform private.record(p_job_id, 'quote_sent', v_uid, '{}'::jsonb, true);
  perform private.notify(v_job.resident_id, 'quote_received', p_job_id, jsonb_build_object('title', v_job.title));
  return v_id;
end;
$$;

revoke execute on function public.submit_quote(uuid, integer, timestamptz, timestamptz, integer, text, integer, text, text, text) from public, anon;
grant execute on function public.submit_quote(uuid, integer, timestamptz, timestamptz, integer, text, integer, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- complete_job: the bill may already be on the accepted quote
-- ---------------------------------------------------------------------------
create or replace function public.complete_job(p_job_id uuid, p_bill_path text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker', false);
  v_job public.jobs;
  v_materials integer;
  v_quote_bill text;
  v_bill text := nullif(trim(p_bill_path), '');
begin
  select * into v_job from public.jobs where id = p_job_id and accepted_worker_id = v_uid for update;
  if not found or v_job.status <> 'in_progress' then
    raise exception 'this job cannot be completed';
  end if;
  select materials, material_bill_path into v_materials, v_quote_bill from public.quotes where id = v_job.accepted_quote_id;
  v_bill := coalesce(v_bill, v_quote_bill);
  if coalesce(v_materials, 0) > 0 and v_bill is null then
    raise exception 'upload the material bill';
  end if;
  if v_bill is not null and split_part(v_bill, '/', 1) <> v_uid::text then
    raise exception 'invalid bill path';
  end if;
  update public.jobs set status = 'completed', completed_at = now(), material_bill_path = v_bill,
    stuck_since = null, stuck_reason = null
  where id = p_job_id;
  perform private.record(p_job_id, 'completed', v_uid);
  perform private.notify(v_job.resident_id, 'job_completed', p_job_id, jsonb_build_object('title', v_job.title));
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: the job's resident may read the bill of a quote on that job (bills sit in job-media)
-- ---------------------------------------------------------------------------
drop policy job_media_read on storage.objects;
create policy job_media_read on storage.objects for select to authenticated
  using (
    bucket_id = 'job-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_admin()
      or exists (select 1 from public.job_photos ph where ph.storage_path = name and public.can_view_job(ph.job_id))
      or exists (select 1 from public.jobs j where j.voice_note_path = name and public.can_view_job(j.id))
      or exists (select 1 from public.jobs j where j.material_bill_path = name and j.resident_id = (select auth.uid()))
      or exists (
        select 1 from public.quotes q join public.jobs j on j.id = q.job_id
        where q.material_bill_path = name and j.resident_id = (select auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- resident_quotes: the bill path goes last (a view cannot gain a column in the middle)
-- ---------------------------------------------------------------------------
create or replace view public.resident_quotes with (security_invoker = false) as
select q.id, q.job_id, q.status, q.labour, q.materials, q.materials_note, q.other_amount, q.other_note,
  q.total, q.visit_start, q.visit_end, q.note, q.created_at,
  q.worker_id, p.full_name as worker_name, p.avatar_path,
  wd.rating_avg, wd.rating_count, wd.jobs_done, wd.experience_years, wd.visit_fee, wd.voice_intro_path,
  (wd.jobs_done >= private.setting_int('top_rated_min_jobs', 10)
   and wd.rating_avg >= (public.get_setting('top_rated_min_rating') #>> '{}')::numeric) as is_top_rated,
  case when q.status = 'accepted' then p.phone end as worker_phone,
  wd.about as worker_about,
  q.material_bill_path
from public.quotes q
join public.jobs j on j.id = q.job_id
join public.profiles p on p.id = q.worker_id
join public.worker_details wd on wd.profile_id = q.worker_id
where j.resident_id = (select auth.uid())
  and q.status in ('sent', 'accepted', 'rejected', 'not_selected');
