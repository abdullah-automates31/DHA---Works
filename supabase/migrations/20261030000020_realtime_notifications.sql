-- Live updates in the apps: a new notification row is pushed over Realtime to its owner, and the app refreshes the
-- screens that depend on it (job lists, job status, the bell). Only public.notifications is published. Realtime
-- delivers a row only to a user whose own select policy lets them read it (notifications_read: the owner), so nobody
-- receives another user's notifications; the payload holds a job title and a type, never contact details.
-- Job tables are NOT published: workers and residents see different slices of them through views, which Realtime
-- cannot filter, so job screens refresh when the matching notification arrives instead.
alter publication supabase_realtime add table public.notifications;
