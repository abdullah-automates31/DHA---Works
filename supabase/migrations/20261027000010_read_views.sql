-- 0010: read APIs for the mobile apps.
--
-- These views deliberately run with the owner's rights (security_invoker = false) because they join
-- data the caller cannot read directly (e.g. a resident reading a quoting worker's name and rating).
-- Every view filters on auth.uid() itself, exposes only the columns the screens need, and is granted
-- to signed-in users only. Supabase's advisor flags such views; that warning is expected here.

-- C05: category tiles with "412 pros nearby" (workers covering the resident's default phase).
create view public.categories_with_counts with (security_invoker = false) as
select c.id, c.slug, c.name, c.subtitle, c.sort,
  (select count(*)
   from public.profiles p
   join public.worker_categories wc on wc.worker_id = p.id and wc.category_id = c.id
   where p.role = 'worker' and p.verification_status = 'approved' and p.account_status = 'active'
     and (dp.phase is null or exists (
       select 1 from public.worker_areas wa where wa.worker_id = p.id and wa.phase = dp.phase))
  ) as pros_nearby
from public.categories c
left join lateral (
  select a.phase from public.addresses a where a.resident_id = (select auth.uid()) and a.is_default limit 1
) dp on true
where c.active;

-- C05, C11: the resident's own jobs with counts for the cards.
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
  exists (select 1 from public.cancellation_requests r where r.job_id = j.id and r.status = 'pending') as cancellation_pending
from public.jobs j
join public.categories c on c.id = j.category_id
where j.resident_id = (select auth.uid());

-- C19, C12: quotes on the resident's jobs with the worker's public profile.
-- The worker's phone appears only on the accepted quote.
create view public.resident_quotes with (security_invoker = false) as
select q.id, q.job_id, q.status, q.labour, q.materials, q.materials_note, q.other_amount, q.other_note,
  q.total, q.visit_start, q.visit_end, q.note, q.created_at,
  q.worker_id, p.full_name as worker_name, p.avatar_path,
  wd.rating_avg, wd.rating_count, wd.jobs_done, wd.experience_years, wd.visit_fee, wd.voice_intro_path,
  (wd.jobs_done >= private.setting_int('top_rated_min_jobs', 10)
   and wd.rating_avg >= (public.get_setting('top_rated_min_rating') #>> '{}')::numeric) as is_top_rated,
  case when q.status = 'accepted' then p.phone end as worker_phone
from public.quotes q
join public.jobs j on j.id = q.job_id
join public.profiles p on p.id = q.worker_id
join public.worker_details wd on wd.profile_id = q.worker_id
where j.resident_id = (select auth.uid())
  and q.status in ('sent', 'accepted', 'rejected', 'not_selected');

-- W06, W07: open jobs matching the worker's trades and phases, minus jobs they already engaged with.
-- Shows phase and lane only; no plot, floor or phone.
create view public.worker_feed with (security_invoker = false) as
select j.id, j.code, j.status, j.title, j.description, j.category_id, c.name as category_name,
  j.phase, j.lane, j.urgency, j.preferred_date, j.window_from, j.window_to, j.voice_note_path, j.posted_at,
  j.posted_at + make_interval(hours => private.setting_int('job_expiry_hours', 24)) as expires_at,
  (select count(*) from public.job_interests i where i.job_id = j.id and i.withdrawn_at is null) as interest_count,
  (select count(*) from public.job_views v where v.job_id = j.id) as viewed_count,
  (select count(*) from public.job_photos p where p.job_id = j.id) as photo_count,
  (select p.storage_path from public.job_photos p where p.job_id = j.id order by p.sort limit 1) as thumb_path
from public.jobs j
join public.categories c on c.id = j.category_id
where j.status in ('open', 'interested', 'quoted')
  and j.posted_at + make_interval(hours => private.setting_int('job_expiry_hours', 24)) > now()
  and public.worker_matches_job(j.category_id, j.phase)
  and not public.worker_has_stake(j.id);

-- W06, W11, W12: the worker's own jobs (interested, quoted, won, history).
-- Resident name, phone, plot and floor appear only on jobs this worker won.
create view public.worker_jobs with (security_invoker = false) as
select j.id, j.code, j.status, j.title, j.description, j.category_id, c.name as category_name,
  j.phase, j.lane, j.urgency, j.voice_note_path, j.posted_at,
  j.scheduled_start, j.scheduled_end, j.started_at, j.completed_at, j.stuck_since, j.under_review_reason,
  (j.accepted_worker_id = (select auth.uid())) as is_mine,
  mq.id as my_quote_id, mq.status as my_quote_status, mq.total as my_quote_total,
  case when j.accepted_worker_id = (select auth.uid()) then rp.full_name end as resident_name,
  case when j.accepted_worker_id = (select auth.uid()) then jp.resident_phone end as resident_phone,
  case when j.accepted_worker_id = (select auth.uid()) then jp.plot_no end as plot_no,
  case when j.accepted_worker_id = (select auth.uid()) then jp.floor end as floor,
  exists (select 1 from public.cancellation_requests r where r.job_id = j.id and r.status = 'pending') as cancellation_pending
from public.jobs j
join public.categories c on c.id = j.category_id
left join lateral (
  select q.id, q.status, q.total from public.quotes q
  where q.job_id = j.id and q.worker_id = (select auth.uid()) order by q.created_at desc limit 1
) mq on true
left join public.job_private jp on jp.job_id = j.id and j.accepted_worker_id = (select auth.uid())
left join public.profiles rp on rp.id = j.resident_id and j.accepted_worker_id = (select auth.uid())
where j.accepted_worker_id = (select auth.uid())
  or mq.id is not null
  or exists (select 1 from public.job_interests i where i.job_id = j.id and i.worker_id = (select auth.uid()));

-- W16: cash received (matched entries) and rating for a period; defaults to this week.
create function public.get_my_earnings(
  p_from timestamptz default date_trunc('week', now()), p_to timestamptz default now()
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := private.me('worker', false);
begin
  return (
    select jsonb_build_object(
      'cash_total', coalesce((select sum(cr.worker_amount) from public.cash_records cr
                              join public.jobs j on j.id = cr.job_id
                              where j.accepted_worker_id = v_uid and cr.matched
                                and j.completed_at >= p_from and j.completed_at <= p_to), 0),
      'jobs_count', (select count(*) from public.cash_records cr
                     join public.jobs j on j.id = cr.job_id
                     where j.accepted_worker_id = v_uid and cr.matched
                       and j.completed_at >= p_from and j.completed_at <= p_to),
      'rating_avg', wd.rating_avg,
      'rating_count', wd.rating_count,
      'jobs_done', wd.jobs_done)
    from public.worker_details wd where wd.profile_id = v_uid);
end;
$$;

revoke all on
  public.categories_with_counts, public.resident_jobs, public.resident_quotes, public.worker_feed, public.worker_jobs
from public, anon;
grant select on
  public.categories_with_counts, public.resident_jobs, public.resident_quotes, public.worker_feed, public.worker_jobs
to authenticated;

revoke execute on function public.get_my_earnings(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_my_earnings(timestamptz, timestamptz) to authenticated;
