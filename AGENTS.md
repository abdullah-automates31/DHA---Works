# AGENTS.md

DHA Works is a home-services marketplace for DHA Karachi. Backend first: Supabase/Postgres (RLS + RPCs), later two Expo apps and a Next.js admin. `docs/` is the source of truth. Read `docs/HANDOVER.md` first in every session; `docs/DECISIONS.md` wins conflicts and `docs/DB-API-DESIGN.md` is the database/API spec. UI reference lives outside the repo at `C:\Users\Abdullah Ali\DHA-Works-UI\` (`SPEC.md` + screenshots; ignore `.dc.html`).

## State and layout

- `supabase/` (migrations, pgTAP tests, Edge Functions), `packages/supabase` (generated types) and, since 29 Oct, `apps/worker` (Expo SDK 58 worker app, foundation only). Minimal npm workspace at the root (`npm install` there); no pnpm, Turborepo or CI yet. Worker commands: `npm run worker:typecheck`, `worker:lint`, `worker:test`, `worker` (expo start). Do not scaffold other apps without approval.
- 17 migrations: 0001-0015 applied locally and on the linked DEV project (`xiozwoocisesgmegewww`, verified 29 Oct); `0016` (submit_for_review drops the areas requirement; areas are chosen after approval) and `0017` (worker_feed.quote_count) are local only until the user asks for a push. `0014` = column-level grants to `service_role` for the push function; `0015` = removes TRUNCATE/REFERENCES/TRIGGER/MAINTAIN from anon, authenticated and service_role on public tables and views, and from postgres's default privileges in `public`. When docs disagree, trust `supabase migration list --linked`.
- `supabase/dev/` holds LOCAL-ONLY developer scripts (`seed_open_jobs.sql`: fake resident and 5 open jobs; `seed_job_photos.mjs`: fake photos and a silent voice note for some of those jobs, uses the local key for one run; `approve_local_worker.sql`: marks one local test worker approved). Never run them on hosted DEV or production. They are not `seed.sql` on purpose: that runs on every `db reset` and the pgTAP tests expect an empty database apart from their own fixtures.
- `supabase/functions/send-push` (Expo push dispatcher) is built and tested locally, **not deployed**. See its README for the security model.
- `supabase/config.toml` intentionally registers `send-push` with `verify_jwt = false`. The handler enforces an `x-push-secret` shared secret; do not "harden" it by enabling JWT.
- `packages/supabase/database.types.ts` is generated (`supabase gen types typescript --local`/`--linked`); regenerate, never hand-edit.

## Commands (Windows + Docker Desktop)

```powershell
supabase start                 # local stack, project id dha-works, ports 553xx
supabase db reset              # applies all migrations; no seed.sql (warning is harmless)
supabase test db               # 12 pgTAP files, 490 assertions
supabase db lint --local
```

```powershell
cd supabase/functions/send-push
deno test                      # 23 unit tests; imports come from deno.json
deno lint; deno fmt --check
```

- Concurrency: `bash supabase/tests/concurrency/accept_race.sh` against the local stack only (never hosted), then `supabase db reset`. It commits throwaway rows.
- Push integration: `bash supabase/functions/send-push/integration/run.sh` from the repo root, with the local stack and Deno. It starts a mock Expo server and `supabase functions serve`, runs 12 checks against the grants from the migrations (nothing is applied by hand), and commits throwaway rows, so run `supabase db reset` afterwards.
- Hosted Supabase: the user runs `supabase login` and `link`. `supabase db push` to DEV only when the user explicitly asks in the current task (as for 0013 to 0015 on 29 Oct), after checking the branch is `dev`, the linked ref is `xiozwoocisesgmegewww`, and `db push --dry-run` lists only the expected migrations. Never deploy Edge Functions or set secrets without being asked.
- Branch: work on `dev`; `main` is production and must not be pushed to. Never push to a production Supabase project.

## Never touch

- Relay project (other product, old account): it may auto-start in Docker; stop it with `supabase stop --project-id Relay`, never modify it.
- Abandoned `dha-suite` project (`qfxpluotmrxmxqseelnh`).
- the Supabase MCP connector: it is logged into the old account (sees Relay); use the Supabase CLI for this project.

## Rules that override app instincts

- Business rules live in the database: state-machine RPCs, RLS, server-computed quote totals. Apps call RPCs; do not reimplement transitions or totals client-side.
- Schema changes only as new files in `supabase/migrations/`; never edit an existing migration or hand-edit a local or hosted DB. Apply locally with `db reset`; push to DEV only as described above.
- Grants are least privilege. `service_role` bypasses RLS, so its column-level grants (0014) are its only limit; `supabase/tests/service_role_grants.test.sql` pins them. Never grant `authenticated`/`anon` access to `device_tokens` or write access to `notifications`.
- Since 0015, new tables and views get **no** privileges for anon/authenticated/service_role by default. Every migration that creates one must grant exactly what the apps need (usually `select` to `authenticated`), and never TRUNCATE/REFERENCES/TRIGGER/MAINTAIN. `supabase/tests/default_privileges.test.sql` fails if any app role holds those.
- The read views in `0010` are security-definer and filter on `auth.uid()`; the Supabase advisor warning about them is expected, not a bug to "fix".
- Competition model: no lock. Accepting one quote atomically rejects the others and moves the job to `scheduled`; `accepted` is unused. A sent quote is final (revisions are MVP 2); a rejected worker cannot re-quote.
- Cash entries are write-once. A mismatch still closes the job as `cash_collected` with `matched=false`, never `disputed`; a rating below 3 files a `poor_work` report. A material bill is required when the accepted quote has materials above 0.
- Privacy: resident phone and plot number stay hidden until a quote is accepted. Push notifications use only the job title (no phone, plot, amount, or names).
- Secrets: `SUPABASE_SERVICE_ROLE_KEY`/`PUSH_DISPATCH_SECRET` are server-only; only `.env.example` is committed (it lists `PUSH_DISPATCH_SECRET` with no value). The function fails closed without the secret.
- Unclear requirements: build the clear part and record the rest in `docs/OPEN-QUESTIONS.md` for Shariq; do not invent product behavior.

## Workflow

- Run `supabase test db` after migration changes and `supabase db reset` after scripts that commit throwaway rows. There is no CI or npm test/lint script yet.
- Ask before committing; do not commit or push unless asked. End commit messages with the `Co-Authored-By` line for the model actually doing the work. Work stays on `dev`; never push to `main`.
