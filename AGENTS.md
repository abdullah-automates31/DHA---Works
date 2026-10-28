# AGENTS.md

DHA Works is a home-services marketplace for DHA Karachi. Backend first: Supabase/Postgres (RLS + RPCs), later two Expo apps and a Next.js admin. `docs/` is the source of truth. Read `docs/HANDOVER.md` first in every session; `docs/DECISIONS.md` wins conflicts and `docs/DB-API-DESIGN.md` is the database/API spec. UI reference lives outside the repo at `C:\Users\Abdullah Ali\DHA-Works-UI\` (`SPEC.md` + screenshots; ignore `.dc.html`).

## State and layout

- Backend only: `supabase/` (migrations, pgTAP tests, Edge Functions) and `packages/supabase/database.types.ts`. There is **no** root `package.json`, pnpm workspace, Turborepo, app code, or CI yet; do not run `pnpm`/`npm` scripts or scaffold apps without explicit approval.
- 13 migrations (`0001`-`0013`), applied locally and on the linked DEV project (verified 29 Oct). `README.md` and `docs/HANDOVER.md` still say 0013 is local-only; trust the migration list over those lines.
- Uncommitted work exists: the `send-push` Edge Function (23 Deno tests) and generated `database.types.ts`. `README.md` and `docs/HANDOVER.md` predate it and still say these do not exist; trust the working tree over those lines.
- `supabase/config.toml` intentionally registers `send-push` with `verify_jwt = false`. The handler enforces an `x-push-secret` shared secret; do not "harden" it by enabling JWT.
- `packages/supabase/database.types.ts` is generated (`supabase gen types typescript --local`/`--linked`); regenerate, never hand-edit.

## Commands (Windows + Docker Desktop)

```powershell
supabase start                 # local stack, project id dha-works, ports 553xx
supabase db reset              # applies all migrations; no seed.sql (warning is harmless)
supabase test db               # 2 pgTAP files, 106 assertions
supabase db lint --local
```

```powershell
cd supabase/functions/send-push
deno test --allow-env --allow-net handler_test.ts   # 23 tests
```

- Concurrency: `bash supabase/tests/concurrency/accept_race.sh` (local only), then `supabase db reset`. It commits throwaway rows.
- Push integration: `supabase/functions/send-push/integration/run.sh` needs the local stack and Deno; it starts a mock Expo server and commits throwaway rows, so reset afterwards. Its header says run from the repo root, but it uses `integration/mock_expo.ts` while the file is under `supabase/functions/send-push/integration/`; check/fix the cwd-relative path before running.
- Hosted Supabase: the user runs `supabase login`, `link --project-ref xiozwoocisesgmegewww`, and `db push` themselves. Do not run these; ask. The linked project is DEV.
- Branch: work on `dev`; `main` is production and must not be pushed to. Never push to a production Supabase project.

## Never touch

- Relay project (other product, old account): it may auto-start in Docker; stop it with `supabase stop --project-id Relay`, never modify it.
- Abandoned `dha-suite` project (`qfxpluotmrxmxqseelnh`).
- the Supabase MCP connector: it is logged into the old account (sees Relay); use the Supabase CLI for this project.

## Rules that override app instincts

- Business rules live in the database: state-machine RPCs, RLS, server-computed quote totals. Apps call RPCs; do not reimplement transitions or totals client-side.
- Schema changes only as new files in `supabase/migrations/`; never hand-edit a local or hosted DB. Apply with `db reset`; the user pushes.
- The read views in `0010` are security-definer and filter on `auth.uid()`; the Supabase advisor warning about them is expected, not a bug to "fix".
- Competition model: no lock. Accepting one quote atomically rejects the others and moves the job to `scheduled`; `accepted` is unused. A sent quote is final (revisions are MVP 2); a rejected worker cannot re-quote.
- Cash entries are write-once. A mismatch still closes the job as `cash_collected` with `matched=false`, never `disputed`; a rating below 3 files a `poor_work` report. A material bill is required when the accepted quote has materials above 0.
- Privacy: resident phone and plot number stay hidden until a quote is accepted. Push notifications use only the job title (no phone, plot, amount, or names).
- Secrets: `SUPABASE_SERVICE_ROLE_KEY`/`PUSH_DISPATCH_SECRET` are server-only; only `.env.example` is committed. `PUSH_DISPATCH_SECRET` is missing from `.env.example` today; the function fails closed without it.
- Unclear requirements: build the clear part and record the rest in `docs/OPEN-QUESTIONS.md` for Shariq; do not invent product behavior.

## Workflow

- Run `supabase test db` after migration changes and `supabase db reset` after scripts that commit throwaway rows. There is no CI or npm test/lint script yet.
- Ask before committing; do not commit or push unless asked. Existing commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; work stays on `dev`.
