#!/usr/bin/env bash
# Migration 0033: registration under concurrency.
#  1) the SAME user registers twice at the same moment (double tap / second device): exactly one profile, the other call
#     says "profile already exists".
#  2) TWO users register with the SAME CNIC at the same moment: exactly one profile holds it, the other gets a clean
#     unique error.
# Local only: it commits throwaway rows and removes them at the end (run `db reset` if that cleanup is reported as failed). Usage: bash supabase/tests/concurrency/register_race.sh
set -euo pipefail
DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_dha-works$')
psql() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
U1=00000000-0000-0000-0000-0000000000e1
U2=00000000-0000-0000-0000-0000000000e2
U3=00000000-0000-0000-0000-0000000000e3
as() { echo "select set_config('request.jwt.claims', json_build_object('sub','$1','role','authenticated')::text, true); set local role authenticated;"; }
# audit_log is append only, so the throwaway rows are removed with triggers and key checks switched off for this session.
cleanup() { psql -c "set session_replication_role = replica; delete from public.audit_log where actor_id in ('$U1','$U2','$U3'); delete from public.worker_details where profile_id in ('$U1','$U2','$U3'); delete from public.profiles where id in ('$U1','$U2','$U3'); delete from auth.users where id in ('$U1','$U2','$U3');" >/dev/null 2>&1 || echo "cleanup needs: npm run db:local -- db reset"; }
trap cleanup EXIT
cleanup
psql -c "insert into auth.users (id, aud, role, phone) values ('$U1','authenticated','authenticated','923009000001'),('$U2','authenticated','authenticated','923009000002'),('$U3','authenticated','authenticated','923009000003');" >/dev/null

# 1) same user twice; the first holds its transaction open for 2 s so the second really overlaps it
( psql <<SQL > /tmp/reg_a.out 2>&1; echo "A exit=$?" >> /tmp/reg_a.out
begin; $(as $U1) select public.register_profile('worker','Race One','+923000000000','male','1990-01-01','42101-9000001-1'); select pg_sleep(2); commit;
SQL
) &
sleep 0.5
( psql <<SQL > /tmp/reg_b.out 2>&1; echo "B exit=$?" >> /tmp/reg_b.out
begin; $(as $U1) select public.register_profile('worker','Race One','+923000000000','male','1990-01-01','42101-9000001-1'); commit;
SQL
) &
wait
echo "--- same user: A"; cat /tmp/reg_a.out; echo "--- same user: B"; cat /tmp/reg_b.out
N=$(psql -c "select count(*) from public.profiles where id='$U1'")
PH=$(psql -c "select phone from public.profiles where id='$U1'")
grep -q "profile already exists" /tmp/reg_b.out || { echo "FAIL: second call did not report 'profile already exists'"; exit 1; }
[ "$N" = "1" ] && [ "$PH" = "+923009000001" ] || { echo "FAIL: profiles=$N phone=$PH"; exit 1; }
echo "PASS 1: one profile, phone from the verified login ($PH)"

# 2) two different users, same CNIC
( psql <<SQL > /tmp/reg_c.out 2>&1; echo "C exit=$?" >> /tmp/reg_c.out
begin; $(as $U2) select public.register_profile('worker','Same Cnic Two','+923000000000','male','1990-01-01','42101-9000009-9'); select pg_sleep(2); commit;
SQL
) &
sleep 0.5
( psql <<SQL > /tmp/reg_d.out 2>&1; echo "D exit=$?" >> /tmp/reg_d.out
begin; $(as $U3) select public.register_profile('worker','Same Cnic Three','+923000000000','male','1990-01-01','42101-9000009-9'); commit;
SQL
) &
wait
echo "--- same CNIC: C"; cat /tmp/reg_c.out; echo "--- same CNIC: D"; cat /tmp/reg_d.out
N=$(psql -c "select count(*) from public.profiles where cnic='42101-9000009-9'")
[ "$N" = "1" ] || { echo "FAIL: $N profiles hold the CNIC"; exit 1; }
grep -q "duplicate key value\|unique" /tmp/reg_d.out || { echo "FAIL: the loser did not get a unique error"; exit 1; }
echo "PASS 2: exactly one profile holds the CNIC"
