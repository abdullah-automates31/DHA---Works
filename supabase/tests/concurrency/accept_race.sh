#!/usr/bin/env bash
# Two sessions accept DIFFERENT quotes on the same job at the same time. Exactly one must win.
# Local only: it commits throwaway rows, so run `supabase db reset` afterwards.
# Usage: bash supabase/tests/concurrency/accept_race.sh   (local stack must be running)
set -euo pipefail
DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_dha-works$')
psql() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -qtA "$@"; }

U_RES=00000000-0000-0000-0000-0000000000f1
U_W1=00000000-0000-0000-0000-0000000000f2
U_W2=00000000-0000-0000-0000-0000000000f3
as() { echo "select set_config('request.jwt.claims', json_build_object('sub','$1','role','authenticated')::text, true); set local role authenticated;"; }

psql <<SQL
insert into auth.users (id, aud, role, email) values
  ('$U_RES','authenticated','authenticated','race-res@test.dev'),
  ('$U_W1','authenticated','authenticated','race-w1@test.dev'),
  ('$U_W2','authenticated','authenticated','race-w2@test.dev');
insert into public.profiles (id, role, full_name, email, phone, verification_status) values
  ('$U_RES','resident','Race Resident','race-res@test.dev','03000000001','approved'),
  ('$U_W1','worker','Race One','race-w1@test.dev','03000000002','approved'),
  ('$U_W2','worker','Race Two','race-w2@test.dev','03000000003','approved');
insert into public.worker_details (profile_id) values ('$U_W1'), ('$U_W2');
insert into public.worker_categories (worker_id, category_id) values ('$U_W1',1), ('$U_W2',1);
insert into public.worker_areas (worker_id, phase) values ('$U_W1',6), ('$U_W2',6);
SQL

JOB=$(psql <<SQL | tail -1
begin; $(as $U_RES) select public.upsert_address(null,'Home',6::smallint,'Lane 4','12-C','2nd',true) \gset
select public.save_job_draft(null,1::smallint,:'upsert_address','Race job','Race test for concurrent accepts','asap',null,null,null,null,array['$U_RES/r.jpg']) as j \gset
select public.post_job(:'j');
commit;
select :'j';
SQL
)
for W in $U_W1 $U_W2; do psql <<SQL
begin; $(as $W) select public.express_interest('$JOB');
select public.submit_quote('$JOB', 1000, now()+interval '1 day', now()+interval '1 day 2 hours'); commit;
SQL
done
Q1=$(psql -c "select id from public.quotes where job_id='$JOB' and worker_id='$U_W1'")
Q2=$(psql -c "select id from public.quotes where job_id='$JOB' and worker_id='$U_W2'")

# Session A accepts Q1 and holds its transaction open for 3 s; session B tries Q2 one second later.
( psql <<SQL > /tmp/race_a.out 2>&1; echo "A exit=$?" >> /tmp/race_a.out
begin; $(as $U_RES) select public.accept_quote('$Q1'); select pg_sleep(3); commit;
SQL
) &
sleep 1
( psql <<SQL > /tmp/race_b.out 2>&1; echo "B exit=$?" >> /tmp/race_b.out
begin; $(as $U_RES) select public.accept_quote('$Q2'); commit;
SQL
) &
wait

echo "--- session A:"; cat /tmp/race_a.out; echo "--- session B:"; cat /tmp/race_b.out
ACCEPTED=$(psql -c "select count(*) from public.quotes where job_id='$JOB' and status='accepted'")
STATUS=$(psql -c "select status from public.jobs where id='$JOB'")
WINNER=$(psql -c "select accepted_worker_id from public.jobs where id='$JOB'")
echo "accepted quotes=$ACCEPTED job status=$STATUS winner=$WINNER"
if [ "$ACCEPTED" = "1" ] && [ "$STATUS" = "scheduled" ] && grep -q "exit=0" /tmp/race_a.out && grep -q "no longer accept a quote" /tmp/race_b.out; then
  echo "PASS: exactly one accept succeeded"
else
  echo "FAIL"; exit 1
fi
