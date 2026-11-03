-- 0022: replace_worker (from Shariq Bhai's draft 0018_replace_worker.sql, 3 Nov). A resident drops the worker of a
-- SCHEDULED job (before work starts) and the job reopens so other workers can quote. The replaced worker's quote
-- becomes 'rejected' (so they cannot quote again) and they get the existing 'quote_rejected' notification.
-- Changes from the draft: grants also revoke anon; job_events/audit_log take any text event type, so 'worker_replaced' needs nothing else.

create or replace function public.replace_worker(p_job_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := private.me('resident', false);
  v_job public.jobs;
  v_worker uuid;
begin
  select * into v_job from public.jobs where id = p_job_id and resident_id = v_uid for update;
  if not found then
    raise exception 'job not found';
  end if;
  if v_job.status <> 'scheduled' then
    raise exception 'the worker can only be replaced before the work starts';
  end if;
  if exists (select 1 from public.cancellation_requests where job_id = p_job_id and status = 'pending') then
    raise exception 'a cancellation request is already waiting for review';
  end if;

  v_worker := v_job.accepted_worker_id;

  -- The replaced worker's quote is closed. Other quotes were set to 'not_selected' when this one was
  -- accepted; they stay closed, so workers quote again on the reopened job.
  update public.quotes
     set status = 'rejected', reject_reason = p_reason, decided_at = now()
   where id = v_job.accepted_quote_id;

  update public.jobs
     set status = 'open',
         accepted_quote_id = null, accepted_worker_id = null,
         scheduled_start = null, scheduled_end = null
   where id = p_job_id;

  -- The replaced worker must not count as interested any more, otherwise the stage below would
  -- still see their live interest. They also cannot come back: express_interest and submit_quote
  -- already refuse a worker who has a 'rejected' quote on the job (checked on DEV, 2026-11-02),
  -- which is exactly the status set above.
  update public.job_interests set withdrawn_at = now()
   where job_id = p_job_id and worker_id = v_worker and withdrawn_at is null;

  -- Back to 'open', or 'interested' if other workers still have a live interest in the job.
  perform private.recompute_job_stage(p_job_id);

  if v_worker is not null then
    -- Re-uses the existing notification type so the worker app needs no change.
    perform private.notify(v_worker, 'quote_rejected', p_job_id, jsonb_build_object('title', v_job.title));
  end if;
    perform private.record(p_job_id, 'worker_replaced', v_uid, jsonb_build_object('reason', p_reason), true);
end;
$function$;

revoke all on function public.replace_worker(uuid, text) from public, anon;
grant execute on function public.replace_worker(uuid, text) to authenticated;
