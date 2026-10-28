-- 0008: resident job RPCs. Each transition checks caller + current status, updates, and logs
-- (job_events + audit_log) in one transaction.

-- Creates or edits a draft. Phase and lane come from the chosen address; plot, floor and phone
-- go to job_private. Photos are replaced as a set (paths under "<user id>/").
create function public.save_job_draft(
  p_job_id uuid default null,
  p_category_id smallint default null,
  p_address_id uuid default null,
  p_title text default null,
  p_description text default null,
  p_urgency public.job_urgency default 'asap',
  p_preferred_date date default null,
  p_window_from time default null,
  p_window_to time default null,
  p_voice_note_path text default null,
  p_photo_paths text[] default '{}'
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('resident');
  v_addr public.addresses;
  v_phone text;
  v_id uuid := p_job_id;
  v_max integer := private.setting_int('max_job_photos', 6);
begin
  select * into v_addr from public.addresses where id = p_address_id and resident_id = v_uid;
  if not found then
    raise exception 'choose one of your addresses';
  end if;
  if not exists (select 1 from public.categories where id = p_category_id and active) then
    raise exception 'choose a category';
  end if;
  if coalesce(array_length(p_photo_paths, 1), 0) > v_max then
    raise exception 'at most % photos', v_max;
  end if;
  if p_voice_note_path is not null and p_voice_note_path not like v_uid::text || '/%' then
    raise exception 'invalid file path';
  end if;
  select phone into v_phone from public.profiles where id = v_uid;

  if v_id is null then
    insert into public.jobs (resident_id, category_id, address_id, phase, lane, title, description,
                             urgency, preferred_date, window_from, window_to, voice_note_path)
    values (v_uid, p_category_id, v_addr.id, v_addr.phase, v_addr.lane, trim(p_title), coalesce(p_description, ''),
            p_urgency, p_preferred_date, p_window_from, p_window_to, p_voice_note_path)
    returning id into v_id;
    insert into public.job_private (job_id, plot_no, floor, resident_phone)
    values (v_id, v_addr.plot_no, v_addr.floor, v_phone);
  else
    update public.jobs set category_id = p_category_id, address_id = v_addr.id, phase = v_addr.phase,
      lane = v_addr.lane, title = trim(p_title), description = coalesce(p_description, ''), urgency = p_urgency,
      preferred_date = p_preferred_date, window_from = p_window_from, window_to = p_window_to,
      voice_note_path = p_voice_note_path
    where id = v_id and resident_id = v_uid and status = 'draft';
    if not found then
      raise exception 'draft not found';
    end if;
    update public.job_private set plot_no = v_addr.plot_no, floor = v_addr.floor, resident_phone = v_phone
    where job_id = v_id;
  end if;

  delete from public.job_photos where job_id = v_id;
  insert into public.job_photos (job_id, storage_path, sort)
  select v_id, path, (ord - 1)::smallint
  from unnest(p_photo_paths) with ordinality as t(path, ord)
  where path like v_uid::text || '/%';
  return v_id;
end;
$$;

create function public.delete_draft(p_job_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('resident', false);
begin
  delete from public.jobs where id = p_job_id and resident_id = v_uid and status = 'draft';
  if not found then
    raise exception 'draft not found';
  end if;
end;
$$;

-- draft -> open. Starts the expiry clock and notifies matching workers.
create function public.post_job(p_job_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('resident');
  v_job public.jobs;
  v_photos integer;
begin
  select * into v_job from public.jobs where id = p_job_id and resident_id = v_uid for update;
  if not found or v_job.status <> 'draft' then
    raise exception 'draft not found';
  end if;
  select count(*) into v_photos from public.job_photos where job_id = p_job_id;
  if v_photos < 1 then
    raise exception 'add at least one photo';
  end if;
  if char_length(trim(v_job.description)) < 10 then
    raise exception 'describe the problem (at least 10 characters)';
  end if;
  if v_job.urgency = 'scheduled' and v_job.preferred_date is null then
    raise exception 'choose a preferred date';
  end if;

  update public.jobs set status = 'open', posted_at = now() where id = p_job_id;
  perform private.record(p_job_id, 'posted', v_uid);

  insert into public.notifications (user_id, type, job_id, payload)
  select p.id, 'new_job', p_job_id, jsonb_build_object('title', v_job.title, 'phase', v_job.phase)
  from public.profiles p
  where p.role = 'worker' and p.verification_status = 'approved' and p.account_status = 'active'
    and exists (select 1 from public.worker_categories wc where wc.worker_id = p.id and wc.category_id = v_job.category_id)
    and exists (select 1 from public.worker_areas wa where wa.worker_id = p.id and wa.phase = v_job.phase);
end;
$$;

-- Edit while the job is still plain "open" (no worker has shown interest). Category and address
-- are fixed once posted because they decide who was notified.
create function public.update_job(
  p_job_id uuid,
  p_title text,
  p_description text,
  p_urgency public.job_urgency,
  p_preferred_date date default null,
  p_window_from time default null,
  p_window_to time default null,
  p_voice_note_path text default null,
  p_photo_paths text[] default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('resident');
  v_job public.jobs;
  v_max integer := private.setting_int('max_job_photos', 6);
begin
  select * into v_job from public.jobs where id = p_job_id and resident_id = v_uid for update;
  if not found or v_job.status <> 'open' then
    raise exception 'only a job that has not received interest can be edited';
  end if;
  if p_photo_paths is not null and array_length(p_photo_paths, 1) > v_max then
    raise exception 'at most % photos', v_max;
  end if;
  update public.jobs set title = trim(p_title), description = p_description, urgency = p_urgency,
    preferred_date = p_preferred_date, window_from = p_window_from, window_to = p_window_to,
    voice_note_path = coalesce(p_voice_note_path, voice_note_path)
  where id = p_job_id;
  if p_photo_paths is not null then
    delete from public.job_photos where job_id = p_job_id;
    insert into public.job_photos (job_id, storage_path, sort)
    select p_job_id, path, (ord - 1)::smallint
    from unnest(p_photo_paths) with ordinality as t(path, ord)
    where path like v_uid::text || '/%';
  end if;
  perform private.record(p_job_id, 'edited', v_uid);
end;
$$;

-- Resident cancels before accepting anyone.
create function public.cancel_job(p_job_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('resident', false);
  v_job public.jobs;
  r record;
begin
  select * into v_job from public.jobs where id = p_job_id and resident_id = v_uid for update;
  if not found then
    raise exception 'job not found';
  end if;
  if v_job.status not in ('open', 'interested', 'quoted') then
    raise exception 'after a quote is accepted, request cancellation instead';
  end if;
  -- Workers who showed interest or quoted are told.
  for r in
    select worker_id from public.job_interests where job_id = p_job_id and withdrawn_at is null
    union
    select worker_id from public.quotes where job_id = p_job_id and status = 'sent'
  loop
    perform private.notify(r.worker_id, 'job_cancelled', p_job_id, jsonb_build_object('title', v_job.title));
  end loop;
  update public.quotes set status = 'expired', decided_at = now() where job_id = p_job_id and status = 'sent';
  update public.jobs set status = 'cancelled', cancelled_by = v_uid, cancel_reason = p_reason where id = p_job_id;
  perform private.record(p_job_id, 'cancelled', v_uid, jsonb_build_object('reason', p_reason));
end;
$$;

-- One atomic step: accept this quote, reject the rest, schedule the job. Can happen once.
create function public.accept_quote(p_quote_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('resident');
  v_job_id uuid;
  v_job public.jobs;
  v_quote public.quotes;
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

  update public.quotes set status = 'accepted', decided_at = now() where id = p_quote_id;
  for r in
    update public.quotes set status = 'not_selected', decided_at = now()
    where job_id = v_job_id and status = 'sent' and id <> p_quote_id
    returning worker_id
  loop
    perform private.notify(r.worker_id, 'quote_not_selected', v_job_id, jsonb_build_object('title', v_job.title));
  end loop;

  update public.jobs set status = 'scheduled', accepted_quote_id = p_quote_id, accepted_worker_id = v_quote.worker_id,
    scheduled_start = v_quote.visit_start, scheduled_end = v_quote.visit_end
  where id = v_job_id;
  insert into public.cash_records (job_id, agreed_amount) values (v_job_id, v_quote.total);

  perform private.record(v_job_id, 'quote_accepted', v_uid, jsonb_build_object('total', v_quote.total), true);
  perform private.record(v_job_id, 'scheduled', v_uid,
    jsonb_build_object('start', v_quote.visit_start, 'end', v_quote.visit_end));
  perform private.notify(v_quote.worker_id, 'quote_accepted', v_job_id,
    jsonb_build_object('title', v_job.title, 'start', v_quote.visit_start));
end;
$$;

-- The rejected worker cannot quote this job again (submit_quote enforces it).
create function public.reject_quote(p_quote_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('resident');
  v_job_id uuid;
  v_job public.jobs;
  v_quote public.quotes;
begin
  select job_id into v_job_id from public.quotes where id = p_quote_id;
  select * into v_job from public.jobs where id = v_job_id and resident_id = v_uid for update;
  if not found then
    raise exception 'quote not found';
  end if;
  if v_job.status not in ('interested', 'quoted') then
    raise exception 'this job can no longer change quotes';
  end if;
  select * into v_quote from public.quotes where id = p_quote_id;
  if v_quote.status <> 'sent' then
    raise exception 'this quote is no longer available';
  end if;
  update public.quotes set status = 'rejected', reject_reason = p_reason, decided_at = now() where id = p_quote_id;
  perform private.recompute_job_stage(v_job_id);
  perform private.record(v_job_id, 'quote_rejected', v_uid, '{}'::jsonb, true);
  perform private.notify(v_quote.worker_id, 'quote_rejected', v_job_id, jsonb_build_object('title', v_job.title));
end;
$$;

-- Resident's side of the cash exchange (amount is final once entered).
create function public.confirm_cash_resident(p_job_id uuid, p_amount integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('resident', false);
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id and resident_id = v_uid for update;
  if not found or v_job.status <> 'completed' then
    raise exception 'cash can be confirmed after the worker marks the job completed';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'enter the amount you paid';
  end if;
  update public.cash_records set resident_amount = p_amount, resident_confirmed_at = now()
  where job_id = p_job_id and resident_amount is null;
  if not found then
    raise exception 'you have already confirmed the amount';
  end if;
  perform private.record(p_job_id, 'cash_resident', v_uid);
  perform private.settle_cash(p_job_id);
end;
$$;

-- Both amounts present: equal closes the job, different flags a dispute.
create function private.settle_cash(p_job uuid)
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

  if v_cash.worker_amount = v_cash.resident_amount then
    update public.cash_records set matched = true, quote_difference = worker_amount - agreed_amount where job_id = p_job;
    update public.jobs set status = 'cash_collected', stuck_since = null, stuck_reason = null where id = p_job;
    update public.worker_details set jobs_done = jobs_done + 1 where profile_id = v_job.accepted_worker_id;
    perform private.record(p_job, 'cash_collected', null,
      jsonb_build_object('amount', v_cash.worker_amount, 'difference', v_cash.worker_amount - v_cash.agreed_amount));
    perform private.notify(v_job.resident_id, 'rate_worker', p_job, jsonb_build_object('title', v_job.title));
    perform private.notify(v_job.accepted_worker_id, 'cash_collected', p_job, jsonb_build_object('title', v_job.title));
  else
    update public.cash_records set matched = false where job_id = p_job;
    update public.jobs set status = 'disputed', stuck_since = null, stuck_reason = null where id = p_job;
    insert into public.reports (job_id, reporter_id, against_id, reporter_role, kind, reason_text, system_generated)
    values (p_job, v_job.resident_id, v_job.accepted_worker_id, 'resident', 'cash_price',
            format('Cash mismatch: worker entered %s, resident entered %s', v_cash.worker_amount, v_cash.resident_amount),
            true);
    perform private.record(p_job, 'disputed', null,
      jsonb_build_object('worker_amount', v_cash.worker_amount, 'resident_amount', v_cash.resident_amount));
    perform private.notify(v_job.resident_id, 'cash_disputed', p_job);
    perform private.notify(v_job.accepted_worker_id, 'cash_disputed', p_job);
    perform private.notify_admins('cash_disputed', p_job);
  end if;
end;
$$;

-- Resident rates the worker: once per job, after cash is collected, within review_window_days.
-- Rating shown to others is the mean of the three scores.
create function public.submit_review(
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
end;
$$;

revoke execute on function
  public.save_job_draft(uuid, smallint, uuid, text, text, public.job_urgency, date, time, time, text, text[]),
  public.delete_draft(uuid), public.post_job(uuid),
  public.update_job(uuid, text, text, public.job_urgency, date, time, time, text, text[]),
  public.cancel_job(uuid, text), public.accept_quote(uuid), public.reject_quote(uuid, text),
  public.confirm_cash_resident(uuid, integer),
  public.submit_review(uuid, smallint, smallint, smallint, boolean, text)
from public, anon;

grant execute on function
  public.save_job_draft(uuid, smallint, uuid, text, text, public.job_urgency, date, time, time, text, text[]),
  public.delete_draft(uuid), public.post_job(uuid),
  public.update_job(uuid, text, text, public.job_urgency, date, time, time, text, text[]),
  public.cancel_job(uuid, text), public.accept_quote(uuid), public.reject_quote(uuid, text),
  public.confirm_cash_resident(uuid, integer),
  public.submit_review(uuid, smallint, smallint, smallint, boolean, text)
to authenticated;
