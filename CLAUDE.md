# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

**Database and mobile API built; the Worker app (`apps/worker`) has all screens W01-W08 and W10-W18 working on the local stack (30 Oct; W11 onward uncommitted until reviewed). Read `docs/WORKER-APP.md` for the screen/backend map and how to run it.** Read `docs/HANDOVER.md` first in every session: it has the full state, accounts, pending questions and next steps. Shariq Bhai (25 Oct) approved Supabase on the free tier and the order: DB + mobile-app APIs, then mobile apps, then the admin portal. The full architecture is not formally approved. Do not scaffold the customer or admin apps or create Supabase projects without explicit approval. `docs/` is the source of truth; `README.md` has the reading order.

- 18 migrations in `supabase/migrations`: 0001-0015 applied to hosted DEV (ref `xiozwoocisesgmegewww`; 0013 to 0015 on 29 Oct); **0016 (submit_for_review no longer needs areas), 0017 (worker_feed.quote_count) and 0020 (Realtime on notifications) are local only, not yet pushed**. Edge Function `supabase/functions/send-push` is built and tested locally but **NOT deployed** (no secret, no scheduler). pgTAP: `supabase/tests/*.test.sql`, 592 assertions in 16 files; worker app unit tests: 194 (`npm run worker:test`); plus `supabase/tests/concurrency/accept_race.sh` and the push integration script (see its README).
- Commands (Supabase CLI, Docker running): local stack through the wrapper `npm run db:local -- start | stop | db reset | test db | db lint --local` (it adds the five static test OTPs to a git-ignored `.supabase-local/` copy; `supabase/config.toml` must never hold test OTPs or literal/placeholder Twilio values; guard: `npm run safety:supabase`, tests: `npm run safety:test`, hosted config push only via `npm run supabase:config-push -- <target>`, check-only without `--run`), plus `supabase migration list --linked`; in `supabase/functions/send-push`: `deno test`. The user runs `login` and `link`; `db push` to DEV, function deploys and secrets only when the user asks in the current task.
- Grants are least privilege. Migration 0015 removed TRUNCATE, TRIGGER, REFERENCES, MAINTAIN from anon/authenticated/service_role on all public tables and views (hosted DEV verified: 388 such grants to 0) and from the postgres default privileges in `public`. New tables and views get no app-role privileges by default: every migration must grant exactly what it needs. See docs/HANDOVER.md section 7.
- **Never touch the Relay project** (other product, old account) or the abandoned `dha-suite` ref. The Supabase MCP connector is logged in to the old account: do not use it here.
- **Branches: work on `dev` only.** `main` = production, no Supabase production project exists yet; the linked project `xiozwoocisesgmegewww` is DEV. Remote: github.com/abdullah-automates31/DHA---Works. Never push to `main` unless the user says so (see docs/SETUP.md).
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (plus the `Claude-Session:` line when the session reminder gives one). Committed and pushed to `dev` up to `6509929` (worker W08 + W10); everything from W11 onward (screens, tests, migration 0020, docs) is uncommitted. Ask before committing or pushing.
- When a requirement is unclear, build what is clear and record the rest in `docs/OPEN-QUESTIONS.md` for Shariq (the user's standing instruction).

## Worker app (apps/worker)

- Expo SDK 58 + Expo Router + TypeScript in a minimal npm workspace (no pnpm/Turborepo yet) with `packages/supabase` (generated `database.types.ts`). Details, screen-to-backend map and local run steps: `docs/WORKER-APP.md`.
- Layout: `src/app` routes, `src/features/<area>` (pure `rules.ts` + unit tests with `node --test`, hooks, injectable-client calls), `src/components`, `src/i18n/en.ts` (all text), `src/lib`. Business rules stay in the database; the app prepares requests and maps refusals to friendly messages.
- Checks (from the repo root): `npm run worker:typecheck`, `npm run worker:lint`, `npm run worker:test` (194 tests), `npx expo export --platform ios|android` from `apps/worker`. Database: `npm run db:local -- test db` (592 assertions, 16 files), `npm run db:local -- db lint --local`, `bash supabase/proposals/run_proposal_test.sh`.
- Local run: Docker + `npm run db:local -- start` (API 127.0.0.1:55321, Mailpit :55324); `apps/worker/.env` (gitignored) points at the PC's LAN IP and the local anon key; the user runs Metro in their own PowerShell (`npx expo start --lan`) and tests in Expo Go on an iPhone (Android untested). Fake local-only data scripts are in `supabase/dev/` (`seed_phone_workers.sql` adds phone-auth test accounts; `seed_worker_journey.sql -v phone=...` puts a worker in every job state; `-v email=...` remains for legacy email accounts).
- Live updates: Realtime is published only for `public.notifications` (migration 0020); screens refresh when the worker's notification arrives (`features/live/useLiveRefresh.ts`).
- Privacy rule for UI: before a quote is accepted never show a resident's name, phone, plot or address (also not in notifications); the helpline and FAQ stay hidden until `app_settings.helpline_enabled`.
- Tooling gotcha: bash heredocs and `node -e` containing apostrophes fail to parse; create files with the Write tool or `.cjs` patch files.
- Open: the user reported the UI "moves here and there continuously" (not reproduced; needs a screen recording or the screen name plus the motion); commit of W11-W18; push of 0016/0017/0020 to DEV only if asked; unapplied proposals 0018/0019 in `supabase/proposals/`; W09 stays out of the MVP.

## Product

DHA Works is a home-services marketplace for DHA Karachi: a verified resident posts a repair job with photos, several approved workers mark interest and send quotes, the resident compares and **accepts one**, the work is done, and payment is **cash** (worker records it; whether the resident still confirms is pending Shariq, see HANDOVER.md). DHA staff verify workers and residents and handle reports. UI reference: `C:\Users\Abdullah Ali\DHA-Works-UI\` (`SPEC.md` + screenshots; ignore the `.dc.html` code). Three products on one Supabase backend (Postgres + RLS, Auth, Storage, Realtime, Edge Functions):

- Customer app and Worker app: separate Expo (React Native) + TypeScript apps, Android first (no Mac, so iOS later).
- Admin portal: Next.js + TypeScript on Vercel.

## Planned architecture (docs/ARCHITECTURE.md)

- pnpm + Turborepo monorepo: `apps/{customer,worker,admin}`, `packages/{shared,supabase,ui-native}`, `supabase/{migrations,functions,tests}`. `packages/shared` holds types, constants (categories, phases, statuses), Zod schemas, money/date helpers used by all three apps.
- **Business rules live in the database, not the apps.** The job lifecycle is a state machine enforced by one SQL function (RPC) per transition; each checks caller role + current status, updates, and writes the audit log in one transaction. Quote totals are computed server-side from line items.
- **Competition model (supersedes claim-lock):** no lock. Workers register interest and submit quotes; accepting a quote is one atomic RPC that accepts that quote, rejects the others and moves the job to `scheduled` (guarded so it can only happen once); `accepted` stays in the enum but is unused. Direct booking of a specific worker is post-MVP.
- pg_cron handles stuck-job flagging, review reminders and job expiry (open jobs expire after 24 hours; accepted jobs never expire). Edge Functions only for what SQL can't do (push via Expo); auth OTP is handled by Supabase Auth with Twilio/Twilio Verify for WhatsApp, not a custom function. DB triggers create `notifications` rows; an Edge Function sends the push.
- Storage: private buckets (`identity`, `job-media`, `worker-media`, `report-media`; no chat in MVP 1), signed URLs only.
- Mobile: Expo Router, TanStack Query + Realtime cache updates, react-hook-form + shared Zod schemas. All UI text goes through a translation file from day one (English first, Urdu later).
- Schema changes ship only as migration files in `supabase/migrations`; never edit production by hand. Separate Supabase projects for dev/staging/prod.

## Product decisions that are easy to get wrong (docs/DECISIONS.md)

- Customer and worker accounts are separate. Worker sign-in is phone + WhatsApp OTP, six digits; email sign-in is removed from the worker app. Resident/admin sign-in remains email + Google until those apps are built (the Security doc's "phone is main identity everywhere" is superseded; phone is the worker identity).
- Matching is by category + DHA phase (1–8); no GPS.
- Workers and residents are both verified manually by DHA staff (outcomes: Approve / Visit HQ / Reject). Worker documents per the UI: CNIC, police certificate, photo; no licence. Resident: CNIC + utility bill.
- Job statuses: `draft, open, interested, quoted, accepted (unused), scheduled, in_progress, completed, cash_collected, reviewed`, plus side states `disputed`, `cancelled`, `expired`.
- **Quote revisions are MVP 2**, not MVP 1 (a sent quote is final). Rejected worker cannot re-quote the same job. Cash: both sides enter the amount (write-once) and the job closes as `cash_collected` either way; a price difference never disputes a job (Shariq, 27 Oct), and a rating below 3 files a `poor_work` report. Worker must upload a material bill when the quote has materials. Pending Shariq: cash may become worker-only.
- Resident phone and plot number are hidden until a quote is accepted (area only before). Voice notes are in the MVP. A worker can have several categories. Eight categories, stored in the database. Reports allowed from `scheduled` until 7 days after completion; outcomes no action / warning / suspend; staff job cancellation is a separate action; no refunds.
- Ratings are customer → worker only for now. "Report a problem" and "I feel unsafe" exist in both apps; helpline 1092.
- Commission, manual job assignment by staff, direct booking and chat are out of scope for the MVP.

When sources conflict, `docs/DECISIONS.md` records which wins. All docs were rewritten to this model on 27 Oct; `docs/DB-API-DESIGN.md` is the source of truth for the database and mobile APIs. Items marked Pending in `docs/OPEN-QUESTIONS.md` are unconfirmed.

## Setup notes (docs/SETUP.md, planned)

Windows 11 dev, Android phone with Expo Go, Docker Desktop only for the local Supabase stack. Env var names are in `.env.example`; `SUPABASE_SERVICE_ROLE_KEY` is server-side/Edge Functions only and must never reach an app or browser bundle. Only `.env.example` is committed.
