# Session handover

Read this first in a new session. It is the detailed record of where the work stands as of **28 Oct 2026**, so nothing from earlier sessions is lost. The product rules are in [DECISIONS.md](DECISIONS.md); the database design is in [DB-API-DESIGN.md](DB-API-DESIGN.md).

## 1. Where we are

- Documentation is complete and rewritten for the competing-quotes model (27 Oct).
- **Database and mobile API are written, tested locally and pushed** to the hosted Supabase project (migrations 0001 to 0012). Migration **0013 is written and tested locally but NOT pushed**. The user must run `supabase db push` in their own PowerShell.
- No app code exists: no Customer app, Worker app, admin portal, Edge Function or `packages/*` yet.
- **Git:** everything is committed and pushed to `https://github.com/abdullah-automates31/DHA---Works.git`. Branches: `main` (production, untouched) and `dev` (all work, tracks origin/dev). Local `master` was renamed `main`. The linked Supabase project `xiozwoocisesgmegewww` is the DEV database; no production project exists yet (see SETUP.md). Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## 2. Accounts, projects and environment (do not mix these up)

| Thing | Value |
| --- | --- |
| Hosted project (the real one) | ref `xiozwoocisesgmegewww`, eu-west-1, Postgres 17, org `rtobksutpomecxpibbld`, account `dhaworks.developments@gmail.com`, free tier |
| Abandoned project | `dha-suite`, ref `qfxpluotmrxmxqseelnh`. The user said "forget dha suite". Never push there. |
| Other product | **Relay** (ref `crhqgcphpivsjoqzgfzd`, local stack project id `Relay`). Belongs to an older account. **Never touch it.** |
| Supabase MCP connector | Logged in to the OLD account (sees only Relay). Do not use it for this project. Use the Supabase CLI. |
| Working dir | `C:\Users\Abdullah Ali\dha-works`, Windows 11, PowerShell and Bash |
| Tools | Supabase CLI 2.109.1 (2.122.0 available), Docker Desktop 29.7.2. Python is not usable from the Bash tool here. |
| Who runs what | The user runs `supabase login`, `link`, and `db push` themselves. Ask before risky commands; the user has rejected some tool calls. `!` prefix only works inside the Claude Code prompt. |

Local stack: project id `dha-works` (ports 543xx). Docker Desktop may auto-restart a Relay stack on the default ports; stop it with `supabase stop --project-id Relay` (data is kept). If `supabase start` says a container name is already in use, the stack is already running.

Rules: schema changes only as migration files; never edit production by hand; `SUPABASE_SERVICE_ROLE_KEY` never reaches an app or browser; only `.env.example` is committed; no real CNIC or resident data until a backup and restore is tested (free tier has no PITR).

## 3. Migrations (`supabase/migrations/`)

| File | Content |
| --- | --- |
| 20261027000001 | enums (no `voice_intro` doc type) and `set_updated_at` |
| 0002 | categories (8), service_areas (phases 1 to 8), app_settings with seed rows, `get_setting` |
| 0003 | profiles, addresses, worker_details (incl. `voice_intro_path`), worker_categories, worker_areas, worker_references, verification_documents, verification_decisions |
| 0004 | jobs (code `DW-####`), job_private, job_photos, job_views, job_interests, quotes (generated `total`; one `sent` per job+worker; one `accepted` per job), job_events, cash_records (write-once trigger), cancellation_requests |
| 0005 | reviews, reports (`RP-####`, `system_generated`), report_photos/notes/calls, notifications, device_tokens, audit_log (append-only incl. truncate), staff_invites |
| 0006 | RLS helpers (`current_user_role`, `is_admin`, `is_active_approved`, `worker_matches_job`, `worker_has_stake`, `is_job_owner`, `is_accepted_worker`, `can_view_job`), SELECT-only grants to `authenticated`, anon gets nothing, policies |
| 0007 | schema `private` helpers (`me`, `setting_int`, `record`, `notify`, `notify_admins`, `recompute_job_stage`); RPCs `register_profile`, `update_my_profile`, `upsert_address`, `add_verification_document`, `set_my_references`, `submit_for_review`, `register_device_token`, `mark_notifications_read`, `file_report` |
| 0008 | resident RPCs: `save_job_draft`, `delete_draft`, `post_job`, `update_job`, `cancel_job`, `accept_quote` (locks the job row; straight to `scheduled`; others become `not_selected`), `reject_quote`, `confirm_cash_resident`, `private.settle_cash`, `submit_review` |
| 0009 | worker RPCs: `set_my_areas`, `set_my_categories`, `set_available_today`, `update_worker_details`, `record_job_view`, `express_interest`, `withdraw_interest`, `submit_quote` (no re-quote after reject), `withdraw_quote`, `start_job`, `complete_job`, `record_cash_worker`, `request_cancellation`, `withdraw_cancellation_request` |
| 0010 | read views (security_invoker = false, filter on `auth.uid()`): `categories_with_counts`, `resident_jobs`, `resident_quotes`, `worker_feed`, `worker_jobs`, and `get_my_earnings()`. The Supabase advisor warns about security-definer views; expected. |
| 0011 | `pg_cron` hourly job `dw-hourly-sweeps` (`5 * * * *`): expire open jobs at 24 h with a 20 h reminder, flag stuck jobs, rating reminders. Drafts are not purged. |
| 0012 | private storage buckets `identity`, `job-media`, `worker-media`, `report-media`, path prefix `<uid>/...`, policies, `public.is_approved_worker` |
| **20261028000013** | **Shariq's 27 Oct feedback (local only until pushed):** `jobs.material_bill_path`; `complete_job(job, bill_path)` (drops the old one-argument version); cash difference closes the job as `cash_collected` (never `disputed`, no `cash_price` report); `submit_review` below 3 files a system `poor_work` report; `resident_jobs` view recreated with `material_bill_path`; `job_media_read` policy extended so the resident can read the bill |

Verified: `supabase db reset` applies all 13; `supabase db lint --local` and `--linked` found no errors; hosted migration list matched local for 0001 to 0012.

## 4. Tests

Two pgTAP files, **106 assertions pass** (`supabase test db`): `job_lifecycle.test.sql` (52: draft and post, feed visibility, competing quotes, reject and no re-entry, single accept, privacy, start/complete and bill rules, cash write-once, price mismatch closes the job, review anonymity, low rating report, audit append-only) and `lifecycle_edges.test.sql` (54: resident-vs-resident isolation, direct-write denial, cancellation requests, report rules and 7-day window, expiry, 20h reminder, stuck-job and rating-reminder sweeps, storage policies). Helper schema `tests` with `act(uuid)` / `back()`.

`supabase/tests/concurrency/accept_race.sh` (local only, commits throwaway rows, run `supabase db reset` after): two real sessions accept different quotes on one job; exactly one wins and the other gets "this job can no longer accept a quote". **PASS (29 Oct).** Not tested yet: `file_report` for resident-vs-worker edge cases beyond the above, Realtime, Edge Functions. No `supabase/seed.sql` (reset prints a harmless warning).

## 5. Shariq Bhai's feedback (27 Oct, reported 28 Oct) and its status

| Note | Status |
| --- | --- |
| Worker app needs a mandatory material bill upload; typing the materials list is optional | **Built** in 0013. **Assumed:** bill required only when the accepted quote has materials above 0. Confirm. |
| Rated below 3 means poor work, added inside reports | **Built.** **Assumed:** mean of the three scores below 3. Confirm. |
| A price difference is never disputed by itself; complaints are separate or by rating below 3 | **Built.** Job closes as `cash_collected`, `cash_records.matched = false`. |
| "Cash collected by worker (status should be shown on C13)" and a standalone "Review pending" instead of "Cash paid and review" | **UI only so far.** Written into UI-UX.md section 10. |
| Possible meaning: cash becomes **worker-only** (customer does not confirm cash; no C20) | **NOT built. Pending Shariq.** If yes: migration 0014 makes `record_cash_worker` close the job directly, drops `confirm_cash_resident`, update tests and docs. The user asked whether this was done; it was not, and the user has not yet confirmed with Shariq. |
| Customer status-variation screen like the worker app | UI task (design owner). Not drawn. |
| Remove W11 My jobs action buttons; remove the Direct requests screen | UI tasks (design owner). |
| "v2 need expiry" | **Not understood.** Quote expiry? Nothing built. Ask. |

The user's instruction: build what is clear, leave what is unsure, they will confirm with Shariq and report back.

## 6. Decisions to flag to Shariq (from earlier)

1. Unsafe and price reports flag the job (`under_review_reason`) but do not change its status.
2. Drafts never expire (the old doc line about purging drafts was removed).
3. The two assumptions in section 5 and the worker-only cash question.

## 7. Next steps, in order

1. User runs `supabase db push` to put 0013 on the hosted project; then verify with `supabase migration list --linked` and `supabase db lint --linked`.
2. (Done 28 Oct) Committed and pushed to `dev`. Keep working on `dev`.
3. When Shariq answers: apply the worker-only cash change (0014) if confirmed; adjust the bill and rating rules if assumptions were wrong; clarify "v2 need expiry".
4. (Done 29 Oct) Second pgTAP file and the concurrent accept race. Still to add: `supabase/seed.sql` for dev.
5. Expo push Edge Function (reads `notifications` where `push_sent_at is null`).
6. Generate TypeScript types into `packages/supabase` (`supabase gen types typescript --linked`).
7. Scaffold the monorepo (pnpm + Turborepo) and start the Customer app. Needs explicit approval first (CLAUDE.md says do not scaffold apps without it).
8. Backup routine and a restore test before any real data (free tier has no PITR).

## 8. Where things live

- Product source of truth: `docs/DECISIONS.md` (wins on conflicts), `docs/DB-API-DESIGN.md` (database and APIs).
- UI reference (outside the repo): `C:\Users\Abdullah Ali\DHA-Works-UI\` (`SPEC.md`, screenshots; ignore `.dc.html`). Screen ids: C = customer, W = worker, A = admin.
- Claude's own memory index: `C:\Users\Abdullah Ali\.claude\projects\C--Users-Abdullah-Ali-dha-works\memory\MEMORY.md`.
- Full old conversation transcript: `C:\Users\Abdullah Ali\.claude\projects\C--Users-Abdullah-Ali-dha-works\5489b549-2150-4e6a-b922-b482bb0cd147.jsonl`.

## 9. Update 29 Oct: migration 0013 on DEV, types, push function

- **0013 applied to DEV** (`xiozwoocisesgmegewww`) via `supabase db push` after checking branch `dev`, the linked ref and a dry run. Remote history matches local (0001 to 0013), `supabase db lint --linked` clean, and the generated types confirm `jobs.material_bill_path`, `complete_job(p_job_id, p_bill_path)` and the `poor_work` kind. Section 3's note "0013 local only" is now obsolete.
- **Types:** `packages/supabase/database.types.ts` (generated from DEV; there is no package.json there yet, the monorepo is not scaffolded). Regenerate after every migration.
- **Push Edge Function:** `supabase/functions/send-push` (handler, lib, 23 Deno tests, integration script with a mock Expo server). **Not deployed.** Design and security notes in its README.
- **Blocker found:** `service_role` has no table privileges on `notifications`, `device_tokens`, `profiles`. A migration with the grants in `supabase/functions/send-push/REQUIRED_GRANTS.sql` is needed before deployment. Not written, because the task said not to change migrations; needs the user's go-ahead.
- Also still needed for push: a scheduler (pg_cron + pg_net or a database webhook) calling the function with the secret, `PUSH_DISPATCH_SECRET`, an Expo project and real devices.
- New pgTAP file `notifications_privacy.test.sql`. Totals: 125 pgTAP assertions in 3 files, 23 Deno tests, 13 integration checks, 1 concurrent race script.
- Still pending Shariq: worker-only cash, "v2 need expiry", the bill and rating assumptions (section 5).
