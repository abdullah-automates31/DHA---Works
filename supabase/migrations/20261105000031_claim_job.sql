-- 0031: claim-and-lock. A worker taps Accept on an open job: the job locks to them straight away (scheduled), with the
-- price they state. The customer no longer compares quotes; the remedy is replace_worker (0022).
--
-- accept_job = submit_quote + accept_quote in ONE transaction, so every later rule keeps working unchanged:
-- cash_records.agreed_amount (the quote total), the material-bill rule at complete_job (quotes.materials), and the
-- exclusion of a replaced worker (their quote becomes 'rejected').
-- express_interest, submit_quote and accept_quote stay for now: the customer app still uses accept_quote until it
-- moves to the new model (docs/OPEN-QUESTIONS.md).

create or replace function public.accept_job(
  p_job_id uuid,
  p_labour integer,
  p_materials integer default 0,
  p_materials_note text default null,
  p_note text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker');
  v_job public.jobs;
  v_expiry integer := private.setting_int('job_expiry_hours', 24);
  v_quote_id uuid;
  v_total integer;
  v_start timestamptz;
  v_end timestamptz;
  r record;
begin
  -- Lock the job first: two workers tapping Accept at the same moment serialise here and the second one finds the
  -- job already scheduled.
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found
     or v_job.status not in ('open', 'interested', 'quoted')
     or v_job.accepted_worker_id is not null
     or not public.worker_matches_job(v_job.category_id, v_job.phase) then
    raise exception 'this job is not available';
  end if;
  if v_job.posted_at + make_interval(hours => v_expiry) < now() then
    raise exception 'this job has expired';
  end if;
  -- A worker the customer replaced (or rejected) on this job can never take it again.
  if exists (select 1 from public.quotes where job_id = p_job_id and worker_id = v_uid and status = 'rejected') then
    raise exception 'the resident did not accept your quote on this job';
  end if;
  if coalesce(p_labour, 0) < 0 or coalesce(p_materials, 0) < 0 then
    raise exception 'amounts cannot be negative';
  end if;
  if coalesce(p_labour, 0) + coalesce(p_materials, 0) <= 0 then
    raise exception 'enter a price';
  end if;

  select vv.visit_start, vv.visit_end into v_start, v_end from private.job_visit(v_job) vv;

  -- Anyone who quoted the old way before the switch loses the job; they are told it went to another worker.
  for r in
    update public.quotes set status = 'not_selected', decided_at = now()
    where job_id = p_job_id and status = 'sent'
    returning worker_id
  loop
    perform private.notify(r.worker_id, 'quote_not_selected', p_job_id, jsonb_build_object('title', v_job.title));
  end loop;
  update public.job_interests set withdrawn_at = now()
   where job_id = p_job_id and worker_id <> v_uid and withdrawn_at is null;

  insert into public.quotes (job_id, worker_id, labour, materials, materials_note, other_amount, note, status, decided_at)
  values (p_job_id, v_uid, p_labour, coalesce(p_materials, 0), p_materials_note, 0, p_note, 'accepted', now())
  returning id, total into v_quote_id, v_total;

  update public.jobs set status = 'scheduled', accepted_quote_id = v_quote_id, accepted_worker_id = v_uid,
    scheduled_start = v_start, scheduled_end = v_end
  where id = p_job_id;

  -- After "Replace worker" the earlier worker's cash row is still there (agreed_amount is write-once, so it cannot be
  -- updated). Nobody can have entered an amount on a job that was only scheduled, so the stale row is replaced.
  delete from public.cash_records
   where job_id = p_job_id and worker_amount is null and resident_amount is null;
  insert into public.cash_records (job_id, agreed_amount) values (p_job_id, v_total);

  perform private.record(p_job_id, 'job_accepted', v_uid, jsonb_build_object('total', v_total), true);
  perform private.record(p_job_id, 'scheduled', v_uid, jsonb_build_object('start', v_start, 'end', v_end));
  perform private.notify(v_job.resident_id, 'job_accepted', p_job_id,
    jsonb_build_object('title', v_job.title, 'start', v_start));
  return v_quote_id;
end;
$$;

revoke all on function public.accept_job(uuid, integer, integer, text, text) from public, anon;
grant execute on function public.accept_job(uuid, integer, integer, text, text) to authenticated;
