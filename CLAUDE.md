# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

**Database and mobile API built; no app code yet.** Read `docs/HANDOVER.md` first in every session: it has the full state, accounts, pending questions and next steps. Shariq Bhai (25 Oct) approved Supabase on the free tier and the order: DB + mobile-app APIs, then mobile apps, then the admin portal. The full architecture is not formally approved. Do not scaffold apps or create Supabase projects without explicit approval. `docs/` is the source of truth; `README.md` has the reading order.

- 13 migrations in `supabase/migrations` (0001 to 0012 pushed to hosted project ref `xiozwoocisesgmegewww`; 0013 local until the user runs `supabase db push`). pgTAP: `supabase/tests/job_lifecycle.test.sql`, 52 assertions.
- Commands (Supabase CLI, Docker running): `supabase db reset`, `supabase test db`, `supabase db lint --local`, `supabase migration list --linked`. The user runs `login`, `link` and `db push` themselves.
- **Never touch the Relay project** (other product, old account) or the abandoned `dha-suite` ref. The Supabase MCP connector is logged in to the old account: do not use it here.
- **Branches: work on `dev` only.** `main` = production, no Supabase production project exists yet; the linked project `xiozwoocisesgmegewww` is DEV. Remote: github.com/abdullah-automates31/DHA---Works. Never push to `main` unless the user says so (see docs/SETUP.md).
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Nothing is committed yet; ask before committing.
- When a requirement is unclear, build what is clear and record the rest in `docs/OPEN-QUESTIONS.md` for Shariq (the user's standing instruction).

## Product

DHA Works is a home-services marketplace for DHA Karachi: a verified resident posts a repair job with photos, several approved workers mark interest and send quotes, the resident compares and **accepts one**, the work is done, and payment is **cash** (worker records it; whether the resident still confirms is pending Shariq, see HANDOVER.md). DHA staff verify workers and residents and handle reports. UI reference: `C:\Users\Abdullah Ali\DHA-Works-UI\` (`SPEC.md` + screenshots; ignore the `.dc.html` code). Three products on one Supabase backend (Postgres + RLS, Auth, Storage, Realtime, Edge Functions):

- Customer app and Worker app: separate Expo (React Native) + TypeScript apps, Android first (no Mac, so iOS later).
- Admin portal: Next.js + TypeScript on Vercel.

## Planned architecture (docs/ARCHITECTURE.md)

- pnpm + Turborepo monorepo: `apps/{customer,worker,admin}`, `packages/{shared,supabase,ui-native}`, `supabase/{migrations,functions,tests}`. `packages/shared` holds types, constants (categories, phases, statuses), Zod schemas, money/date helpers used by all three apps.
- **Business rules live in the database, not the apps.** The job lifecycle is a state machine enforced by one SQL function (RPC) per transition; each checks caller role + current status, updates, and writes the audit log in one transaction. Quote totals are computed server-side from line items.
- **Competition model (supersedes claim-lock):** no lock. Workers register interest and submit quotes; accepting a quote is one atomic RPC that accepts that quote, rejects the others and moves the job to `scheduled` (guarded so it can only happen once); `accepted` stays in the enum but is unused. Direct booking of a specific worker is post-MVP.
- pg_cron handles stuck-job flagging, review reminders and job expiry (open jobs expire after 24 hours; accepted jobs never expire). Edge Functions only for what SQL can't do (push via Expo, OTP/SMS). DB triggers create `notifications` rows; an Edge Function sends the push.
- Storage: private buckets (`identity`, `job-media`, `worker-media`, `report-media`; no chat in MVP 1), signed URLs only.
- Mobile: Expo Router, TanStack Query + Realtime cache updates, react-hook-form + shared Zod schemas. All UI text goes through a translation file from day one (English first, Urdu later).
- Schema changes ship only as migration files in `supabase/migrations`; never edit production by hand. Separate Supabase projects for dev/staging/prod.

## Product decisions that are easy to get wrong (docs/DECISIONS.md)

- Customer and worker accounts are separate. Sign-in is email + Google first; phone OTP later (the Security doc's "phone is main identity" is superseded).
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
