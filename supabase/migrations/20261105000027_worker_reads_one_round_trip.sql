-- Worker app speed (improvement list, 5 Nov): fewer round trips and an index for the unread count.
--
-- 1) worker_feed gets thumb_paths: the storage paths of the first two photos (the design shows two thumbnails).
--    The app used to run a second query on job_photos after loading the feed. Now one query returns both.
-- 2) worker_jobs gets cash_recorded: true when the accepted worker has already entered their cash amount. The app
--    used to run a second query on cash_records for the completed jobs. Only a yes/no is exposed, never the amount,
--    and only to the accepted worker of that job (the same person row-level security already lets read it).
-- 3) worker_jobs finds the worker's jobs through their own quotes, interests and accepted jobs (all indexed) instead
--    of testing every job in the table. The extra condition is exactly the three cases the existing OR already
--    allowed, so the rows returned do not change; it only gives the planner an index to start from.
-- 4) notifications_unread_idx: the unread bell count on Home filters by user and read_at is null.
--
-- Both views keep every existing column, name, type and order; the new column is added at the END. create or replace
-- view keeps the existing grants (authenticated: select; anon and public: none), as in 0017.

create or replace view public.worker_feed with (security_invoker = false) as
select j.id, j.code, j.status, j.title, j.description, j.category_id, c.name as category_name,
  j.phase, j.lane, j.urgency, j.preferred_date, j.window_from, j.window_to, j.voice_note_path, j.posted_at,
  j.posted_at + make_interval(hours => private.setting_int('job_expiry_hours', 24)) as expires_at,
  (select count(*) from public.job_interests i where i.job_id = j.id and i.withdrawn_at is null) as interest_count,
  (select count(*) from public.job_views v where v.job_id = j.id) as viewed_count,
  (select count(*) from public.job_photos p where p.job_id = j.id) as photo_count,
  (select p.storage_path from public.job_photos p where p.job_id = j.id order by p.sort limit 1) as thumb_path,
  (select count(*) from public.quotes q where q.job_id = j.id and q.status = 'sent') as quote_count,
  (select array_agg(t.storage_path order by t.sort)
     from (select p.storage_path, p.sort from public.job_photos p where p.job_id = j.id order by p.sort limit 2) t) as thumb_paths
from public.jobs j
join public.categories c on c.id = j.category_id
where j.status in ('open', 'interested', 'quoted')
  and j.posted_at + make_interval(hours => private.setting_int('job_expiry_hours', 24)) > now()
  and public.worker_matches_job(j.category_id, j.phase)
  and not public.worker_has_stake(j.id);

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
  case when rj.hidden then null else j.window_to end as window_to,
  (j.accepted_worker_id = (select auth.uid())
    and exists (select 1 from public.cash_records cr where cr.job_id = j.id and cr.worker_amount is not null)) as cash_recorded
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
  and j.id in (
    select x.id from public.jobs x where x.accepted_worker_id = (select auth.uid())
    union
    select q2.job_id from public.quotes q2 where q2.worker_id = (select auth.uid())
    union
    select i2.job_id from public.job_interests i2 where i2.worker_id = (select auth.uid())
  )
  and (j.accepted_worker_id = (select auth.uid())
       or mq.id is not null
       or exists (select 1 from public.job_interests i where i.job_id = j.id and i.worker_id = (select auth.uid())));

create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
