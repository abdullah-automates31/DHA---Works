-- 0026: the material bill goes back to JOB COMPLETION (Shariq, 3 Nov; this replaces the 0024 rule).
--   * A quote carries the itemised materials list and the estimated material cost, no bill. submit_quote no longer
--     requires a bill with materials. Its last argument p_material_bill_path stays (and quotes.material_bill_path,
--     resident_quotes.material_bill_path, the storage read rule) so nothing already reading them breaks, but it is
--     optional, not used by the worker app, and never required.
--   * complete_job requires the ACTUAL bill whenever the accepted quote has materials above 0, for every quote (older
--     ones too). A job without materials never needs a bill. A bill sent with a quote is no longer accepted in its place.

create or replace function public.submit_quote(
  p_job_id uuid,
  p_labour integer,
  p_visit_start timestamptz default null,   -- ignored: the customer chooses the date and time
  p_visit_end timestamptz default null,     -- ignored
  p_materials integer default 0,
  p_materials_note text default null,
  p_other_amount integer default 0,
  p_other_note text default null,
  p_note text default null,
  p_material_bill_path text default null    -- optional and unused by the worker app; the bill is uploaded at completion
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
  if v_bill is not null and split_part(v_bill, '/', 1) <> v_uid::text then
    raise exception 'invalid bill path';
  end if;

  insert into public.quotes (job_id, worker_id, labour, materials, materials_note, other_amount, other_note,
                             visit_start, visit_end, note, material_bill_path)
  values (p_job_id, v_uid, p_labour, coalesce(p_materials, 0), p_materials_note, coalesce(p_other_amount, 0),
          p_other_note, null, null, p_note,
          case when coalesce(p_materials, 0) > 0 then v_bill end)
  returning id into v_id;
  perform private.recompute_job_stage(p_job_id);
  perform private.record(p_job_id, 'quote_sent', v_uid, '{}'::jsonb, true);
  perform private.notify(v_job.resident_id, 'quote_received', p_job_id, jsonb_build_object('title', v_job.title));
  return v_id;
end;
$$;

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
  update public.jobs set status = 'completed', completed_at = now(), material_bill_path = v_bill,
    stuck_since = null, stuck_reason = null
  where id = p_job_id;
  perform private.record(p_job_id, 'completed', v_uid);
  perform private.notify(v_job.resident_id, 'job_completed', p_job_id, jsonb_build_object('title', v_job.title));
end;
$$;
