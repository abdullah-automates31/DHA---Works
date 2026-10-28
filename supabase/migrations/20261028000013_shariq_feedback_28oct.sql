-- 0013: changes from Shariq Bhai's feedback (28 Oct).
--   1. Worker must upload a material bill when completing a job that has materials in the accepted quote.
--   2. A price difference never disputes a job by itself: the job closes as cash_collected, the gap stays
--      on cash_records (matched = false). Complaints go through file_report or a low rating.
--   3. A rating below 3 files a system-generated poor_work report.
-- Assumptions awaiting Shariq's confirmation are marked ASSUMED in docs/OPEN-QUESTIONS.md.

-- ---------------------------------------------------------------------------
-- 1. Material bill
-- ---------------------------------------------------------------------------

alter table public.jobs add column material_bill_path text;   -- job-media path "<worker id>/..."

drop function public.complete_job(uuid);

create function public.complete_job(p_job_id uuid, p_bill_path text default null)
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

revoke execute on function public.complete_job(uuid, text) from public, anon;
grant execute on function public.complete_job(uuid, text) to authenticated;

-- The bill is readable by the worker (owner folder), the job's resident and staff.
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
    )
  );

-- Mobile read views expose the bill path to the resident (resident_jobs) and the winning worker (worker_jobs).
-- Views cannot gain a column in the middle, so they are recreated with the new column at the end.
drop view public.resident_jobs;
create view public.resident_jobs with (security_invoker = false) as
select j.id, j.code, j.status, j.title, j.description, j.category_id, c.name as category_name,
  j.address_id, j.phase, j.lane, j.urgency, j.preferred_date, j.window_from, j.window_to,
  j.voice_note_path, j.posted_at,
  j.posted_at + make_interval(hours => private.setting_int('job_expiry_hours', 24)) as expires_at,
  j.accepted_quote_id, j.accepted_worker_id, j.scheduled_start, j.scheduled_end, j.started_at,
  j.completed_at, j.stuck_since, j.under_review_reason, j.created_at, j.updated_at,
  (select count(*) from public.job_interests i where i.job_id = j.id and i.withdrawn_at is null) as interest_count,
  (select count(*) from public.quotes q where q.job_id = j.id and q.status = 'sent') as quote_count,
  (select min(q.total) from public.quotes q where q.job_id = j.id and q.status = 'sent') as lowest_quote,
  (select count(*) from public.job_views v where v.job_id = j.id) as viewed_count,
  (select p.storage_path from public.job_photos p where p.job_id = j.id order by p.sort limit 1) as thumb_path,
  exists (select 1 from public.cancellation_requests r where r.job_id = j.id and r.status = 'pending') as cancellation_pending,
  j.material_bill_path
from public.jobs j
join public.categories c on c.id = j.category_id
where j.resident_id = (select auth.uid());

revoke all on public.resident_jobs from public, anon;
grant select on public.resident_jobs to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Cash difference never disputes a job
-- ---------------------------------------------------------------------------

create or replace function private.settle_cash(p_job uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_cash public.cash_records;
  v_job public.jobs;
begin
  select * into v_cash from public.cash_records where job_id = p_job;
  if v_cash.worker_amount is null or v_cash.resident_amount is null then
    perform private.notify(
      (select case when v_cash.worker_amount is null then accepted_worker_id else resident_id end
         from public.jobs where id = p_job),
      'cash_awaiting_you', p_job);
    return;
  end if;
  select * into v_job from public.jobs where id = p_job;

  -- Equal or not, both sides have answered, so the job closes. The gap against the quote and any
  -- worker/resident mismatch stay on cash_records for staff; the resident can still file a report.
  update public.cash_records set matched = (worker_amount = resident_amount),
    quote_difference = worker_amount - agreed_amount
  where job_id = p_job;
  update public.jobs set status = 'cash_collected', stuck_since = null, stuck_reason = null where id = p_job;
  update public.worker_details set jobs_done = jobs_done + 1 where profile_id = v_job.accepted_worker_id;
  perform private.record(p_job, 'cash_collected', null,
    jsonb_build_object('worker_amount', v_cash.worker_amount, 'resident_amount', v_cash.resident_amount,
                       'difference', v_cash.worker_amount - v_cash.agreed_amount));
  perform private.notify(v_job.resident_id, 'rate_worker', p_job, jsonb_build_object('title', v_job.title));
  perform private.notify(v_job.accepted_worker_id, 'cash_collected', p_job, jsonb_build_object('title', v_job.title));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Rating below 3 files a poor_work report
-- ---------------------------------------------------------------------------

create or replace function public.submit_review(
  p_job_id uuid,
  p_behaviour smallint,
  p_completeness smallint,
  p_quality smallint,
  p_hire_again boolean,
  p_comment text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('resident', false);
  v_job public.jobs;
  v_window integer := private.setting_int('review_window_days', 7);
  v_score numeric := (p_behaviour + p_completeness + p_quality) / 3.0;
begin
  select * into v_job from public.jobs where id = p_job_id and resident_id = v_uid for update;
  if not found or v_job.status <> 'cash_collected' then
    raise exception 'you can rate the worker once payment is confirmed';
  end if;
  if now() > v_job.completed_at + make_interval(days => v_window) then
    raise exception 'the rating period for this job has ended';
  end if;
  insert into public.reviews (job_id, resident_id, worker_id, behaviour, completeness, quality, hire_again, comment)
  values (p_job_id, v_uid, v_job.accepted_worker_id, p_behaviour, p_completeness, p_quality, p_hire_again,
          nullif(trim(p_comment), ''));
  update public.worker_details wd set
    rating_count = s.n,
    rating_avg = round(s.avg_score, 2)
  from (select count(*) as n, avg((behaviour + completeness + quality) / 3.0) as avg_score
        from public.reviews where worker_id = v_job.accepted_worker_id) s
  where wd.profile_id = v_job.accepted_worker_id;
  update public.jobs set status = 'reviewed' where id = p_job_id;
  perform private.record(p_job_id, 'reviewed', v_uid);

  if v_score < 3 then
    insert into public.reports (job_id, reporter_id, against_id, reporter_role, kind, reason_text, system_generated)
    values (p_job_id, v_uid, v_job.accepted_worker_id, 'resident', 'poor_work',
            format('Rated %s out of 5 (behaviour %s, completeness %s, quality %s)%s',
                   round(v_score, 1), p_behaviour, p_completeness, p_quality,
                   case when nullif(trim(p_comment), '') is null then '' else ': ' || trim(p_comment) end),
            true);
    perform private.notify_admins('poor_work_report', p_job_id);
  end if;
end;
$$;
