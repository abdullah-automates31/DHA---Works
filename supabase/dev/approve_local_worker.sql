-- LOCAL DEVELOPMENT ONLY. There is no staff approval screen yet (the admin portal comes later), so this marks one
-- local test worker as approved, the way staff would. Never run it against hosted DEV or production.
-- Apply:  docker exec -i supabase_db_dha-works psql -U postgres -d postgres -v email=you@example.com < supabase/dev/approve_local_worker.sql
-- Undo:   set the status back to 'pending' or 'incomplete' with the same kind of statement.

update public.profiles
set verification_status = 'approved', verification_reason = null, verification_updated_at = now()
where role = 'worker' and email = :'email';
