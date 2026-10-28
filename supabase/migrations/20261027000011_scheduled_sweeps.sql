-- 0011: hourly sweeps (docs/DB-API-DESIGN.md sections 7 and 9: items 3, 15, 18).
-- Thresholds come from app_settings. Drafts are NOT purged: they do not expire (item 7).

create extension if not exists pg_cron with schema pg_catalog;

-- Open-stage jobs older than job_expiry_hours expire; their live quotes expire with them.
-- A reminder goes to the resident at job_expiry_reminder_hours.
create function private.sweep_expired_jobs()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_expiry integer := private.setting_int('job_expiry_hours', 24);
  v_remind integer := private.setting_int('job_expiry_reminder_hours', 20);
  r record;
  w record;
begin
  for r in
    select id, resident_id, title from public.jobs
    where status in ('open', 'interested', 'quoted') and posted_at + make_interval(hours => v_expiry) <= now()
    for update skip locked
  loop
    for w in
      select worker_id from public.job_interests where job_id = r.id and withdrawn_at is null
      union
      select worker_id from public.quotes where job_id = r.id and status = 'sent'
    loop
      perform private.notify(w.worker_id, 'job_expired', r.id, jsonb_build_object('title', r.title));
    end loop;
    update public.quotes set status = 'expired', decided_at = now() where job_id = r.id and status = 'sent';
    update public.jobs set status = 'expired' where id = r.id;
    perform private.record(r.id, 'expired', null);
    perform private.notify(r.resident_id, 'job_expired', r.id, jsonb_build_object('title', r.title));
  end loop;

  for r in
    select j.id, j.resident_id, j.title from public.jobs j
    where j.status in ('open', 'interested', 'quoted')
      and j.posted_at + make_interval(hours => v_remind) <= now()
      and not exists (select 1 from public.job_events e where e.job_id = j.id and e.event_type = 'expiry_reminder')
  loop
    perform private.record(r.id, 'expiry_reminder', null);
    perform private.notify(r.resident_id, 'job_expiring', r.id, jsonb_build_object('title', r.title));
  end loop;
end;
$$;

-- Flags (never changes status) jobs that sat in a stage too long. Progress clears the flag in the RPCs.
create function private.sweep_stuck_jobs()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select id, resident_id, accepted_worker_id, title,
      case status
        when 'scheduled' then 'scheduled_not_started'
        when 'in_progress' then 'in_progress_not_completed'
        else 'cash_not_recorded'
      end as reason
    from public.jobs
    where stuck_since is null and (
      (status = 'scheduled' and scheduled_start + make_interval(hours => private.setting_int('stuck_scheduled_hours', 24)) <= now())
      or (status = 'in_progress' and started_at + make_interval(hours => private.setting_int('stuck_in_progress_hours', 48)) <= now())
      or (status = 'completed' and completed_at + make_interval(hours => private.setting_int('stuck_cash_hours', 48)) <= now())
    )
    for update skip locked
  loop
    update public.jobs set stuck_since = now(), stuck_reason = r.reason where id = r.id;
    perform private.record(r.id, 'stuck', null, jsonb_build_object('reason', r.reason));
    perform private.notify(r.resident_id, 'job_stuck', r.id, jsonb_build_object('title', r.title, 'reason', r.reason));
    perform private.notify(r.accepted_worker_id, 'job_stuck', r.id, jsonb_build_object('title', r.title, 'reason', r.reason));
    perform private.notify_admins('job_stuck', r.id, jsonb_build_object('reason', r.reason));
  end loop;
end;
$$;

-- One reminder, 24 hours after completion, while the review window is still open.
create function private.sweep_rating_reminders()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_window integer := private.setting_int('review_window_days', 7);
  r record;
begin
  for r in
    select j.id, j.resident_id, j.title from public.jobs j
    where j.status = 'cash_collected'
      and j.completed_at + interval '24 hours' <= now()
      and j.completed_at + make_interval(days => v_window) > now()
      and not exists (select 1 from public.job_events e where e.job_id = j.id and e.event_type = 'rating_reminder')
  loop
    perform private.record(r.id, 'rating_reminder', null);
    perform private.notify(r.resident_id, 'rate_worker', r.id, jsonb_build_object('title', r.title));
  end loop;
end;
$$;

select cron.schedule('dw-hourly-sweeps', '5 * * * *', $cron$
  select private.sweep_expired_jobs();
  select private.sweep_stuck_jobs();
  select private.sweep_rating_reminders();
$cron$);
