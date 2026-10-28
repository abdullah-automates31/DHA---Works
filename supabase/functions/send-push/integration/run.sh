#!/usr/bin/env bash
# End-to-end check of send-push against the LOCAL Supabase stack and a mock Expo server.
# Local only: it commits throwaway rows, so run `supabase db reset` afterwards.
# Usage: bash supabase/functions/send-push/integration/run.sh   (from the repo root, stack running)
set -uo pipefail
ROOT=$(pwd)
DB=$(docker ps --format '{{.Names}}' | grep '^supabase_db_dha-works$')
psql() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
SECRET="local-test-secret-$RANDOM$RANDOM"
LOG=$(mktemp); ENVF=$(mktemp)
echo "PUSH_DISPATCH_SECRET=$SECRET" > "$ENVF"
echo "EXPO_PUSH_URL=http://host.docker.internal:8788/" >> "$ENVF"
URL="$(supabase status 2>/dev/null | grep -o "\"API_URL\": *\"[^\"]*\"" | cut -d\" -f4)/functions/v1/send-push"
FAILS=0
check() { if [ "$2" = "$3" ]; then echo "ok   - $1"; else echo "FAIL - $1 (got '$2', want '$3')"; FAILS=$((FAILS+1)); fi; }

MOCK_LOG="$LOG" deno run --allow-net --allow-env --allow-write supabase/functions/send-push/integration/mock_expo.ts >/dev/null 2>&1 &
MOCK=$!
( cd "$ROOT" && supabase functions serve --env-file "$ENVF" --no-verify-jwt >/tmp/fn_serve.log 2>&1 ) &
SERVE=$!
trap 'kill $MOCK $SERVE 2>/dev/null; docker rm -f $(docker ps -q --filter name=supabase_edge_runtime_dha-works) >/dev/null 2>&1; rm -f "$ENVF" "$LOG"' EXIT

echo "NOTE: applying the grants from REQUIRED_GRANTS.sql to the LOCAL database only (they are not in any migration yet)"
psql < supabase/functions/send-push/REQUIRED_GRANTS.sql >/dev/null
U1=00000000-0000-0000-0000-0000000000e1; U2=00000000-0000-0000-0000-0000000000e2; U3=00000000-0000-0000-0000-0000000000e3
psql <<SQL
insert into auth.users (id, aud, role, email) values
 ('$U1','authenticated','authenticated','p1@test.dev'),('$U2','authenticated','authenticated','p2@test.dev'),('$U3','authenticated','authenticated','p3@test.dev');
insert into public.profiles (id, role, full_name, email, phone, verification_status, account_status) values
 ('$U1','resident','Push One','p1@test.dev','03000000011','approved','active'),
 ('$U2','resident','Push Two','p2@test.dev','03000000012','approved','active'),
 ('$U3','resident','Push Three','p3@test.dev','03000000013','approved','suspended');
insert into public.device_tokens (user_id, push_token, platform) values
 ('$U1','ExponentPushToken[alive_u1_aaaaaaaaaaaaaa]','android'),
 ('$U1','ExponentPushToken[dead_u1_bbbbbbbbbbbbbbb]','android'),
 ('$U2','ExponentPushToken[alive_u2_cccccccccccccc]','android'),
 ('$U3','ExponentPushToken[alive_u3_dddddddddddddd]','android');
insert into public.notifications (user_id, type, payload) values
 ('$U1','quote_received','{"title":"Kitchen tap","phone":"03009998888"}'),
 ('$U2','quote_accepted','{"title":"Bathroom leak"}'),
 ('$U3','quote_received','{"title":"Suspended user job"}');
SQL

echo "waiting for the function to come up..."
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL" -H "x-push-secret: nope" -d '{}') && [ "$code" = "401" ] && break
  sleep 3
done
check "no secret is refused"            "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL" -d '{}')" 401
check "wrong secret is refused"         "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL" -H 'x-push-secret: nope' -d '{}')" 401
check "naming a recipient is refused"   "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL" -H "x-push-secret: $SECRET" -d "{\"user_id\":\"$U2\"}")" 400
check "bad limit is refused"            "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL" -H "x-push-secret: $SECRET" -d '{"limit":0}')" 400
check "nothing was sent by the refusals" "$(psql -c "select count(*) from public.notifications where push_sent_at is not null and user_id in ('$U1','$U2','$U3')")" 0

RES=$(curl -s -X POST "$URL" -H "x-push-secret: $SECRET" -d '{"limit":10}')
echo "response: $RES"
sleep 1
SENT_TO=$(cat "$LOG" | tr ',' '\n' | grep -o 'ExponentPushToken\[[a-z0-9_]*\]' | sort -u | tr '\n' ' ')
check "owners' active tokens only (suspended user skipped)" "$SENT_TO" "ExponentPushToken[alive_u1_aaaaaaaaaaaaaa] ExponentPushToken[alive_u2_cccccccccccccc] ExponentPushToken[dead_u1_bbbbbbbbbbbbbbb] "
check "all three rows are marked processed"  "$(psql -c "select count(*) from public.notifications where push_sent_at is not null and user_id in ('$U1','$U2','$U3')")" 3
check "the dead token was deleted"           "$(psql -c "select count(*) from public.device_tokens where push_token like '%dead_u1%'")" 0
check "live tokens are kept"                 "$(psql -c "select count(*) from public.device_tokens where push_token like '%alive_%'")" 3
check "no phone number in any push"          "$(grep -c '03009998888' "$LOG")" 0
RES2=$(curl -s -X POST "$URL" -H "x-push-secret: $SECRET" -d '{}')
check "a second run sends nothing again"     "$RES2" '{"processed":0,"sent":0,"failed":0,"removed_tokens":0}'

# Signed-in users can never read tokens or call the dispatcher.
psql <<SQL > /tmp/priv.out 2>&1
begin; select set_config('request.jwt.claims','{"sub":"$U1","role":"authenticated"}',true); set local role authenticated;
select count(*) from public.device_tokens;
SQL
check "a signed-in user cannot read device_tokens" "$(grep -c 'permission denied' /tmp/priv.out)" 1
echo; if [ "$FAILS" = 0 ]; then echo "PASS: all integration checks"; else echo "FAILED: $FAILS check(s)"; exit 1; fi
