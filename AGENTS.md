# AGENTS.md

DHA Works is a home-services marketplace for DHA Karachi. Backend first: Supabase/Postgres (RLS + RPCs). `apps/worker` is the only app so far; the customer app and admin portal do not exist. `docs/` is the source of truth: read `docs/HANDOVER.md` and `docs/WORKER-APP.md` first; `docs/DECISIONS.md` wins conflicts and `docs/DB-API-DESIGN.md` is the database/API spec. If README or HANDOVER disagrees with `supabase migration list --linked` or actual test output, trust the command output. UI reference is outside the repo at `C:\Users\Abdullah Ali\DHA-Works-UI\` (`SPEC.md` + screenshots; ignore `.dc.html`).

## State and layout

- `supabase/` (migrations, pgTAP tests, Edge Functions), `packages/supabase` (generated types), `apps/worker` (Expo SDK 58 worker app: screens W01-W08 and W10-W18 built and tested against the local stack; W09 direct requests is out of the MVP; detail in `docs/WORKER-APP.md`). Minimal npm workspace at the root (`npm install` there); no pnpm, Turborepo or CI. Do not scaffold customer/admin apps without approval.
- 18 migrations: 0001-0015 applied locally and on linked DEV (`xiozwoocisesgmegewww`, verified 29 Oct); `0016` (submit_for_review no longer needs areas), `0017` (worker_feed.quote_count) and `0020` (Realtime on notifications) are local only until the user asks for a push. `0014` = column-level grants for the push function; `0015` = removes TRUNCATE/REFERENCES/TRIGGER/MAINTAIN from app roles and postgres's default privileges in `public`. When docs disagree, trust `supabase migration list --linked`.
- `supabase/proposals/` holds unapplied proposals 0018 (identity lock) and 0019 (identity owner delete) with their tests. `db reset` and `test db` do not run them; run the proposal test script. Do not move them into `migrations/` without approval.
- `supabase/dev/` is LOCAL-ONLY: `seed_open_jobs.sql` (fake resident + 6 jobs, one expired), `seed_job_photos.mjs`, `approve_local_worker.sql` (email), `approve_local_phone_worker.sql`, `seed_phone_workers.sql` (approved/pending/suspended/rejected/no-profile phone accounts), `seed_worker_journey.sql` (after the first script; `-v phone=...` or `-v email=...`; puts a worker in every job state). Never run on hosted DEV or production. They are not `seed.sql` because that runs on every `db reset` and pgTAP expects an empty database apart from its own fixtures.
- `supabase/functions/send-push` (Expo push dispatcher) is built and tested locally, **not deployed**. See its README for the security model.
- `supabase/config.toml` intentionally registers `send-push` with `verify_jwt = false`. The handler enforces an `x-push-secret` shared secret; do not "harden" it by enabling JWT.
- `packages/supabase/database.types.ts` is generated (`supabase gen types typescript --local`/`--linked`); regenerate, never hand-edit.
- Realtime is published only for `public.notifications` (0020). Job tables are not published; worker screens refresh when a notification arrives (`apps/worker/src/features/live/useLiveRefresh.ts`).

## Commands (Windows + Docker Desktop)

```powershell
npm run db:local -- start      # local stack, project id dha-works; API 55321, DB 55322, Studio 55323, Mailpit 55324
npm run db:local -- db reset   # applies all migrations; no seed.sql (warning is harmless)
npm run db:local -- test db    # 16 pgTAP files, 592 assertions
npm run db:local -- db lint --local
npm run safety:test            # 22 tests for the config guard, local wrapper and pre-push check (scripts/*.test.mjs)
npm run safety:supabase        # fails if supabase/config.toml holds test OTPs or literal/placeholder credentials
```

Use `npm run db:local --` for every local Supabase command. It builds a git-ignored copy (`.supabase-local/`) of `supabase/` and adds the five static test OTPs and fake Twilio values there, so `supabase/config.toml` (the file `supabase config push` sends) never holds them. A plain `supabase start` runs without the test OTPs and phone sign-in will not work locally. Hosted config goes only through `npm run supabase:config-push -- <dev|production>` (check only; `--run` pushes, and only when the user asks in the current task); targets, blocked refs and the pinned CLI version (2.109.1) are in `scripts/supabase-targets.json`. A raw `supabase config push` bypasses these checks. The git `pre-push` hook (`.githooks/`, enable with `git config core.hooksPath .githooks`) checks the Supabase config in every commit being pushed (`scripts/check-pushed-commits.mjs`, not the working tree) and blocks pushes to `main`. Never run a raw `supabase config push` against a hosted project: the shared config has Twilio disabled, so it could switch Twilio off there.

```powershell
npm run worker:typecheck
npm run worker:lint
npm run worker:test            # 194 node:test tests
```

```powershell
# from apps/worker
npx expo export --platform ios   # or android; bundle check
```

```powershell
# from supabase/functions/send-push
deno test                      # 23 unit tests; imports come from deno.json
deno lint; deno fmt --check
```

- `.sh` scripts need Git Bash: plain `bash` resolves to WSL with no distro here. Use `& "C:\Program Files\Git\bin\bash.exe" <script>`.
- Concurrency: `& "C:\Program Files\Git\bin\bash.exe" supabase/tests/concurrency/accept_race.sh` against the local stack only (never hosted), then `supabase db reset`. It commits throwaway rows.
- Proposal tests: `& "C:\Program Files\Git\bin\bash.exe" supabase/proposals/run_proposal_test.sh`.
- Push integration: `& "C:\Program Files\Git\bin\bash.exe" supabase/functions/send-push/integration/run.sh` from the repo root, with the local stack and Deno. It starts a mock Expo server and `supabase functions serve`, runs 12 checks against the migration grants, and commits throwaway rows; reset afterwards.
- Worker local run: `apps/worker/.env` (gitignored) needs the PC's LAN IP and the local anon key; the user runs `npx expo start --lan` in their own PowerShell and tests in Expo Go on iPhone. Worker sign-in is phone/WhatsApp OTP; local test numbers use the fixed OTPs added by `scripts/lib/local-config.mjs` and no message is sent. Restart the stack after changing auth config (`npm run db:local -- stop`, then `-- start`). Android is untested on a device.
- Hosted Supabase: the user runs `supabase login` and `link`. `supabase db push` to DEV only when the user explicitly asks in the current task, after checking branch `dev`, linked ref `xiozwoocisesgmegewww`, and `db push --dry-run` lists only expected migrations. Never deploy Edge Functions or set secrets without being asked.
- Branch: work on `dev`; `main` is production and must not be pushed to. Never push to a production Supabase project.
- Tooling gotcha: creating files through shell one-liners is fragile here (PowerShell quoting, WSL `bash`); use the Write tool for scratch files.

## Never touch

- Relay project (other product, old account): it may auto-start in Docker; stop it with `supabase stop --project-id Relay`, never modify it.
- Abandoned `dha-suite` project (`qfxpluotmrxmxqseelnh`).
- The Supabase MCP connector: it is logged into the old account (sees Relay); use the Supabase CLI for this project.

## Rules that override app instincts

- Business rules live in the database: state-machine RPCs, RLS, server-computed quote totals. Apps call RPCs; do not reimplement transitions or totals client-side.
- Schema changes only as new files in `supabase/migrations/`; never edit an existing migration or hand-edit a local or hosted DB. Apply locally with `db reset`; push to DEV only as described above.
- Grants are least privilege. `service_role` bypasses RLS, so its column-level grants (0014) are its only limit; `supabase/tests/service_role_grants.test.sql` pins them. Never grant `authenticated`/`anon` access to `device_tokens` or write access to `notifications`.
- Since 0015, new tables and views get **no** privileges for anon/authenticated/service_role by default. Every migration that creates one must grant exactly what the apps need (usually `select` to `authenticated`), and never TRUNCATE/REFERENCES/TRIGGER/MAINTAIN. `supabase/tests/default_privileges.test.sql` fails if any app role holds those.
- The read views in `0010` are security-definer and filter on `auth.uid()`; the Supabase advisor warning about them is expected, not a bug to "fix".
- Competition model: no lock. Accepting one quote atomically rejects the others and moves the job to `scheduled`; `accepted` is unused. A sent quote is final (revisions are MVP 2); a rejected worker cannot re-quote.
- Cash entries are write-once. A mismatch still closes the job as `cash_collected` with `matched=false`, never `disputed`; a rating below 3 files a `poor_work` report. A material bill is required when the accepted quote has materials above 0.
- Privacy: before a quote is accepted, never show the resident's name, phone, plot or address (also not in notifications); push text is the job title only. The helpline and FAQ stay hidden until `app_settings.helpline_enabled`.
- Worker auth is phone + WhatsApp OTP. Email login is removed from the worker app; `profiles.email` stays nullable for existing accounts and the resident seed. Local test numbers and fixed OTPs live only in the generated, git-ignored `.supabase-local/` config (from `scripts/lib/local-config.mjs`), never in tracked `supabase/config.toml`; Auth does not use provider credentials for test numbers. Auth stores `auth.users.phone` without the leading `+` (`923001234567`), while `profiles.phone` keeps `+923001234567`; `seed_phone_workers.sql` follows both. Never expose test OTPs in production, and never push that config to a hosted project. Production needs Twilio or Twilio Verify with a WhatsApp sender; it is not configured or deployed.
- Secrets: `SUPABASE_SERVICE_ROLE_KEY`/`PUSH_DISPATCH_SECRET`/`SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN` are server-only; only `.env.example` is committed (it lists `PUSH_DISPATCH_SECRET` with no value). The function fails closed without the secret.
- Out of the current scope: direct requests (W09) and distance/Nearest are out of the MVP; the customer app and admin portal need explicit approval before scaffolding.
- Unclear requirements: build the clear part and record the rest in `docs/OPEN-QUESTIONS.md` for Shariq; do not invent product behavior.

## Workflow

- No CI and no repo-wide test/lint script: run the specific checks above. Run `supabase test db` after migration changes and `supabase db reset` after scripts that commit throwaway rows.
- Ask before committing; do not commit or push unless asked. End commit messages with the `Co-Authored-By` line for the model actually doing the work. Work stays on `dev`; never push to `main`.
