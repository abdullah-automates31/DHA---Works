-- LOCAL DEVELOPMENT ONLY. Marks one phone-auth test worker as approved, like staff would.
-- Never run it against hosted DEV or production.
-- Apply:  docker exec -i supabase_db_dha-works psql -U postgres -d postgres -v phone=+923001234567 < supabase/dev/approve_local_phone_worker.sql
-- Undo:   set the status back with the same kind of statement.

update public.profiles
set verification_status = 'approved', verification_reason = null, verification_updated_at = now()
where role = 'worker' and phone = :'phone';
