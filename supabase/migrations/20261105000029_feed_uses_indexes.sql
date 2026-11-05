-- worker_feed speed (improvement list, 5 Nov): the feed was a full scan of every open job.
--
-- Measured on the local stack with synthetic open jobs and one worker (trades 1 and 2, phase 6), the exact app query:
--     2,000 open jobs:   560 ms        20,000 open jobs:   4,274 ms
-- The rules were written as SECURITY DEFINER functions (worker_matches_job, worker_has_stake). Postgres cannot look
-- inside those, so it read every open job and ran the functions on each one, and could not use jobs_feed_idx
-- (category_id, phase, posted_at desc).
--
-- Same rules, written as plain SQL so the planner can use the indexes. Nothing a worker may see changes:
--   worker_matches_job(c, p)  =  approved active worker  AND  has trade c  AND  has phase p
--                             ->  (select is_active_approved('worker'))  AND  category_id in (the worker's trades)
--                                 AND  phase in (the worker's phases)
--   worker_has_stake(job)     =  has an interest (even withdrawn) OR has a quote on the job
--                             ->  two NOT EXISTS conditions, answered by job_interests_pkey and quotes_job_idx
--   posted_at + expiry > now()  ->  posted_at > now() - expiry, with the expiry setting read once, not per row
-- The `(select ...)` wrapper makes Postgres evaluate a stable function once per query instead of once per row (the
-- same pattern as `(select auth.uid())` throughout the schema).
--
-- Columns, their names, types and order are exactly those of 0027 (thumb_paths is still last). create or replace
-- view keeps the existing grants (authenticated: select; anon and public: none). The two helper functions stay: other
-- code still calls them.

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
  and j.posted_at > now() - make_interval(hours => (select private.setting_int('job_expiry_hours', 24)))
  and (select public.is_active_approved('worker'))
  and j.category_id in (select wc.category_id from public.worker_categories wc where wc.worker_id = (select auth.uid()))
  and j.phase in (select wa.phase from public.worker_areas wa where wa.worker_id = (select auth.uid()))
  and not exists (select 1 from public.job_interests i2 where i2.job_id = j.id and i2.worker_id = (select auth.uid()))
  and not exists (select 1 from public.quotes q2 where q2.job_id = j.id and q2.worker_id = (select auth.uid()));
