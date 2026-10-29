-- 0015: remove privileges the apps and the service role never use (reviewed and approved 29 Oct).
-- Tested by supabase/tests/default_privileges.test.sql.
--
-- Supabase's default privileges for role postgres in schema public give anon, authenticated and
-- service_role TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on every table and view we create
-- (seen on hosted DEV and locally, 29 Oct: ACL "Dxtm" on all 29 tables and the 5 views).
-- None of them is needed:
--   TRUNCATE    empties a table and is not checked by RLS. No app or function truncates.
--   REFERENCES  lets a role create foreign keys pointing at our tables. Only migrations (as postgres) do.
--   TRIGGER     lets a role create triggers on our tables. Only migrations (as postgres) do.
--               Firing existing triggers does not need this privilege.
--   MAINTAIN    (Postgres 17) VACUUM, ANALYZE, REINDEX, CLUSTER, REFRESH MATERIALIZED VIEW, LOCK TABLE.
--               Autovacuum and the platform run as superusers; our cron job and RPCs run as postgres.
-- The table owner (postgres) keeps every privilege, so migrations, RPCs (security definer, owned by
-- postgres), triggers, pg_cron and Studio are unaffected. SELECT/INSERT/UPDATE/DELETE grants and all
-- RLS policies are left exactly as they are. No ownership changes.

-- 1. Existing tables and views in public (ALL TABLES covers views; sequences are not included and
--    hold no such privileges).
revoke truncate, references, trigger, maintain on all tables in schema public
  from anon, authenticated, service_role;

-- 2. Future tables and views created by postgres in public (every migration runs as postgres).
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated, service_role;

-- Not changed here, on purpose:
--  * supabase_admin's default privileges in public (they grant arwdDxtm to all roles, but only for
--    objects supabase_admin creates; we never create objects as supabase_admin, and the postgres role
--    cannot alter another role's defaults).
--  * Other schemas (storage, graphql, auth, realtime, cron, extensions) belong to the platform.
