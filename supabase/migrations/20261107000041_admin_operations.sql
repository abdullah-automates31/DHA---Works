-- Migration 0041: admin operations (portal screens A07 to A11 and A09): reports, jobs, cancellation requests, helpline log.
--
-- Every function needs a VERIFIED admin session (`is_admin()`, migration 0037) and refuses everyone else with the same
-- "not available" error. Reads return only what the screen shows (no CNIC, no document paths except photos of the case).
-- Every action writes the audit log in the same transaction, with the staff member's reason. Lists are paged (50 at most).
--
-- Rules that are decided here and recorded in docs/OPEN-QUESTIONS.md:
--   * A report is resolved with one of three outcomes (no action, warning, suspend); "keep open" only marks it in review.
--     A warning is a notification to the person reported (the staff reason is the message). A suspension reuses
--     admin_set_account_status (ends sessions, flags the worker's live jobs).
--   * Staff can cancel a job that is not yet paid (open to disputed). Paid jobs (cash_collected, reviewed) never cancel.
--   * Staff can replace the worker of a SCHEDULED job (same rule as the resident's replace_worker) and resume a job that
--     was flagged "under review" once the cause is gone.
--   * The helpline log is a staff-only table. It stores a caller's name and phone; the retention period is not decided.

-- Escapes a search term for ILIKE; null when there is nothing to search for.
create function private.like_pattern(p_search text)
returns text
language plpgsql immutable set search_path = ''
as $$
begin
  if nullif(btrim(coalesce(p_search, '')), '') is null then
    return null;
  end if;
  if char_length(p_search) > 80 then
    raise exception 'search is too long';
  end if;
  return '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
end;
$$;

revoke all on function private.like_pattern(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Reports (A07, A08)
-- ---------------------------------------------------------------------------------------------------------------

create function public.admin_reports_counts()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_week timestamptz := (date_trunc('week', now() at time zone 'Asia/Karachi')) at time zone 'Asia/Karachi';
  v_month timestamptz := (date_trunc('month', now() at time zone 'Asia/Karachi')) at time zone 'Asia/Karachi';
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'open', (select count(*) from public.reports where status <> 'resolved'),
    'resolved', (select count(*) from public.reports where status = 'resolved'),
    'all', (select count(*) from public.reports),
    'open_by_kind', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb)
                       from (select kind::text, count(*) as n from public.reports where status <> 'resolved' group by kind) k),
    'resolved_this_week', (select count(*) from public.reports where status = 'resolved' and resolved_at >= v_week),
    'resolved_last_week', (select count(*) from public.reports
                            where status = 'resolved' and resolved_at >= v_week - interval '7 days' and resolved_at < v_week),
    'unsafe_month', (select count(*) from public.reports where kind = 'unsafe' and created_at >= v_month),
    'unsafe_open', (select count(*) from public.reports where kind = 'unsafe' and created_at >= v_month and status <> 'resolved'),
    'cash_disputes_month', (select count(*) from public.reports where kind = 'cash_price' and created_at >= v_month),
    'first_call_minutes', (select round(avg(greatest(0, extract(epoch from (c.first_call - r.created_at)) / 60)))
                             from public.reports r
                             join lateral (select min(called_at) as first_call from public.report_calls where report_id = r.id) c
                               on c.first_call is not null
                            where r.kind = 'unsafe' and r.created_at >= v_month)
  );
end;
$$;

create function public.admin_reports_list(
  p_tab text default 'open',
  p_kind public.report_kind default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_like text;
  v_total integer;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if p_tab is null or p_tab not in ('open', 'resolved', 'all') then
    raise exception 'tab must be open, resolved or all';
  end if;
  v_like := private.like_pattern(p_search);

  with m as (
    select r.id, r.code, r.kind, r.status, r.action, r.created_at, r.resolved_at, r.system_generated, r.reporter_role,
           j.code as job_code, j.title as job_title, rp.full_name as reporter_name, ap.full_name as against_name
      from public.reports r
      join public.jobs j on j.id = r.job_id
      join public.profiles rp on rp.id = r.reporter_id
      join public.profiles ap on ap.id = r.against_id
     where (p_tab = 'all' or (p_tab = 'open' and r.status <> 'resolved') or (p_tab = 'resolved' and r.status = 'resolved'))
       and (p_kind is null or r.kind = p_kind)
       and (v_like is null or r.code ilike v_like or j.code ilike v_like or j.title ilike v_like
            or rp.full_name ilike v_like or ap.full_name ilike v_like)
  ), pg as (
    select * from m order by (kind = 'unsafe' and status <> 'resolved') desc, created_at desc, id limit v_limit offset v_offset
  )
  select (select count(*) from m),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', pg.id, 'code', pg.code, 'kind', pg.kind, 'status', pg.status, 'action', pg.action,
           'created_at', pg.created_at, 'resolved_at', pg.resolved_at, 'system_generated', pg.system_generated,
           'reporter_name', pg.reporter_name, 'reporter_role', pg.reporter_role,
           'against_name', pg.against_name,
           'against_role', case when pg.reporter_role = 'worker' then 'resident' else 'worker' end,
           'job_code', pg.job_code, 'job_title', pg.job_title)
           order by (pg.kind = 'unsafe' and pg.status <> 'resolved') desc, pg.created_at desc, pg.id), '[]'::jsonb)
    into v_total, v_rows
    from pg;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

-- The case screen. Phones are shown so staff can call both people (unsafe cases are called back at once).
create function public.admin_report_detail(p_report uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_r public.reports;
  v_j public.jobs;
  v_out jsonb;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  select * into v_r from public.reports where id = p_report;
  if not found then
    raise exception 'no such case';
  end if;
  select * into v_j from public.jobs where id = v_r.job_id;

  v_out := jsonb_build_object(
    'report', jsonb_build_object(
      'id', v_r.id, 'code', v_r.code, 'kind', v_r.kind, 'status', v_r.status, 'action', v_r.action,
      'action_reason', v_r.action_reason, 'reason_text', v_r.reason_text, 'system_generated', v_r.system_generated,
      'created_at', v_r.created_at, 'resolved_at', v_r.resolved_at, 'assigned_to', v_r.assigned_to,
      'assigned_to_name', (select full_name from public.profiles where id = v_r.assigned_to)),
    'reporter', (select jsonb_build_object(
        'id', p.id, 'name', p.full_name, 'role', v_r.reporter_role, 'phone', p.phone, 'account_status', p.account_status,
        'detail', case when v_r.reporter_role = 'worker'
                       then (select string_agg(c.name, ', ' order by c.sort) from public.worker_categories wc
                               join public.categories c on c.id = wc.category_id where wc.worker_id = p.id)
                       else 'Phase ' || v_j.phase || ', ' || v_j.lane end)
                   from public.profiles p where p.id = v_r.reporter_id),
    'against', (select jsonb_build_object(
        'id', p.id, 'name', p.full_name, 'role', p.role, 'phone', p.phone, 'account_status', p.account_status,
        'detail', case when p.role = 'worker'
                       then (select string_agg(c.name, ', ' order by c.sort) from public.worker_categories wc
                               join public.categories c on c.id = wc.category_id where wc.worker_id = p.id)
                       else 'Phase ' || v_j.phase || ', ' || v_j.lane end)
                  from public.profiles p where p.id = v_r.against_id),
    'job', jsonb_build_object(
      'id', v_j.id, 'code', v_j.code, 'title', v_j.title, 'status', v_j.status, 'phase', v_j.phase, 'lane', v_j.lane,
      'plot_no', (select plot_no from public.job_private where job_id = v_j.id),
      'started_at', v_j.started_at,
      'quote_total', (select total from public.quotes where id = v_j.accepted_quote_id)),
    'photos', (select coalesce(jsonb_agg(storage_path order by id), '[]'::jsonb) from public.report_photos where report_id = p_report),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'note', n.note, 'created_at', n.created_at,
                                                          'author_name', (select full_name from public.profiles where id = n.author_id))
                                       order by n.created_at), '[]'::jsonb)
                from public.report_notes n where n.report_id = p_report),
    'calls', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'called_id', c.called_id, 'called_name', (select full_name from public.profiles where id = c.called_id),
                                                          'outcome', c.outcome, 'called_at', c.called_at,
                                                          'called_by_name', (select full_name from public.profiles where id = c.called_by))
                                       order by c.called_at), '[]'::jsonb)
                from public.report_calls c where c.report_id = p_report));

  insert into public.audit_log (actor_id, action, table_name, record_id)
  values (auth.uid(), 'report_viewed', 'reports', p_report::text);
  return v_out;
end;
$$;

-- keep_open = mark in review and take the case; warning / suspend / close = resolve with that outcome (reason required).
create function public.admin_report_decide(p_report uuid, p_choice text, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.reports;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_action public.report_action;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if p_choice is null or p_choice not in ('keep_open', 'warning', 'suspend', 'close') then
    raise exception 'choose what to do with this case';
  end if;
  select * into v_r from public.reports where id = p_report for update;
  if not found then
    raise exception 'no such case';
  end if;
  if v_r.status = 'resolved' then
    raise exception 'this case is already resolved';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'the reason is too long (500 characters at most)';
  end if;

  if p_choice = 'keep_open' then
    update public.reports set status = 'in_review', assigned_to = coalesce(assigned_to, v_uid) where id = p_report;
    insert into public.audit_log (actor_id, action, table_name, record_id, old_data, new_data, reason)
    values (v_uid, 'report_in_review', 'reports', p_report::text, jsonb_build_object('status', v_r.status),
            jsonb_build_object('status', 'in_review'), v_reason);
    return;
  end if;

  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'write a reason for this decision (3 to 500 characters)';
  end if;
  v_action := (case p_choice when 'warning' then 'warning' when 'suspend' then 'suspend' else 'no_action' end)::public.report_action;

  if p_choice = 'suspend' and (select account_status from public.profiles where id = v_r.against_id) = 'active' then
    perform public.admin_set_account_status(v_r.against_id, true, v_reason);
  end if;

  update public.reports
     set status = 'resolved', action = v_action, action_reason = v_reason, resolved_at = now(),
         assigned_to = coalesce(assigned_to, v_uid)
   where id = p_report;

  if p_choice = 'warning' then
    perform private.notify(v_r.against_id, 'report_warning', v_r.job_id, jsonb_build_object('message', v_reason));
  end if;

  -- The job was flagged for staff when an unsafe or price report came in; unflag it when no such report is left open.
  update public.jobs set under_review_reason = null
   where id = v_r.job_id and under_review_reason like 'report\_%'
     and not exists (select 1 from public.reports o
                      where o.job_id = v_r.job_id and o.id <> p_report and o.status <> 'resolved' and o.kind in ('unsafe', 'cash_price'));

  insert into public.audit_log (actor_id, action, table_name, record_id, old_data, new_data, reason)
  values (v_uid, 'report_resolved', 'reports', p_report::text, jsonb_build_object('status', v_r.status),
          jsonb_build_object('status', 'resolved', 'action', v_action), v_reason);
end;
$$;

create function public.admin_report_add_note(p_report uuid, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if v_note is null or char_length(v_note) > 1000 then
    raise exception 'write a note (1000 characters at most)';
  end if;
  if not exists (select 1 from public.reports where id = p_report) then
    raise exception 'no such case';
  end if;
  insert into public.report_notes (report_id, author_id, note) values (p_report, auth.uid(), v_note);
  insert into public.audit_log (actor_id, action, table_name, record_id)
  values (auth.uid(), 'report_note_added', 'reports', p_report::text);
end;
$$;

-- Records that staff called one of the two people on the case. The first call moves a new case to "in review".
create function public.admin_report_log_call(p_report uuid, p_called uuid, p_outcome text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.reports;
  v_outcome text := nullif(btrim(coalesce(p_outcome, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  select * into v_r from public.reports where id = p_report for update;
  if not found then
    raise exception 'no such case';
  end if;
  if p_called is null or p_called not in (v_r.reporter_id, v_r.against_id) then
    raise exception 'choose one of the two people on this case';
  end if;
  if v_outcome is not null and char_length(v_outcome) > 300 then
    raise exception 'the call note is too long (300 characters at most)';
  end if;
  insert into public.report_calls (report_id, called_id, called_by, outcome) values (p_report, p_called, v_uid, v_outcome);
  if v_r.status = 'new' then
    update public.reports set status = 'in_review', assigned_to = coalesce(assigned_to, v_uid) where id = p_report;
  end if;
  insert into public.audit_log (actor_id, action, table_name, record_id, new_data)
  values (v_uid, 'report_call_logged', 'reports', p_report::text, jsonb_build_object('called', p_called));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Jobs (A10, A11)
-- ---------------------------------------------------------------------------------------------------------------

create function public.admin_jobs_counts()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'total', (select count(*) from public.jobs where status <> 'draft'),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                    from (select status::text, count(*) as n from public.jobs where status <> 'draft' group by status) s),
    'cancellations_pending', (select count(*) from public.cancellation_requests where status = 'pending')
  );
end;
$$;

create function public.admin_jobs_list(
  p_status public.job_status default null,
  p_phase smallint default null,
  p_category smallint default null,
  p_today boolean default false,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_today timestamptz := (date_trunc('day', now() at time zone 'Asia/Karachi')) at time zone 'Asia/Karachi';
  v_like text;
  v_total integer;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  v_like := private.like_pattern(p_search);

  with m as (
    select j.id, j.code, j.title, j.status, j.phase, j.updated_at, c.name as category,
           rp.full_name as resident_name, wp.full_name as worker_name,
           coalesce((select q.total from public.quotes q where q.id = j.accepted_quote_id),
                    (select q.total from public.quotes q where q.job_id = j.id and q.status = 'sent' order by q.created_at desc limit 1)) as quote_total,
           (select count(*) from public.reports r where r.job_id = j.id and r.status <> 'resolved') as open_reports,
           exists (select 1 from public.cancellation_requests x where x.job_id = j.id and x.status = 'pending') as cancel_pending,
           j.under_review_reason
      from public.jobs j
      join public.categories c on c.id = j.category_id
      join public.profiles rp on rp.id = j.resident_id
      left join public.profiles wp on wp.id = j.accepted_worker_id
     where j.status <> 'draft'
       and (p_status is null or j.status = p_status)
       and (p_phase is null or j.phase = p_phase)
       and (p_category is null or j.category_id = p_category)
       and (not coalesce(p_today, false) or coalesce(j.posted_at, j.created_at) >= v_today)
       and (v_like is null or j.code ilike v_like or j.title ilike v_like or rp.full_name ilike v_like or wp.full_name ilike v_like)
  ), pg as (
    select * from m order by updated_at desc, id limit v_limit offset v_offset
  )
  select (select count(*) from m),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', pg.id, 'code', pg.code, 'title', pg.title, 'status', pg.status, 'phase', pg.phase, 'category', pg.category,
           'updated_at', pg.updated_at, 'resident_name', pg.resident_name, 'worker_name', pg.worker_name,
           'quote_total', pg.quote_total, 'open_reports', pg.open_reports, 'cancel_pending', pg.cancel_pending,
           'under_review_reason', pg.under_review_reason)
           order by pg.updated_at desc, pg.id), '[]'::jsonb)
    into v_total, v_rows
    from pg;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

create function public.admin_job_detail(p_job uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_j public.jobs;
  v_q public.quotes;
  v_out jsonb;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  select * into v_j from public.jobs where id = p_job and status <> 'draft';
  if not found then
    raise exception 'no such job';
  end if;
  select * into v_q from public.quotes where id = v_j.accepted_quote_id;

  v_out := jsonb_build_object(
    'job', jsonb_build_object(
      'id', v_j.id, 'code', v_j.code, 'title', v_j.title, 'description', v_j.description, 'status', v_j.status,
      'urgency', v_j.urgency, 'preferred_date', v_j.preferred_date, 'window_from', v_j.window_from, 'window_to', v_j.window_to,
      'scheduled_start', v_j.scheduled_start, 'scheduled_end', v_j.scheduled_end, 'posted_at', v_j.posted_at,
      'started_at', v_j.started_at, 'completed_at', v_j.completed_at, 'created_at', v_j.created_at,
      'under_review_reason', v_j.under_review_reason, 'stuck_since', v_j.stuck_since, 'stuck_reason', v_j.stuck_reason,
      'cancel_reason', v_j.cancel_reason,
      'cancelled_by_name', (select full_name from public.profiles where id = v_j.cancelled_by),
      'category', (select name from public.categories where id = v_j.category_id),
      'phase', v_j.phase, 'lane', v_j.lane,
      'plot_no', (select plot_no from public.job_private where job_id = v_j.id),
      'floor', (select floor from public.job_private where job_id = v_j.id),
      'voice_note_path', v_j.voice_note_path),
    'photos', (select coalesce(jsonb_agg(storage_path order by sort), '[]'::jsonb) from public.job_photos where job_id = v_j.id),
    'resident', (select jsonb_build_object('id', p.id, 'name', p.full_name,
                    'phone', coalesce((select resident_phone from public.job_private where job_id = v_j.id), p.phone),
                    'verified', p.verification_status = 'approved', 'account_status', p.account_status)
                   from public.profiles p where p.id = v_j.resident_id),
    'worker', (select jsonb_build_object('id', p.id, 'name', p.full_name, 'phone', p.phone, 'account_status', p.account_status,
                    'rating_avg', wd.rating_avg, 'rating_count', wd.rating_count, 'jobs_done', wd.jobs_done,
                    'category', (select string_agg(c.name, ', ' order by c.sort) from public.worker_categories wc
                                   join public.categories c on c.id = wc.category_id where wc.worker_id = p.id))
                 from public.profiles p left join public.worker_details wd on wd.profile_id = p.id
                where p.id = v_j.accepted_worker_id),
    'quote', case when v_q.id is null then null else jsonb_build_object(
                'labour', v_q.labour, 'materials', v_q.materials, 'materials_note', v_q.materials_note,
                'other_amount', v_q.other_amount, 'total', v_q.total, 'sent_at', v_q.created_at, 'decided_at', v_q.decided_at) end,
    'cash', (select jsonb_build_object('agreed_amount', c.agreed_amount, 'worker_amount', c.worker_amount,
                    'worker_recorded_at', c.worker_recorded_at, 'worker_reason', c.worker_reason,
                    'resident_amount', c.resident_amount, 'resident_confirmed_at', c.resident_confirmed_at,
                    'matched', c.matched, 'quote_difference', c.quote_difference)
               from public.cash_records c where c.job_id = v_j.id),
    'counts', jsonb_build_object(
      'interested', (select count(*) from public.job_interests where job_id = v_j.id and withdrawn_at is null),
      'quotes', (select count(*) from public.quotes where job_id = v_j.id)),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('type', e.event_type, 'at', e.created_at,
                                                           'actor_name', (select full_name from public.profiles where id = e.actor_id))
                                        order by e.created_at, e.id), '[]'::jsonb)
                 from (select * from public.job_events where job_id = v_j.id order by created_at desc, id desc limit 200) e),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'code', r.code, 'kind', r.kind, 'status', r.status,
                                                            'created_at', r.created_at, 'reporter_role', r.reporter_role)
                                         order by r.created_at desc), '[]'::jsonb)
                  from public.reports r where r.job_id = v_j.id),
    'cancellations', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'status', x.status, 'requester_role', x.requester_role,
                                                                  'reason_code', x.reason_code, 'details', x.details,
                                                                  'created_at', x.created_at, 'decision_note', x.decision_note,
                                                                  'requester_name', (select full_name from public.profiles where id = x.requester_id))
                                               order by x.created_at desc), '[]'::jsonb)
                        from public.cancellation_requests x where x.job_id = v_j.id));
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Cancelling, cancellation requests, resuming and replacing
-- ---------------------------------------------------------------------------------------------------------------

-- Shared by the staff cancel and by approving a request. Both people are told; the reason is kept on the job and in the audit log.
create function private.cancel_job(p_job uuid, p_actor uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job for update;
  if not found then
    raise exception 'no such job';
  end if;
  if v_job.status not in ('open', 'interested', 'quoted', 'scheduled', 'in_progress', 'completed', 'disputed') then
    raise exception 'a job that is % cannot be cancelled', replace(v_job.status::text, '_', ' ');
  end if;
  update public.jobs
     set status = 'cancelled', cancelled_by = p_actor, cancel_reason = p_reason,
         under_review_reason = null, stuck_since = null, stuck_reason = null
   where id = p_job;
  update public.quotes set status = 'withdrawn', decided_at = now() where job_id = p_job and status = 'sent';
  update public.cancellation_requests
     set status = 'approved', decided_by = p_actor, decided_at = now(), decision_note = coalesce(decision_note, p_reason)
   where job_id = p_job and status = 'pending';
  insert into public.job_events (job_id, event_type, actor_id) values (p_job, 'cancelled_by_staff', p_actor);
  insert into public.audit_log (actor_id, action, table_name, record_id, old_data, new_data, reason)
  values (p_actor, 'job_cancelled_by_staff', 'jobs', p_job::text, jsonb_build_object('status', v_job.status),
          jsonb_build_object('status', 'cancelled'), p_reason);
  perform private.notify(v_job.resident_id, 'job_cancelled', p_job, jsonb_build_object('title', v_job.title));
  if v_job.accepted_worker_id is not null then
    perform private.notify(v_job.accepted_worker_id, 'job_cancelled', p_job, jsonb_build_object('title', v_job.title));
  end if;
end;
$$;

revoke all on function private.cancel_job(uuid, uuid, text) from public, anon, authenticated;

create function public.admin_cancel_job(p_job uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'write a reason (3 to 500 characters)';
  end if;
  perform private.cancel_job(p_job, auth.uid(), v_reason);
end;
$$;

create function public.admin_cancellations_list(p_status text default 'pending', p_limit integer default 25, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('pending', 'approved', 'declined', 'withdrawn', 'all') then
    raise exception 'status must be pending, approved, declined, withdrawn or all';
  end if;
  with m as (
    select x.id, x.status, x.requester_role, x.reason_code, x.details, x.created_at, x.decided_at, x.decision_note,
           j.id as job_id, j.code as job_code, j.title as job_title, j.status as job_status, j.phase,
           rp.full_name as requester_name
      from public.cancellation_requests x
      join public.jobs j on j.id = x.job_id
      join public.profiles rp on rp.id = x.requester_id
     where p_status = 'all' or x.status::text = p_status
  ), pg as (
    select * from m order by (status = 'pending') desc, created_at, id limit v_limit offset v_offset
  )
  select (select count(*) from m),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', pg.id, 'status', pg.status, 'requester_role', pg.requester_role, 'requester_name', pg.requester_name,
           'reason_code', pg.reason_code, 'details', pg.details, 'created_at', pg.created_at, 'decided_at', pg.decided_at,
           'decision_note', pg.decision_note, 'job_id', pg.job_id, 'job_code', pg.job_code, 'job_title', pg.job_title,
           'job_status', pg.job_status, 'phase', pg.phase)
           order by (pg.status = 'pending') desc, pg.created_at, pg.id), '[]'::jsonb)
    into v_total, v_rows
    from pg;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

-- Approve = cancel the job; decline = the job carries on and the requester is told why.
create function public.admin_decide_cancellation(p_request uuid, p_approve boolean, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_x public.cancellation_requests;
  v_job public.jobs;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if p_approve is null then
    raise exception 'choose approve or decline';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'the note is too long (500 characters at most)';
  end if;
  select * into v_x from public.cancellation_requests where id = p_request for update;
  if not found or v_x.status <> 'pending' then
    raise exception 'this request is not waiting for a decision';
  end if;
  select * into v_job from public.jobs where id = v_x.job_id;

  if p_approve then
    perform private.cancel_job(v_x.job_id, v_uid,
      coalesce(v_note, format('Cancellation requested by the %s (%s)', v_x.requester_role, replace(v_x.reason_code::text, '_', ' '))));
    update public.cancellation_requests set decision_note = v_note where id = p_request and v_note is not null;
  else
    if v_note is null or char_length(v_note) < 3 then
      raise exception 'write a note the requester will see (3 to 500 characters)';
    end if;
    update public.cancellation_requests
       set status = 'declined', decided_by = v_uid, decided_at = now(), decision_note = v_note
     where id = p_request;
    insert into public.job_events (job_id, event_type, actor_id) values (v_x.job_id, 'cancellation_declined', v_uid);
    insert into public.audit_log (actor_id, action, table_name, record_id, reason)
    values (v_uid, 'cancellation_declined', 'cancellation_requests', p_request::text, v_note);
    perform private.notify(v_x.requester_id, 'cancellation_declined', v_x.job_id,
                           jsonb_build_object('title', v_job.title, 'message', v_note));
  end if;
end;
$$;

-- The flag "under review" (a suspended worker, an unsafe or price report) stays until staff clear it.
create function public.admin_job_resume(p_job uuid, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if v_note is null or char_length(v_note) < 3 or char_length(v_note) > 500 then
    raise exception 'write a note (3 to 500 characters)';
  end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found or v_job.under_review_reason is null then
    raise exception 'this job is not under review';
  end if;
  if v_job.accepted_worker_id is not null
     and (select account_status from public.profiles where id = v_job.accepted_worker_id) = 'suspended' then
    raise exception 'the worker is suspended: reactivate the worker first, or replace the worker, or cancel the job';
  end if;
  update public.jobs set under_review_reason = null where id = p_job;
  insert into public.job_events (job_id, event_type, actor_id) values (p_job, 'review_cleared', v_uid);
  insert into public.audit_log (actor_id, action, table_name, record_id, old_data, reason)
  values (v_uid, 'job_resumed', 'jobs', p_job::text, jsonb_build_object('under_review_reason', v_job.under_review_reason), v_note);
end;
$$;

-- Same rule as the resident's replace_worker (only before the work starts), done by staff, for example when the worker is suspended.
create function public.admin_job_replace_worker(p_job uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs;
  v_worker uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'write a reason (3 to 500 characters)';
  end if;
  select * into v_job from public.jobs where id = p_job for update;
  if not found then
    raise exception 'no such job';
  end if;
  if v_job.status <> 'scheduled' then
    raise exception 'the worker can only be replaced before the work starts';
  end if;
  if exists (select 1 from public.cancellation_requests where job_id = p_job and status = 'pending') then
    raise exception 'decide the cancellation request first';
  end if;
  v_worker := v_job.accepted_worker_id;
  update public.quotes set status = 'rejected', reject_reason = v_reason, decided_at = now() where id = v_job.accepted_quote_id;
  update public.jobs
     set status = 'open', accepted_quote_id = null, accepted_worker_id = null, scheduled_start = null, scheduled_end = null,
         under_review_reason = null, stuck_since = null, stuck_reason = null
   where id = p_job;
  update public.job_interests set withdrawn_at = now() where job_id = p_job and worker_id = v_worker and withdrawn_at is null;
  perform private.recompute_job_stage(p_job);
  if v_worker is not null then
    perform private.notify(v_worker, 'quote_rejected', p_job, jsonb_build_object('title', v_job.title));
  end if;
  perform private.notify(v_job.resident_id, 'worker_replaced_by_staff', p_job, jsonb_build_object('title', v_job.title));
  insert into public.job_events (job_id, event_type, actor_id, resident_only) values (p_job, 'worker_replaced_by_staff', v_uid, true);
  insert into public.audit_log (actor_id, action, table_name, record_id, old_data, reason)
  values (v_uid, 'job_worker_replaced_by_staff', 'jobs', p_job::text, jsonb_build_object('worker', v_worker), v_reason);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Helpline log (A09). Staff-only table: no policy, no grant, reached only through the functions below.
-- ---------------------------------------------------------------------------------------------------------------

create table public.helpline_calls (
  id uuid primary key default gen_random_uuid(),
  called_at timestamptz not null default now(),
  caller_name text not null check (char_length(caller_name) between 2 and 100),
  caller_phone text not null check (caller_phone ~ '^[0-9+() -]{5,20}$'),
  caller_role text not null check (caller_role in ('resident', 'worker', 'other')),
  reason text not null check (reason in ('question', 'unsafe', 'cash_price', 'complaint')),
  outcome text not null check (outcome in ('answered', 'advised', 'callback_pending')),
  notes text check (notes is null or char_length(notes) <= 1000),
  report_id uuid references public.reports (id),
  callback_done_at timestamptz,
  logged_by uuid not null references public.profiles (id)
);

create index helpline_calls_time_idx on public.helpline_calls (called_at desc);
create index helpline_calls_callback_idx on public.helpline_calls (called_at) where outcome = 'callback_pending' and callback_done_at is null;
alter table public.helpline_calls enable row level security;

create function public.admin_log_call(
  p_name text, p_phone text, p_role text, p_reason text, p_outcome text, p_notes text, p_report_code text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_code text := upper(nullif(btrim(coalesce(p_report_code, '')), ''));
  v_report uuid;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if char_length(v_name) not between 2 and 100 then
    raise exception 'enter the caller''s name';
  end if;
  if v_phone !~ '^[0-9+() -]{5,20}$' then
    raise exception 'enter the caller''s phone number (digits, 5 to 20 characters)';
  end if;
  if p_role is null or p_role not in ('resident', 'worker', 'other') then
    raise exception 'choose who is calling';
  end if;
  if p_reason is null or p_reason not in ('question', 'unsafe', 'cash_price', 'complaint') then
    raise exception 'choose the reason for the call';
  end if;
  if p_outcome is null or p_outcome not in ('answered', 'advised', 'callback_pending') then
    raise exception 'choose the outcome';
  end if;
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception 'the notes are too long (1000 characters at most)';
  end if;
  if v_code is not null then
    select id into v_report from public.reports where code = v_code;
    if v_report is null then
      raise exception 'there is no case with that number';
    end if;
  end if;
  insert into public.helpline_calls (caller_name, caller_phone, caller_role, reason, outcome, notes, report_id, logged_by)
  values (v_name, v_phone, p_role, p_reason, p_outcome, v_notes, v_report, v_uid)
  returning id into v_id;
  insert into public.audit_log (actor_id, action, table_name, record_id)
  values (v_uid, 'helpline_call_logged', 'helpline_calls', v_id::text);
  return v_id;
end;
$$;

create function public.admin_helpline_summary()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today timestamptz := (date_trunc('day', now() at time zone 'Asia/Karachi')) at time zone 'Asia/Karachi';
  v_month timestamptz := (date_trunc('month', now() at time zone 'Asia/Karachi')) at time zone 'Asia/Karachi';
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'calls_today', (select count(*) from public.helpline_calls where called_at >= v_today),
    'answered_today', (select count(*) from public.helpline_calls where called_at >= v_today and outcome <> 'callback_pending'),
    'callbacks_pending', (select count(*) from public.helpline_calls where outcome = 'callback_pending' and callback_done_at is null),
    'oldest_callback_since', (select min(called_at) from public.helpline_calls where outcome = 'callback_pending' and callback_done_at is null),
    'cases_month', (select count(*) from public.helpline_calls where called_at >= v_month and report_id is not null),
    'unsafe_cases_month', (select count(*) from public.helpline_calls where called_at >= v_month and report_id is not null and reason = 'unsafe')
  );
end;
$$;

create function public.admin_helpline_list(
  p_range text default 'today', p_callback_only boolean default false, p_search text default null,
  p_limit integer default 25, p_offset integer default 0
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_today timestamptz := (date_trunc('day', now() at time zone 'Asia/Karachi')) at time zone 'Asia/Karachi';
  v_from timestamptz;
  v_like text;
  v_total integer;
  v_rows jsonb;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  if p_range is null or p_range not in ('today', 'week', 'all') then
    raise exception 'range must be today, week or all';
  end if;
  v_from := case p_range when 'today' then v_today when 'week' then v_today - interval '6 days' else '-infinity'::timestamptz end;
  v_like := private.like_pattern(p_search);

  with m as (
    select h.*, r.code as report_code
      from public.helpline_calls h left join public.reports r on r.id = h.report_id
     where h.called_at >= v_from
       and (not coalesce(p_callback_only, false) or (h.outcome = 'callback_pending' and h.callback_done_at is null))
       and (v_like is null or h.caller_name ilike v_like or h.caller_phone ilike v_like or r.code ilike v_like)
  ), pg as (
    select * from m order by called_at desc, id limit v_limit offset v_offset
  )
  select (select count(*) from m),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', pg.id, 'called_at', pg.called_at, 'caller_name', pg.caller_name, 'caller_phone', pg.caller_phone,
           'caller_role', pg.caller_role, 'reason', pg.reason, 'outcome', pg.outcome, 'notes', pg.notes,
           'report_code', pg.report_code, 'report_id', pg.report_id, 'callback_done_at', pg.callback_done_at)
           order by pg.called_at desc, pg.id), '[]'::jsonb)
    into v_total, v_rows
    from pg;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

create function public.admin_helpline_callback_done(p_call uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;
  update public.helpline_calls set callback_done_at = now()
   where id = p_call and outcome = 'callback_pending' and callback_done_at is null;
  if not found then
    raise exception 'no callback is waiting for this call';
  end if;
  insert into public.audit_log (actor_id, action, table_name, record_id)
  values (auth.uid(), 'helpline_callback_done', 'helpline_calls', p_call::text);
end;
$$;

-- Grants ----------------------------------------------------------------------------------------------------------
revoke all on function
  public.admin_reports_counts(),
  public.admin_reports_list(text, public.report_kind, text, integer, integer),
  public.admin_report_detail(uuid),
  public.admin_report_decide(uuid, text, text),
  public.admin_report_add_note(uuid, text),
  public.admin_report_log_call(uuid, uuid, text),
  public.admin_jobs_counts(),
  public.admin_jobs_list(public.job_status, smallint, smallint, boolean, text, integer, integer),
  public.admin_job_detail(uuid),
  public.admin_cancel_job(uuid, text),
  public.admin_cancellations_list(text, integer, integer),
  public.admin_decide_cancellation(uuid, boolean, text),
  public.admin_job_resume(uuid, text),
  public.admin_job_replace_worker(uuid, text),
  public.admin_log_call(text, text, text, text, text, text, text),
  public.admin_helpline_summary(),
  public.admin_helpline_list(text, boolean, text, integer, integer),
  public.admin_helpline_callback_done(uuid)
from public, anon;
grant execute on function
  public.admin_reports_counts(),
  public.admin_reports_list(text, public.report_kind, text, integer, integer),
  public.admin_report_detail(uuid),
  public.admin_report_decide(uuid, text, text),
  public.admin_report_add_note(uuid, text),
  public.admin_report_log_call(uuid, uuid, text),
  public.admin_jobs_counts(),
  public.admin_jobs_list(public.job_status, smallint, smallint, boolean, text, integer, integer),
  public.admin_job_detail(uuid),
  public.admin_cancel_job(uuid, text),
  public.admin_cancellations_list(text, integer, integer),
  public.admin_decide_cancellation(uuid, boolean, text),
  public.admin_job_resume(uuid, text),
  public.admin_job_replace_worker(uuid, text),
  public.admin_log_call(text, text, text, text, text, text, text),
  public.admin_helpline_summary(),
  public.admin_helpline_list(text, boolean, text, integer, integer),
  public.admin_helpline_callback_done(uuid)
to authenticated;
