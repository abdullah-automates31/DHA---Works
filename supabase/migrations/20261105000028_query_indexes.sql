-- Index audit (improvement list, 5 Nov). Only columns that queries filter, join or sort by, found by listing every
-- foreign key without a supporting index and checking which ones the database, the apps or the admin portal read by.
-- Foreign keys that are only ever written (decided_by, called_by, author_id, assigned_to, invited_by, actor_id ...)
-- are deliberately NOT indexed: an index there would only slow down every write on the free tier.
--
--  worker_categories (category_id)  categories_with_counts joins workers to a trade by category_id; the primary key
--                                   starts with worker_id, so it cannot serve this direction ("who does plumbing").
--  report_photos / report_notes / report_calls (report_id)
--                                   opening a report loads its photos, staff notes and call log by report_id.
--  reports (against_id)             "reports about this worker" (suspension decisions, the worker's history).
--
-- The worker app's own queries were already covered (jobs_feed_idx, job_photos (job_id, sort), quotes_job_idx,
-- job_interests_worker_idx, notifications_user_idx, and 0027's notifications_unread_idx).

create index worker_categories_category_idx on public.worker_categories (category_id);
create index report_photos_report_idx on public.report_photos (report_id);
create index report_notes_report_idx on public.report_notes (report_id);
create index report_calls_report_idx on public.report_calls (report_id);
create index reports_against_idx on public.reports (against_id);
