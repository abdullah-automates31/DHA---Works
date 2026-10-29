# Session handover

Read this first in a new session. It is the detailed record of where the work stands as of **29 Oct 2026**, so nothing from earlier sessions is lost. The product rules are in [DECISIONS.md](DECISIONS.md); the database design is in [DB-API-DESIGN.md](DB-API-DESIGN.md).

## 1. Where we are

- Documentation is complete and rewritten for the competing-quotes model (27 Oct), plus Shariq's 27 Oct feedback.
- **Database and mobile API:** 15 migrations. **0001 to 0014 are applied to hosted DEV** (`xiozwoocisesgmegewww`; 0013 and 0014 on 29 Oct). **0015 (default-privileges cleanup) is committed and passes all tests locally, but is NOT applied to hosted DEV** (waiting for the user's approval).
- **Push Edge Function** `supabase/functions/send-push`: built and tested locally, **NOT deployed**. No secret is set on DEV and no scheduler calls it.
- **Types:** `packages/supabase/database.types.ts`, generated from DEV after 0013 (0014 only changes grants, so the types are unchanged).
- No app code: no Customer app, Worker app, admin portal, root `package.json` or monorepo yet.
- **Git:** `https://github.com/abdullah-automates31/DHA---Works.git`. `main` = production (untouched since the first push), `dev` = all work. The linked Supabase project is DEV; no production project exists yet (see SETUP.md). Commit messages end with the `Co-Authored-By` line of the model doing the work.

## 2. Accounts, projects and environment (do not mix these up)

| Thing | Value |
| --- | --- |
| Hosted DEV project | ref `xiozwoocisesgmegewww`, eu-west-1, Postgres 17, org `rtobksutpomecxpibbld`, account `dhaworks.developments@gmail.com`, free tier |
| Production project | does not exist yet; the user creates it later |
| Abandoned project | `dha-suite`, ref `qfxpluotmrxmxqseelnh`. The user said "forget dha suite". Never push there. |
| Other product | **Relay** (ref `crhqgcphpivsjoqzgfzd`, local stack project id `Relay`). Belongs to an older account. **Never touch it.** |
| Supabase MCP connector | Logged in to the OLD account (sees only Relay). Do not use it for this project. Use the Supabase CLI. |
| Working dir | `C:\Users\Abdullah Ali\dha-works`, Windows 11, PowerShell and Bash |
| Tools | Supabase CLI 2.109.1 (2.122.0 available), Docker Desktop 29.7.2, Deno 2.9.4. Python is not usable from the Bash tool here. |
| Who runs what | The user runs `supabase login` and `link`. `supabase db push` to DEV only when the user asks in the current task, after checking branch `dev`, the linked ref and `db push --dry-run`. Never deploy functions or set secrets unless asked. |

Local stack: project id `dha-works`, API on `http://127.0.0.1:55321` (ports 553xx). Docker Desktop may auto-restart a Relay stack; stop it with `supabase stop --project-id Relay` (data is kept).

Rules: schema changes only as new migration files (never edit an existing one); never edit a hosted database by hand; `SUPABASE_SERVICE_ROLE_KEY` never reaches an app or browser; only `.env.example` is committed; no real CNIC or resident data until a backup and restore is tested (free tier has no PITR).

## 3. Migrations (`supabase/migrations/`)

| File | Content | Hosted DEV |
| --- | --- | --- |
| 20261027000001 | enums (no `voice_intro` doc type) and `set_updated_at` | yes |
| 0002 | categories (8), service_areas (phases 1 to 8), app_settings with seed rows, `get_setting` | yes |
| 0003 | profiles, addresses, worker_details (incl. `voice_intro_path`), worker_categories, worker_areas, worker_references, verification_documents, verification_decisions | yes |
| 0004 | jobs (code `DW-####`), job_private, job_photos, job_views, job_interests, quotes (generated `total`; one `sent` per job+worker; one `accepted` per job), job_events, cash_records (write-once trigger), cancellation_requests | yes |
| 0005 | reviews, reports (`RP-####`, `system_generated`), report_photos/notes/calls, notifications, device_tokens, audit_log (append-only incl. truncate), staff_invites | yes |
| 0006 | RLS helpers (`current_user_role`, `is_admin`, `is_active_approved`, `worker_matches_job`, `worker_has_stake`, `is_job_owner`, `is_accepted_worker`, `can_view_job`), SELECT-only grants to `authenticated`, anon gets nothing, policies | yes |
| 0007 | schema `private` helpers (`me`, `setting_int`, `record`, `notify`, `notify_admins`, `recompute_job_stage`); RPCs `register_profile`, `update_my_profile`, `upsert_address`, `add_verification_document`, `set_my_references`, `submit_for_review`, `register_device_token`, `mark_notifications_read`, `file_report` | yes |
| 0008 | resident RPCs: `save_job_draft`, `delete_draft`, `post_job`, `update_job`, `cancel_job`, `accept_quote` (locks the job row; straight to `scheduled`; others become `not_selected`), `reject_quote`, `confirm_cash_resident`, `private.settle_cash`, `submit_review` | yes |
| 0009 | worker RPCs: `set_my_areas`, `set_my_categories`, `set_available_today`, `update_worker_details`, `record_job_view`, `express_interest`, `withdraw_interest`, `submit_quote` (no re-quote after reject), `withdraw_quote`, `start_job`, `complete_job`, `record_cash_worker`, `request_cancellation`, `withdraw_cancellation_request` | yes |
| 0010 | read views (security_invoker = false, filter on `auth.uid()`): `categories_with_counts`, `resident_jobs`, `resident_quotes`, `worker_feed`, `worker_jobs`, and `get_my_earnings()`. The Supabase advisor warns about security-definer views; expected. | yes |
| 0011 | `pg_cron` hourly job `dw-hourly-sweeps` (`5 * * * *`): expire open jobs at 24 h with a 20 h reminder, flag stuck jobs, rating reminders. Drafts are not purged. | yes |
| 0012 | private storage buckets `identity`, `job-media`, `worker-media`, `report-media`, path prefix `<uid>/...`, policies, `public.is_approved_worker` | yes |
| 20261028000013 | Shariq's 27 Oct feedback: `jobs.material_bill_path`; `complete_job(job, bill_path)`; cash difference closes the job as `cash_collected` (never `disputed`, no `cash_price` report); `submit_review` below 3 files a system `poor_work` report; `resident_jobs` gains `material_bill_path`; `job_media_read` lets the resident read the bill | yes (29 Oct) |
| 20261029000014 | send-push grants: column-level privileges for `service_role` only (read push columns of `notifications`, update `push_sent_at`; read `user_id, push_token` of `device_tokens` and delete; read `id, account_status` of `profiles`). Nothing for app users. Hosted grants inspected after push: exact match. | yes (29 Oct) |
| **20261029000015** | **default-privileges cleanup:** revokes TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on all public tables and views from `anon`, `authenticated`, `service_role`, and removes them from the `postgres` default privileges in `public`. SELECT/INSERT/UPDATE/DELETE, column grants, RLS, policies, owners and Supabase schemas unchanged (verified by a before/after snapshot diff). | **no, local only** |

Verified: `supabase db reset` applies all 15 locally; `supabase db lint --local` clean; hosted history matches local for 0001 to 0014 and `db lint --linked` is clean.

The planned worker-only cash change (if Shariq confirms) will be **0016**.

## 4. Tests (all local)

- **pgTAP, `supabase test db`: 217 assertions in 5 files, all pass.**
  - `default_privileges.test.sql` (41): no app role holds TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on any public table or view, new tables and views get none by default, intended grants and RLS intact, `authenticated` and `service_role` can no longer truncate or lock, the audit-log guard still fires.
  - `job_lifecycle.test.sql` (52): draft and post, feed visibility, competing quotes, reject and no re-entry, single accept, privacy, start/complete and bill rules, cash write-once, price mismatch closes the job, review anonymity, low rating report, audit append-only.
  - `lifecycle_edges.test.sql` (54): resident isolation, direct-write denial, cancellation requests, report rules and 7-day window, expiry, 20 h reminder, stuck-job and rating-reminder sweeps, storage policies.
  - `notifications_privacy.test.sql` (19): users read only their own notifications, cannot create or edit them, cannot read or plant device tokens; a phone's token moves between accounts, never copies.
  - `service_role_grants.test.sql` (51): pins 0014's exact privileges and checks app users gained nothing and RLS is still on.
- **Concurrency:** `bash supabase/tests/concurrency/accept_race.sh` (then `supabase db reset`): two sessions accept different quotes on one job, exactly one wins. PASS.
- **send-push:** `deno test` in `supabase/functions/send-push`: 23 pass. `bash supabase/functions/send-push/integration/run.sh` (then `supabase db reset`): 12 end-to-end checks against the local database and a mock Expo server, using only the grants from the migrations. PASS.
- Not tested yet: Realtime, a real push to a phone, Expo receipts. No `supabase/seed.sql` (reset prints a harmless warning).

## 5. Shariq Bhai's feedback (27 Oct, reported 28 Oct) and its status

| Note | Status |
| --- | --- |
| Worker app needs a mandatory material bill upload; typing the materials list is optional | **Built** in 0013. **Assumed:** bill required only when the accepted quote has materials above 0. Confirm. |
| Rated below 3 means poor work, added inside reports | **Built.** **Assumed:** mean of the three scores below 3. Confirm. |
| A price difference is never disputed by itself; complaints are separate or by rating below 3 | **Built.** Job closes as `cash_collected`, `cash_records.matched = false`. |
| "Cash collected by worker (status should be shown on C13)" and a standalone "Review pending" instead of "Cash paid and review" | **UI only so far.** Written into UI-UX.md section 10. |
| Possible meaning: cash becomes **worker-only** (customer does not confirm cash; no C20) | **NOT built. Pending Shariq.** If yes: migration 0016 makes `record_cash_worker` close the job directly and retires `confirm_cash_resident`; update tests and docs. |
| Customer status-variation screen like the worker app | UI task (design owner). Not drawn. |
| Remove W11 My jobs action buttons; remove the Direct requests screen | UI tasks (design owner). |
| "v2 need expiry" | **Not understood.** Do not guess; ask Shariq and record the answer in DECISIONS.md. |

The user's instruction: build what is clear, leave what is unsure, they will confirm with Shariq and report back.

## 6. Decisions to flag to Shariq

1. Unsafe and price reports flag the job (`under_review_reason`) but do not change its status.
2. Drafts never expire.
3. The two assumptions in section 5 and the worker-only cash question.

## 7. Security follow-ups

- **Default privileges:** Supabase's default privileges for schema `public` give `anon`, `authenticated` and `service_role` TRUNCATE, TRIGGER, REFERENCES and MAINTAIN on **all 29 public tables and the 5 views** (ACL `Dxtm`, from `pg_default_acl` of role `postgres`; confirmed on hosted DEV, not from our migrations). Locally, a signed-in role could `truncate public.jobs cascade` (15 tables, bypassing RLS); not reachable through the Data API, but real. **Fixed by migration 0015 (committed, local only; still present on hosted DEV until 0015 is applied).**
- Not covered by 0015: `supabase_admin`'s default privileges in `public` (only for objects that role creates; we never do) and Supabase-managed schemas.
- `send-push` uses `verify_jwt = false`; the `x-push-secret` shared secret is the only gate. Use a long random value and rotate it if leaked.
- The service-role key can still call every RPC; keep it server-side only.

## 8. Next steps, in order

1. User approves applying 0015 to hosted DEV; then dry run (only 0015 pending), push, verify history, ACLs and lint, and check Realtime and Studio still work.
2. To make push live on DEV: `supabase secrets set PUSH_DISPATCH_SECRET=...`, `supabase functions deploy send-push`, add a scheduler (pg_cron + pg_net, needs a migration). Each needs the user's go-ahead.
3. When Shariq answers: worker-only cash (0016) if confirmed; adjust bill and rating assumptions; record "v2 need expiry".
4. Add `supabase/seed.sql` for dev.
5. Scaffold the monorepo (pnpm + Turborepo) and start the Customer app. Needs explicit approval first.
6. Backup routine and a tested restore before any real data.

## 9. Where things live

- Product source of truth: `docs/DECISIONS.md` (wins on conflicts), `docs/DB-API-DESIGN.md` (database and APIs).
- Push function design and security: `supabase/functions/send-push/README.md`.
- Agent instructions: `CLAUDE.md` and `AGENTS.md`.
- UI reference (outside the repo): `C:\Users\Abdullah Ali\DHA-Works-UI\` (`SPEC.md`, screenshots; ignore `.dc.html`). Screen ids: C = customer, W = worker, A = admin.
- Claude's memory index: `C:\Users\Abdullah Ali\.claude\projects\C--Users-Abdullah-Ali-dha-works\memory\MEMORY.md`.
- Old conversation transcript: `C:\Users\Abdullah Ali\.claude\projects\C--Users-Abdullah-Ali-dha-works\5489b549-2150-4e6a-b922-b482bb0cd147.jsonl`.
