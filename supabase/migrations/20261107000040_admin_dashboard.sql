-- Migration 0040: numbers for the admin dashboard (portal screen A02).
--
-- One read-only function, verified admin only. It returns counts and a short "needs attention" list in a single
-- round trip, so the dashboard is one query. Nothing here changes data and nothing is written to the audit log
-- (it is a summary, not a record view). The attention list names people and jobs, which an admin may see anyway.
--
-- Definitions (Karachi time for "today"):
--   workers / residents to review  = verification_status 'pending' (oldest waiting shown)
--   open reports                   = reports not yet resolved; "unsafe" counts the unsafe ones
--   jobs today                     = jobs posted today (drafts excluded); "in progress" = jobs in progress now
--   stages                         = open (open, interested, quoted), scheduled, in progress, completed,
--                                    cash collected (also reviewed), disputed
--   needs attention                = unresolved reports (unsafe first), applications waiting, pending cancellation
--                                    requests and stuck jobs; unsafe first, then oldest first, at most 10.

create function public.admin_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today timestamptz := (date_trunc('day', now() at time zone 'Asia/Karachi')) at time zone 'Asia/Karachi';
  v_out jsonb;
begin
  if not public.is_admin() then
    raise exception 'not available' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'workers_pending', (select jsonb_build_object('count', count(*), 'oldest_since', min(coalesce(verification_updated_at, created_at)))
                          from public.profiles where role = 'worker' and verification_status = 'pending'),
    'residents_pending', (select jsonb_build_object('count', count(*), 'oldest_since', min(coalesce(verification_updated_at, created_at)))
                            from public.profiles where role = 'resident' and verification_status = 'pending'),
    'reports_open', (select jsonb_build_object('count', count(*), 'unsafe', count(*) filter (where kind = 'unsafe'))
                       from public.reports where status <> 'resolved'),
    'jobs_today', (select jsonb_build_object(
                     'count', count(*) filter (where posted_at >= v_today and status <> 'draft'),
                     'in_progress', count(*) filter (where status = 'in_progress'))
                     from public.jobs),
    'stages', (select jsonb_build_object(
                 'open', count(*) filter (where status in ('open', 'interested', 'quoted')),
                 'scheduled', count(*) filter (where status in ('accepted', 'scheduled')),
                 'in_progress', count(*) filter (where status = 'in_progress'),
                 'completed', count(*) filter (where status = 'completed'),
                 'cash_collected', count(*) filter (where status in ('cash_collected', 'reviewed')),
                 'disputed', count(*) filter (where status = 'disputed'))
                 from public.jobs),
    'attention', (select coalesce(jsonb_agg(to_jsonb(a) order by a.rank, a.since, a.id), '[]'::jsonb)
                    from (
                      select * from (
                        select r.id::text as id, case when r.kind = 'unsafe' then 'unsafe' else 'report' end as kind,
                               case when r.kind = 'unsafe' then 0 else 2 end as rank,
                               r.code || ' · ' || replace(r.kind::text, '_', ' ') as title,
                               j.code || ' · ' || j.title || ' · Phase ' || j.phase as detail, r.created_at as since
                          from public.reports r join public.jobs j on j.id = r.job_id
                         where r.status <> 'resolved'
                        union all
                        select p.id::text, p.role::text, 2,
                               coalesce(p.full_name, 'An applicant') || ' is waiting for review',
                               initcap(p.role::text) || ' application', coalesce(p.verification_updated_at, p.created_at)
                          from public.profiles p
                         where p.role in ('worker', 'resident') and p.verification_status = 'pending'
                        union all
                        select c.id::text, 'cancellation', 2,
                               'Cancellation requested for ' || j.code,
                               j.title || ' · ' || replace(c.reason_code::text, '_', ' '), c.created_at
                          from public.cancellation_requests c join public.jobs j on j.id = c.job_id
                         where c.status = 'pending'
                        union all
                        select j.id::text, 'stuck', 2,
                               j.code || ' looks stuck',
                               j.title || ' · ' || coalesce(j.stuck_reason, 'no update'), j.stuck_since
                          from public.jobs j
                         where j.stuck_since is not null and j.status in ('scheduled', 'in_progress', 'completed')
                      ) u
                      order by u.rank, u.since, u.id
                      limit 10
                    ) a)
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;
