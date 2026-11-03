-- 0025: two rules from the worker-app improvement document (3 Nov, Shariq's mentor), enforced in the database.
--
-- A. The CUSTOMER controls the schedule. A worker no longer proposes a visit day or time in a quote.
--    * quotes.visit_start / visit_end become optional and are always stored empty for new quotes.
--      submit_quote keeps its two visit arguments only so older callers do not break; they are IGNORED.
--    * accept_quote sets jobs.scheduled_start / scheduled_end from the job's own preferred date and time window
--      (preferred_date + window_from / window_to, Karachi time). A job without a date (an ASAP job) is scheduled with
--      no time: the worker calls the customer (docs/OPEN-QUESTIONS.md).
--    * Workers have no write access to jobs, so they cannot change the schedule through the API (tested).
--
-- B. Rejected and cancelled jobs are hidden from the worker in the data layer, not only in the UI.
--    * A job the worker's quote was rejected on (or lost to another worker while the job is closed to quotes) is
--      unreadable to them: no description, photos, voice note, schedule or status updates. They keep one
--      worker_jobs row (code, title, trade) so the app can show the simple "Rejected" card.
--    * A cancelled job disappears from worker_jobs and from every direct read, including for the accepted worker.
--    * Notifications about a job are no longer created for a worker whose quote was rejected, except the rejection itself.

-- ---------------------------------------------------------------------------
-- A. Customer-controlled schedule
-- ---------------------------------------------------------------------------
alter table public.quotes alter column visit_start drop not null;
alter table public.quotes alter column visit_end drop not null;
-- quotes_visit_order (visit_start < visit_end) stays: it passes when either side is null.

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
  if coalesce(p_materials, 0) > 0 and v_bill is null then
    raise exception 'upload the material bill';
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

-- The customer's chosen visit, as timestamps (Karachi time). Null when the job has no date.
create function private.job_visit(p_job public.jobs)
returns table (visit_start timestamptz, visit_end timestamptz)
language sql stable set search_path = ''
as $$
  select
    (p_job.preferred_date + coalesce(p_job.window_from, time '08:00')) at time zone 'Asia/Karachi',
    (p_job.preferred_date + coalesce(p_job.window_to, coalesce(p_job.window_from, time '08:00') + interval '2 hours')) at time zone 'Asia/Karachi'
  where p_job.preferred_date is not null;
$$;

create or replace function public.accept_quote(p_quote_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('resident');
  v_job_id uuid;
  v_job public.jobs;
  v_quote public.quotes;
  v_start timestamptz;
  v_end timestamptz;
  r record;
begin
  select job_id into v_job_id from public.quotes where id = p_quote_id;
  if v_job_id is null then
    raise exception 'quote not found';
  end if;
  -- Lock the job first so two concurrent accepts serialise; the second sees a changed status.
  select * into v_job from public.jobs where id = v_job_id and resident_id = v_uid for update;
  if not found then
    raise exception 'quote not found';
  end if;
  if v_job.status not in ('interested', 'quoted') then
    raise exception 'this job can no longer accept a quote';
  end if;
  select * into v_quote from public.quotes where id = p_quote_id;
  if v_quote.status <> 'sent' then
    raise exception 'this quote is no longer available';
  end if;
  if not exists (select 1 from public.profiles
                 where id = v_quote.worker_id and verification_status = 'approved' and account_status = 'active') then
    raise exception 'this worker is no longer available';
  end if;

  select vv.visit_start, vv.visit_end into v_start, v_end from private.job_visit(v_job) vv;

  update public.quotes set status = 'accepted', decided_at = now() where id = p_quote_id;
  for r in
    update public.quotes set status = 'not_selected', decided_at = now()
    where job_id = v_job_id and status = 'sent' and id <> p_quote_id
    returning worker_id
  loop
    perform private.notify(r.worker_id, 'quote_not_selected', v_job_id, jsonb_build_object('title', v_job.title));
  end loop;

  update public.jobs set status = 'scheduled', accepted_quote_id = p_quote_id, accepted_worker_id = v_quote.worker_id,
    scheduled_start = v_start, scheduled_end = v_end
  where id = v_job_id;
  insert into public.cash_records (job_id, agreed_amount) values (v_job_id, v_quote.total);

  perform private.record(v_job_id, 'quote_accepted', v_uid, jsonb_build_object('total', v_quote.total), true);
  perform private.record(v_job_id, 'scheduled', v_uid, jsonb_build_object('start', v_start, 'end', v_end));
  perform private.notify(v_quote.worker_id, 'quote_accepted', v_job_id,
    jsonb_build_object('title', v_job.title, 'start', v_start));
end;
$$;

-- ---------------------------------------------------------------------------
-- B. What a worker may see
-- ---------------------------------------------------------------------------
-- A worker's quote on this job was rejected (by the customer, or when the customer replaced them), or lost to another
-- worker while the job is no longer taking quotes.
create function public.worker_is_rejected_on(p_job uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.quotes q join public.jobs j on j.id = q.job_id
    where q.job_id = p_job and q.worker_id = (select auth.uid())
      and (q.status = 'rejected'
           or (q.status = 'not_selected' and j.status not in ('open', 'interested', 'quoted')))
  );
$$;

-- Everything a worker may read about a job: their own accepted job, an open job that matches them, or one they
-- engaged with. Never a cancelled job, and never one they were rejected on.
create function public.worker_may_see_job(p_job uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job
      and j.status <> 'cancelled'
      and not public.worker_is_rejected_on(j.id)
      and (
        j.accepted_worker_id = (select auth.uid())
        or (j.status in ('open', 'interested', 'quoted') and public.worker_matches_job(j.category_id, j.phase))
        or public.worker_has_stake(j.id)
      )
  );
$$;

revoke execute on function public.worker_is_rejected_on(uuid), public.worker_may_see_job(uuid) from public, anon;
grant execute on function public.worker_is_rejected_on(uuid), public.worker_may_see_job(uuid) to authenticated;

create or replace function public.can_view_job(p_job uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job and (
      j.resident_id = (select auth.uid())
      or public.is_admin()
      or public.worker_may_see_job(j.id)
    )
  );
$$;

drop policy jobs_read on public.jobs;
create policy jobs_read on public.jobs for select to authenticated
  using (
    resident_id = (select auth.uid())
    or public.is_admin()
    or public.worker_may_see_job(id)
  );

-- Plot, floor and phone: the accepted worker loses them when the job is cancelled.
drop policy job_private_read on public.job_private;
create policy job_private_read on public.job_private for select to authenticated
  using (
    public.is_job_owner(job_id)
    or public.is_admin()
    or (public.is_accepted_worker(job_id)
        and exists (select 1 from public.jobs j where j.id = job_id and j.status <> 'cancelled'))
  );

-- The worker's own list: cancelled jobs are gone; a rejected job stays as one bare row (code, title, trade) with every
-- detail blanked and a neutral status, so the app can only draw the simple "Rejected" card.
create or replace view public.worker_jobs with (security_invoker = false) as
select j.id, j.code,
  case when rj.hidden then 'open'::public.job_status else j.status end as status,
  j.title,
  case when rj.hidden then null else j.description end as description,
  j.category_id, c.name as category_name,
  j.phase,
  case when rj.hidden then null else j.lane end as lane,
  j.urgency,
  case when rj.hidden then null else j.voice_note_path end as voice_note_path,
  j.posted_at,
  case when rj.hidden then null else j.scheduled_start end as scheduled_start,
  case when rj.hidden then null else j.scheduled_end end as scheduled_end,
  case when rj.hidden then null else j.started_at end as started_at,
  case when rj.hidden then null else j.completed_at end as completed_at,
  case when rj.hidden then null else j.stuck_since end as stuck_since,
  case when rj.hidden then null else j.under_review_reason end as under_review_reason,
  (j.accepted_worker_id = (select auth.uid())) as is_mine,
  mq.id as my_quote_id, mq.status as my_quote_status, mq.total as my_quote_total,
  case when j.accepted_worker_id = (select auth.uid()) then rp.full_name end as resident_name,
  case when j.accepted_worker_id = (select auth.uid()) then jp.resident_phone end as resident_phone,
  case when j.accepted_worker_id = (select auth.uid()) then jp.plot_no end as plot_no,
  case when j.accepted_worker_id = (select auth.uid()) then jp.floor end as floor,
  (not rj.hidden and exists (select 1 from public.cancellation_requests r where r.job_id = j.id and r.status = 'pending')) as cancellation_pending,
  case when rj.hidden then null else j.preferred_date end as preferred_date,
  case when rj.hidden then null else j.window_from end as window_from,
  case when rj.hidden then null else j.window_to end as window_to
from public.jobs j
join public.categories c on c.id = j.category_id
left join lateral (
  select q.id, q.status, q.total from public.quotes q
  where q.job_id = j.id and q.worker_id = (select auth.uid()) order by q.created_at desc limit 1
) mq on true
cross join lateral (select public.worker_is_rejected_on(j.id) as hidden) rj
left join public.job_private jp on jp.job_id = j.id and j.accepted_worker_id = (select auth.uid())
left join public.profiles rp on rp.id = j.resident_id and j.accepted_worker_id = (select auth.uid())
where (j.status <> 'cancelled' or rj.hidden)
  and (j.accepted_worker_id = (select auth.uid())
       or mq.id is not null
       or exists (select 1 from public.job_interests i where i.job_id = j.id and i.worker_id = (select auth.uid())));

-- No further updates about a job to a worker whose quote was rejected (other than the rejection itself).
create or replace function private.notify(p_user uuid, p_type text, p_job uuid, p_payload jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.notifications (user_id, type, job_id, payload)
  select p_user, p_type, p_job, p_payload
  where p_job is null
     or p_type in ('quote_rejected', 'quote_not_selected')
     or not exists (select 1 from public.quotes q
                    where q.job_id = p_job and q.worker_id = p_user and q.status = 'rejected');
$$;
