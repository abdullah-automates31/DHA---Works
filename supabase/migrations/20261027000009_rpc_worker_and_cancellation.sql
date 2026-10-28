-- 0009: worker RPCs (profile setup, interest, quotes, executing the job, cash) and
-- cancellation requests for both apps.

-- ---------------------------------------------------------------------------
-- Worker setup
-- ---------------------------------------------------------------------------

create function public.set_my_areas(p_phases smallint[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker', false);
begin
  if coalesce(array_length(p_phases, 1), 0) = 0 then
    raise exception 'choose at least one phase';
  end if;
  if exists (select 1 from unnest(p_phases) ph where not exists
             (select 1 from public.service_areas where phase = ph and active)) then
    raise exception 'unknown or inactive phase';
  end if;
  delete from public.worker_areas where worker_id = v_uid;
  insert into public.worker_areas (worker_id, phase) select v_uid, distinct_ph from (select distinct unnest(p_phases) as distinct_ph) d;
end;
$$;

create function public.set_my_categories(p_category_ids smallint[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker', false);
begin
  if coalesce(array_length(p_category_ids, 1), 0) = 0 then
    raise exception 'choose at least one trade';
  end if;
  if exists (select 1 from unnest(p_category_ids) c where not exists
             (select 1 from public.categories where id = c and active)) then
    raise exception 'unknown or inactive trade';
  end if;
  delete from public.worker_categories where worker_id = v_uid;
  insert into public.worker_categories (worker_id, category_id) select v_uid, c from (select distinct unnest(p_category_ids) as c) d;
end;
$$;

create function public.set_available_today(p_value boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.worker_details set available_today = p_value where profile_id = (select private.me('worker', false));
$$;

-- Null means "leave unchanged".
create function public.update_worker_details(
  p_experience_years smallint default null,
  p_visit_fee integer default null,
  p_voice_intro_path text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker', false);
begin
  if p_voice_intro_path is not null and p_voice_intro_path not like v_uid::text || '/%' then
    raise exception 'invalid file path';
  end if;
  update public.worker_details set
    experience_years = coalesce(p_experience_years, experience_years),
    visit_fee = coalesce(p_visit_fee, visit_fee),
    voice_intro_path = coalesce(p_voice_intro_path, voice_intro_path)
  where profile_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Feed: viewing, interest, quotes
-- ---------------------------------------------------------------------------

create function public.record_job_view(p_job_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker');
begin
  if not public.can_view_job(p_job_id) then
    raise exception 'job not found';
  end if;
  insert into public.job_views (job_id, worker_id) values (p_job_id, v_uid) on conflict do nothing;
end;
$$;

create function public.express_interest(p_job_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker');
  v_job public.jobs;
  v_was_live boolean;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.status not in ('open', 'interested', 'quoted')
     or not public.worker_matches_job(v_job.category_id, v_job.phase) then
    raise exception 'this job is not available';
  end if;
  if exists (select 1 from public.quotes where job_id = p_job_id and worker_id = v_uid and status = 'rejected') then
    raise exception 'the resident did not accept your quote on this job';
  end if;
  select (withdrawn_at is null) into v_was_live from public.job_interests where job_id = p_job_id and worker_id = v_uid;
  if v_was_live then
    return;   -- already interested
  end if;
  insert into public.job_interests (job_id, worker_id) values (p_job_id, v_uid)
  on conflict (job_id, worker_id) do update set withdrawn_at = null, created_at = now();
  perform private.recompute_job_stage(p_job_id);
  perform private.record(p_job_id, 'interest', v_uid, '{}'::jsonb, true);
  perform private.notify(v_job.resident_id, 'new_interest', p_job_id, jsonb_build_object('title', v_job.title));
end;
$$;

create function public.withdraw_interest(p_job_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker', false);
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.status not in ('open', 'interested', 'quoted') then
    raise exception 'this job is not available';
  end if;
  update public.job_interests set withdrawn_at = now()
  where job_id = p_job_id and worker_id = v_uid and withdrawn_at is null;
  if not found then
    raise exception 'you have not shown interest in this job';
  end if;
  update public.quotes set status = 'withdrawn', decided_at = now()
  where job_id = p_job_id and worker_id = v_uid and status = 'sent';
  perform private.recompute_job_stage(p_job_id);
  perform private.record(p_job_id, 'interest_withdrawn', v_uid, '{}'::jsonb, true);
end;
$$;

-- The total is computed by the database. A sent quote cannot be edited: withdraw and send a new one.
create function public.submit_quote(
  p_job_id uuid,
  p_labour integer,
  p_visit_start timestamptz,
  p_visit_end timestamptz,
  p_materials integer default 0,
  p_materials_note text default null,
  p_other_amount integer default 0,
  p_other_note text default null,
  p_note text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker');
  v_job public.jobs;
  v_id uuid;
  v_expiry integer := private.setting_int('job_expiry_hours', 24);
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

  insert into public.quotes (job_id, worker_id, labour, materials, materials_note, other_amount, other_note,
                             visit_start, visit_end, note)
  values (p_job_id, v_uid, p_labour, coalesce(p_materials, 0), p_materials_note, coalesce(p_other_amount, 0),
          p_other_note, p_visit_start, p_visit_end, p_note)
  returning id into v_id;
  perform private.recompute_job_stage(p_job_id);
  perform private.record(p_job_id, 'quote_sent', v_uid, '{}'::jsonb, true);
  perform private.notify(v_job.resident_id, 'quote_received', p_job_id, jsonb_build_object('title', v_job.title));
  return v_id;
end;
$$;

create function public.withdraw_quote(p_quote_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker', false);
  v_job_id uuid;
  v_status public.job_status;
begin
  select job_id into v_job_id from public.quotes where id = p_quote_id and worker_id = v_uid;
  if v_job_id is null then
    raise exception 'quote not found';
  end if;
  select status into v_status from public.jobs where id = v_job_id for update;
  if v_status not in ('interested', 'quoted') then
    raise exception 'this quote can no longer be withdrawn';
  end if;
  update public.quotes set status = 'withdrawn', decided_at = now() where id = p_quote_id and status = 'sent';
  if not found then
    raise exception 'this quote can no longer be withdrawn';
  end if;
  perform private.recompute_job_stage(v_job_id);
  perform private.record(v_job_id, 'quote_withdrawn', v_uid, '{}'::jsonb, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Doing the work and cash
-- ---------------------------------------------------------------------------

create function public.start_job(p_job_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker', false);
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id and accepted_worker_id = v_uid for update;
  if not found or v_job.status <> 'scheduled' then
    raise exception 'this job cannot be started';
  end if;
  update public.jobs set status = 'in_progress', started_at = now(), stuck_since = null, stuck_reason = null
  where id = p_job_id;
  perform private.record(p_job_id, 'started', v_uid);
  perform private.notify(v_job.resident_id, 'job_started', p_job_id, jsonb_build_object('title', v_job.title));
end;
$$;

create function public.complete_job(p_job_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker', false);
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id and accepted_worker_id = v_uid for update;
  if not found or v_job.status <> 'in_progress' then
    raise exception 'this job cannot be completed';
  end if;
  update public.jobs set status = 'completed', completed_at = now(), stuck_since = null, stuck_reason = null
  where id = p_job_id;
  perform private.record(p_job_id, 'completed', v_uid);
  perform private.notify(v_job.resident_id, 'job_completed', p_job_id, jsonb_build_object('title', v_job.title));
end;
$$;

-- Worker's side of the cash exchange. A different amount from the quote needs a reason.
create function public.record_cash_worker(p_job_id uuid, p_amount integer, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker', false);
  v_job public.jobs;
  v_agreed integer;
begin
  select * into v_job from public.jobs where id = p_job_id and accepted_worker_id = v_uid for update;
  if not found or v_job.status <> 'completed' then
    raise exception 'record the cash after you mark the job completed';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'enter the amount you received';
  end if;
  select agreed_amount into v_agreed from public.cash_records where job_id = p_job_id;
  if p_amount <> v_agreed and coalesce(trim(p_reason), '') = '' then
    raise exception 'explain why the amount differs from the quote';
  end if;
  update public.cash_records set worker_amount = p_amount, worker_reason = nullif(trim(p_reason), ''),
    worker_recorded_at = now()
  where job_id = p_job_id and worker_amount is null;
  if not found then
    raise exception 'you have already recorded the amount';
  end if;
  perform private.record(p_job_id, 'cash_worker', v_uid);
  perform private.settle_cash(p_job_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancellation requests after acceptance (both apps). Staff decide in the admin phase.
-- ---------------------------------------------------------------------------

create function public.request_cancellation(
  p_job_id uuid, p_reason_code public.cancellation_reason, p_details text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs;
  v_role public.user_role;
  v_other uuid;
  v_id uuid;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'job not found';
  end if;
  if v_job.resident_id = v_uid then
    v_role := 'resident';
    v_other := v_job.accepted_worker_id;
  elsif v_job.accepted_worker_id = v_uid then
    v_role := 'worker';
    v_other := v_job.resident_id;
  else
    raise exception 'job not found';
  end if;
  if v_job.status not in ('scheduled', 'in_progress') then
    raise exception 'cancellation can be requested while the job is scheduled or in progress';
  end if;
  if (select account_status from public.profiles where id = v_uid) <> 'active' then
    raise exception 'your account is suspended';
  end if;
  if exists (select 1 from public.cancellation_requests where job_id = p_job_id and status = 'pending') then
    raise exception 'a cancellation request is already waiting for review';
  end if;
  insert into public.cancellation_requests (job_id, requester_id, requester_role, reason_code, details)
  values (p_job_id, v_uid, v_role, p_reason_code, p_details)
  returning id into v_id;
  perform private.record(p_job_id, 'cancellation_requested', v_uid, jsonb_build_object('reason', p_reason_code));
  perform private.notify(v_other, 'cancellation_requested', p_job_id, jsonb_build_object('title', v_job.title));
  perform private.notify_admins('cancellation_requested', p_job_id, jsonb_build_object('request_id', v_id));
  return v_id;
end;
$$;

create function public.withdraw_cancellation_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job uuid;
begin
  update public.cancellation_requests set status = 'withdrawn', decided_at = now()
  where id = p_request_id and requester_id = v_uid and status = 'pending'
  returning job_id into v_job;
  if v_job is null then
    raise exception 'no pending request found';
  end if;
  perform private.record(v_job, 'cancellation_withdrawn', v_uid);
end;
$$;

revoke execute on function
  public.set_my_areas(smallint[]), public.set_my_categories(smallint[]), public.set_available_today(boolean),
  public.update_worker_details(smallint, integer, text), public.record_job_view(uuid),
  public.express_interest(uuid), public.withdraw_interest(uuid),
  public.submit_quote(uuid, integer, timestamptz, timestamptz, integer, text, integer, text, text),
  public.withdraw_quote(uuid), public.start_job(uuid), public.complete_job(uuid),
  public.record_cash_worker(uuid, integer, text),
  public.request_cancellation(uuid, public.cancellation_reason, text),
  public.withdraw_cancellation_request(uuid)
from public, anon;

grant execute on function
  public.set_my_areas(smallint[]), public.set_my_categories(smallint[]), public.set_available_today(boolean),
  public.update_worker_details(smallint, integer, text), public.record_job_view(uuid),
  public.express_interest(uuid), public.withdraw_interest(uuid),
  public.submit_quote(uuid, integer, timestamptz, timestamptz, integer, text, integer, text, text),
  public.withdraw_quote(uuid), public.start_job(uuid), public.complete_job(uuid),
  public.record_cash_worker(uuid, integer, text),
  public.request_cancellation(uuid, public.cancellation_reason, text),
  public.withdraw_cancellation_request(uuid)
to authenticated;
