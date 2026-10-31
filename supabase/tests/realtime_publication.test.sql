-- Realtime publishes only notifications (owner-readable), nothing else in public.
begin;
select no_plan();

select is((select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'), 1::bigint, 'notifications is published to Realtime');
select is((select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename <> 'notifications'), 0::bigint, 'no other public table is published');
select ok(has_table_privilege('authenticated', 'public.notifications', 'select'), 'signed-in users can select notifications (row-level security limits it to their own)');
select ok((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass), 'row-level security is on, so Realtime filters rows per user');
select ok(not has_table_privilege('anon', 'public.notifications', 'select'), 'signed-out users cannot select notifications');

select * from finish();
rollback;
