-- Worker app W07/W08: show how many quotes a job already has next to how many workers are interested
-- (SPEC: workers see "interested" and "quoted" counts).
--
-- Adds one column, quote_count, at the END of worker_feed. interest_count and every existing column keep
-- their names, types and order, so nothing that reads the view changes. A quote counts while it is 'sent',
-- the same rule resident_jobs.quote_count uses (withdrawn, rejected and not-selected quotes do not count).
-- It is only a number: no worker names or amounts are exposed.
--
-- create or replace view keeps the existing grants (authenticated: select; anon and public: none).

create or replace view public.worker_feed with (security_invoker = false) as
select j.id, j.code, j.status, j.title, j.description, j.category_id, c.name as category_name,
  j.phase, j.lane, j.urgency, j.preferred_date, j.window_from, j.window_to, j.voice_note_path, j.posted_at,
  j.posted_at + make_interval(hours => private.setting_int('job_expiry_hours', 24)) as expires_at,
  (select count(*) from public.job_interests i where i.job_id = j.id and i.withdrawn_at is null) as interest_count,
  (select count(*) from public.job_views v where v.job_id = j.id) as viewed_count,
  (select count(*) from public.job_photos p where p.job_id = j.id) as photo_count,
  (select p.storage_path from public.job_photos p where p.job_id = j.id order by p.sort limit 1) as thumb_path,
  (select count(*) from public.quotes q where q.job_id = j.id and q.status = 'sent') as quote_count
from public.jobs j
join public.categories c on c.id = j.category_id
where j.status in ('open', 'interested', 'quoted')
  and j.posted_at + make_interval(hours => private.setting_int('job_expiry_hours', 24)) > now()
  and public.worker_matches_job(j.category_id, j.phase)
  and not public.worker_has_stake(j.id);
