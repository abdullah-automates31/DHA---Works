-- LOCAL ONLY, fake data. Stands in for the customer app, which is not built yet.
-- For every job that is 'completed' where the worker has recorded cash and the resident has not,
-- calls the real confirm_cash_resident as that job's resident, with the same amount the worker entered.
-- The job then becomes cash_collected (and the worker's jobs_done goes up), exactly as in production.
--
-- Run (stack must be up):
--   docker exec -i supabase_db_dha-works psql -U postgres -f - < supabase/dev/confirm_cash_as_resident.sql
-- (the container name may differ: docker ps | findstr supabase_db)
-- Never run this against the hosted DEV project.

do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select j.id as job_id, j.resident_id, c.worker_amount
    from public.jobs j
    join public.cash_records c on c.job_id = j.id
    where j.status = 'completed' and c.worker_amount is not null and c.resident_amount is null
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.resident_id, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    perform public.confirm_cash_resident(r.job_id, r.worker_amount);
    perform set_config('role', 'postgres', true);
    n := n + 1;
    raise notice 'confirmed cash for job % (amount %)', r.job_id, r.worker_amount;
  end loop;
  raise notice 'jobs confirmed: %', n;
end $$;
