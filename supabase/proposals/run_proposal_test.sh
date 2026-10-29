#!/usr/bin/env bash
# Runs a proposal's test against the LOCAL database only, inside one transaction that is rolled back.
# Usage (repo root, local stack running):
#   bash supabase/proposals/run_proposal_test.sh                       # every proposal that has a test
#   bash supabase/proposals/run_proposal_test.sh 20261029000019_identity_owner_delete.sql identity_owner_delete.test.sql
set -euo pipefail
cd "$(dirname "$0")/../.."

case "$(supabase status -o json 2>/dev/null | grep -o '"DB_URL": *"[^"]*"' | head -1)" in
  *127.0.0.1:55322*) ;;
  *) echo "refusing to run: the linked database is not the local stack"; exit 1 ;;
esac

DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep -m1 supabase_db_dha-works)"

run_pair() {
  local proposal="$1" test="$2" tmp
  tmp="$(mktemp -d)"
  {
    echo "begin;"
    echo "create extension if not exists pgtap with schema extensions;"
    echo "set local search_path to public, extensions;"
    cat "supabase/proposals/$proposal"
    cat "supabase/proposals/$test"
    echo "rollback;"
  } > "$tmp/combined.sql"
  echo "== $proposal"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At < "$tmp/combined.sql" \
    | grep -E '^(ok|not ok|1\.\.|#)' | tee "$tmp/out.txt" || true
  if grep -q '^not ok' "$tmp/out.txt" || ! grep -q '^1\.\.' "$tmp/out.txt"; then echo "FAIL: $proposal"; rm -rf "$tmp"; exit 1; fi
  rm -rf "$tmp"
}

if [ "$#" -eq 2 ]; then
  run_pair "$1" "$2"
else
  run_pair 20261029000018_lock_identity_during_review.sql lock_identity_during_review.test.sql
  run_pair 20261029000019_identity_owner_delete.sql identity_owner_delete.test.sql
fi
echo "PASS: proposal tests (rolled back, nothing kept)"
