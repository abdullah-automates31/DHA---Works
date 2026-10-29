-- Migration 0015: app roles hold no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN on public tables or views,
-- now or by default for future objects created by postgres, while their intended grants stay intact.
begin;
select no_plan();

-- No app role holds TRUNCATE, REFERENCES, TRIGGER or MAINTAIN on any public table or view.
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace,
     unnest(array['anon', 'authenticated', 'service_role']) r,
     unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) p
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
     and has_table_privilege(r, c.oid, p)),
  0::bigint, 'no app role has truncate/references/trigger/maintain on public tables or views');

-- The owner keeps everything (migrations, RPCs, triggers and cron run as postgres).
select ok(has_table_privilege('postgres', 'public.jobs', 'TRUNCATE, REFERENCES, TRIGGER, MAINTAIN'),
  'postgres keeps all privileges');

-- Grants the apps rely on are untouched.
select ok(has_table_privilege('authenticated', 'public.jobs', 'SELECT'), 'authenticated still reads jobs (RLS decides rows)');
select ok(has_table_privilege('authenticated', 'public.resident_jobs', 'SELECT'), 'authenticated still reads the read views');
select ok(has_table_privilege('authenticated', 'public.categories', 'SELECT, INSERT, UPDATE, DELETE'),
  'catalogue write grants (admin via RLS) are untouched');
select ok(not has_table_privilege('anon', 'public.jobs', 'SELECT'), 'anon still has no read access');
select ok(has_column_privilege('service_role', 'public.notifications', 'push_sent_at', 'UPDATE'), '0014 grants are untouched');
select ok(not has_column_privilege('service_role', 'public.notifications', 'read_at', 'SELECT'), '0014 stays narrow');

-- RLS is still enabled on every public table.
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0::bigint,
  'RLS still enabled on every public table');

-- Future tables created by postgres no longer get these privileges by default.
create table public.zz_default_priv_probe (id int);
select ok(not has_table_privilege(r, 'public.zz_default_priv_probe', 'TRUNCATE'), r || ' gets no TRUNCATE on a new table')
from unnest(array['anon', 'authenticated', 'service_role']) r;
select ok(not has_table_privilege(r, 'public.zz_default_priv_probe', 'MAINTAIN'), r || ' gets no MAINTAIN on a new table')
from unnest(array['anon', 'authenticated', 'service_role']) r;
select ok(not has_table_privilege(r, 'public.zz_default_priv_probe', 'TRIGGER'), r || ' gets no TRIGGER on a new table')
from unnest(array['anon', 'authenticated', 'service_role']) r;
select ok(not has_table_privilege(r, 'public.zz_default_priv_probe', 'REFERENCES'), r || ' gets no REFERENCES on a new table')
from unnest(array['anon', 'authenticated', 'service_role']) r;
-- Views use the same default (object type "tables").
create view public.zz_default_priv_probe_v as select id from public.zz_default_priv_probe;
select ok(not has_table_privilege(r, 'public.zz_default_priv_probe_v', p), r || ' gets no ' || p || ' on a new view')
from unnest(array['anon', 'authenticated', 'service_role']) r, unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) p;
-- The default privileges themselves: postgres in public grants table privileges to nobody else.
select is((select defaclacl::text from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
           where n.nspname = 'public' and d.defaclobjtype = 'r' and pg_get_userbyid(d.defaclrole) = 'postgres'),
  '{postgres=arwdDxtm/postgres}', 'postgres default table privileges in public are owner-only');
-- Future explicit grants still work as usual.
grant select on public.zz_default_priv_probe to authenticated;
select ok(has_table_privilege('authenticated', 'public.zz_default_priv_probe', 'SELECT'), 'an explicit grant on a new table still works');

-- A signed-in user really cannot truncate any more (it previously could, bypassing RLS).
set local role authenticated;
select throws_ok($$truncate public.notifications$$, '42501', null, 'authenticated cannot truncate notifications');
select throws_ok($$truncate public.jobs cascade$$, '42501', null, 'authenticated cannot truncate jobs');
select throws_ok($$lock table public.jobs in access exclusive mode$$, '42501', null, 'authenticated cannot lock tables');
reset role;
set local role service_role;
select throws_ok($$truncate public.device_tokens$$, '42501', null, 'service_role cannot truncate device_tokens');
reset role;

-- The owner can still maintain tables, and the audit-log truncate guard still works for it.
select lives_ok($$analyze public.jobs$$, 'postgres can still analyze');
select throws_ok($$truncate public.audit_log$$, null, 'audit_log is append only', 'audit_log truncate guard still fires');

select * from finish();
rollback;
