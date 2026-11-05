-- 0027 / 0028: every index added by the 5 Nov performance work exists on the right column, and the planner can use it.
begin;
select no_plan();

create function pg_temp.has_index(p_table regclass, p_name text, p_column text) returns boolean language sql as $$
  select exists (
    select 1 from pg_index i join pg_class ic on ic.oid = i.indexrelid join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indrelid = p_table and ic.relname = p_name and a.attname = p_column and i.indisvalid);
$$;

select ok(pg_temp.has_index('public.worker_categories', 'worker_categories_category_idx', 'category_id'), 'worker_categories is indexed by category_id');
select ok(pg_temp.has_index('public.report_photos', 'report_photos_report_idx', 'report_id'), 'report_photos is indexed by report_id');
select ok(pg_temp.has_index('public.report_notes', 'report_notes_report_idx', 'report_id'), 'report_notes is indexed by report_id');
select ok(pg_temp.has_index('public.report_calls', 'report_calls_report_idx', 'report_id'), 'report_calls is indexed by report_id');
select ok(pg_temp.has_index('public.reports', 'reports_against_idx', 'against_id'), 'reports is indexed by against_id');
select ok(pg_temp.has_index('public.notifications', 'notifications_unread_idx', 'user_id'), 'notifications has the unread-count index (0027)');

-- The planner can reach each of them (sequential scans switched off so the choice is not about table size).
set local enable_seqscan = off;
create function pg_temp.plan(p_sql text) returns text language plpgsql as $$
declare r text; out text := '';
begin
  for r in execute 'explain ' || p_sql loop out := out || r || E'\n'; end loop;
  return out;
end $$;
select ok(pg_temp.plan('select * from public.worker_categories where category_id = 1') like '%worker_categories_category_idx%', 'a lookup by trade uses worker_categories_category_idx');
select ok(pg_temp.plan($$select * from public.report_photos where report_id = '00000000-0000-0000-0000-000000000001'$$) like '%report_photos_report_idx%', 'photos of a report use report_photos_report_idx');
select ok(pg_temp.plan($$select * from public.report_notes where report_id = '00000000-0000-0000-0000-000000000001'$$) like '%report_notes_report_idx%', 'notes of a report use report_notes_report_idx');
select ok(pg_temp.plan($$select * from public.report_calls where report_id = '00000000-0000-0000-0000-000000000001'$$) like '%report_calls_report_idx%', 'calls of a report use report_calls_report_idx');
select ok(pg_temp.plan($$select * from public.reports where against_id = '00000000-0000-0000-0000-000000000001'$$) like '%reports_against_idx%', 'reports about a worker use reports_against_idx');
select ok(pg_temp.plan($$select count(*) from public.notifications where user_id = '00000000-0000-0000-0000-000000000001' and read_at is null$$) like '%notifications_unread_idx%', 'the unread count uses notifications_unread_idx');

select * from finish();
rollback;
