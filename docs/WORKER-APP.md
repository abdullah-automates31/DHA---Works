# Worker app (apps/worker): build record

Status at **30 Oct 2026**: all worker screens W01 to W08 and W10 to W18 are built and tested against the **local** Supabase stack. W09 (Direct requests) is out of the MVP. W01 now uses phone + WhatsApp OTP; local development uses fixed test OTPs and sends no message. Nothing from W11 onward is committed yet; it waits for the user's review. Pending design decisions and unconfirmed assumptions are in [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md); the product rules are in [DECISIONS.md](DECISIONS.md).

## Stack and layout

- Expo SDK 58, Expo Router, TypeScript, React Native 0.8x, minimal npm workspace (no pnpm yet) with `packages/supabase` (generated `database.types.ts`).
- `apps/worker/src/app`: routes. `features/<area>`: pure rules (`rules.ts`, unit tested with `node --test`) plus hooks and injectable-client calls. `components`: shared UI. `i18n/en.ts`: all text (English first). `lib`: auth, profile context, Supabase client.
- Business rules stay in the database. The app prepares requests, maps refusals to friendly messages and shows state.
- Known open item: two copies of React (19.3.0 in the app, 19.3.1 at the root); fix before the first real build. Android is untested on a device.

## Screens and the backend each uses

| Screen | Route | Backend |
| --- | --- | --- |
| W01 Sign in (phone/WhatsApp OTP) | `(auth)` | Supabase Auth |
| W02 About you, W03 Documents + references, W03b Your work + voice, W04 Under review | `about`, `documents`, `references`, `work`, `status` | `register_profile`, `add_verification_document`, `set_my_references`, `set_my_categories`, `update_worker_details`, `submit_for_review`, storage `identity` / `worker-media` |
| W05 Areas | `areas` | `set_my_areas` |
| W06 Home | `(tabs)/home` | `worker_feed` (count), `worker_jobs`, `notifications` (unread dot) |
| W07 Open jobs | `(tabs)/open-jobs` | `worker_feed` |
| W08 Job detail | `job/[id]` | `worker_feed`, `record_job_view`, `express_interest` |
| W10 Create quote | `job/[id]/quote` | `submit_quote` |
| W11 My jobs (Active / Completed / All) | `(tabs)/my-jobs` | `worker_jobs`, `cash_records` |
| W12 Job status | `job/[id]/status` | `worker_jobs`, `job_interests`, `quotes`, `cash_records`, `cancellation_requests`, `start_job`, `complete_job` (+ bill photo to `job-media`) |
| W13 Record cash | `job/[id]/cash` | `record_cash_worker` |
| W18 Request cancellation | `job/[id]/cancel` | `request_cancellation`, `withdraw_cancellation_request` |
| W14 Report a problem / I feel unsafe | `job/[id]/report` | `file_report`, photos to `report-media` |
| W15 Notifications | `notifications` | `notifications`, `mark_notifications_read` |
| W16 Profile | `(tabs)/profile` | `get_my_earnings`, `set_available_today`, `set_my_categories`, sign out |
| W17 Help and support | `help` | `app_settings` (helpline hidden until `helpline_enabled`) |
| Live updates | hook `features/live/useLiveRefresh.ts` | Realtime on `notifications` (migration 0020) |

## Decisions applied (see OPEN-QUESTIONS.md for the ones to confirm)

- Privacy: before a quote is accepted a worker never sees a resident's name, phone, plot or address; notifications never contain them. Helpline 1092 is hidden until DHA approves it.
- No distance filter, no "Nearest", no Requests tab (4 tabs), no "Call, then quote". A rejected worker cannot re-quote. Phone stored as +92 plus 10 digits.
- Cash: both sides enter amounts. After the worker records, the job stays `completed` ("Cash recorded, waiting for the customer") until the customer confirms. A mismatch still closes as `cash_collected`. Worker-only cash is pending Shariq.
- Material bill photo required to complete a job whose accepted quote has materials above 0.
- Cancellation after acceptance is a request that staff decide (scheduled or in progress only).
- Reports: five worker reasons map to `rude_damage`, `unsafe`, `no_show`, `cash_price`, `other`; up to 3 photos; allowed from job start.
- Live updates use notifications as the trigger; job tables are not published to Realtime.

## Phone auth (30 Oct)

- W01 asks for a Pakistani mobile number and requests a six-digit code on WhatsApp. The code step verifies with Supabase `verifyOtp({ phone, token, type: 'sms' })` (Supabase calls the phone OTP type `sms` even when the delivery channel is WhatsApp).
- `auth.users.phone` stores the international number **without** the leading `+` (`923001234567`); `profiles.phone` keeps `+923001234567` for the app. The local seed follows both formats.
- Email sign-in is removed from the worker app. `profiles.email` is still nullable and the local resident seed still uses email; existing email accounts are linked by their auth user id, not by email, and need a one-time phone-link/admin migration if they are to keep signing in.
- `supabase/config.toml` (the file `supabase config push` sends) enables phone sign-up and has Twilio disabled with `env(SUPABASE_AUTH_SMS_TWILIO_*)` references only. The five static test OTPs and fake Twilio values exist only in the generated, git-ignored `.supabase-local/supabase/config.toml` that `npm run db:local` builds. Auth does not call the provider for test numbers, so no WhatsApp/SMS cost is incurred. The test numbers are fake and must never reach a hosted project; `npm run safety:supabase` fails if they appear in the tracked config.
- Production is not configured: it needs a real Twilio or Twilio Verify account with a WhatsApp sender/Messaging Service and the token stored as `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN` on the server. Do not use an ordinary SMS gateway as a substitute for WhatsApp.
- Worker approval is unchanged: phone sign-in only creates the auth session; `verification_status` and `account_status` still gate the feed, quotes and tabs.

## Migrations added for the worker app (local only unless stated)

| File | Content |
| --- | --- |
| 20261029000016 | `submit_for_review` no longer needs areas (areas are chosen after approval) |
| 20261029000017 | `worker_feed.quote_count` |
| 20261030000020 | adds `public.notifications` to the `supabase_realtime` publication |

Hosted DEV is still at 0015. Two proposals are unapplied in `supabase/proposals/`: 0018 lock identity during review, 0019 owner delete and read of identity files (needs a privacy decision). Run them with `bash supabase/proposals/run_proposal_test.sh`.

## Run it locally

1. Docker Desktop running, then `npm run db:local -- start` (API `http://127.0.0.1:55321`, Mailpit `:55324`, Studio `:55323`). After changing `[auth.sms]`, run `npm run db:local -- stop` and `-- start` so Auth reloads it. Do not use a plain `supabase start`: it has no test OTPs.
2. `apps/worker/.env` (gitignored) holds `EXPO_PUBLIC_SUPABASE_URL` (the PC's LAN address, port 55321) and the local anon key. Windows Wi-Fi must be a Private network with firewall rules for ports 8081 and 55321.
3. From `apps/worker`: `npx expo start --lan`; open the QR code in Expo Go. Enter one of the local numbers below and its fixed code. No WhatsApp message is sent locally.
4. Local test data (fake, local only), applied with `docker exec -i supabase_db_dha-works psql -U postgres -d postgres [-v phone=...] < file`:
   - `supabase/dev/seed_open_jobs.sql`: fake resident and 6 open jobs; `seed_job_photos.mjs` adds photos and a voice note.
   - `supabase/dev/seed_phone_workers.sql`: approved, pending, suspended, rejected and no-profile phone accounts.
   - `supabase/dev/approve_local_phone_worker.sql -v phone=+923...`: approves a phone test worker.
   - `supabase/dev/seed_worker_journey.sql -v phone=+923001234567`: puts the approved worker into every job state plus 3 notifications (safe to re-run).
   - Email-based helpers remain for older local accounts: `approve_local_worker.sql -v email=...` and `seed_worker_journey.sql -v email=...`.

### Local test OTPs

| Phone | Code | Account |
| --- | --- | --- |
| `+923001234567` | `123456` | approved, active (use the journey seed) |
| `+923211234567` | `654321` | pending review |
| `+923331234567` | `112233` | suspended |
| `+923451234567` | `445566` | rejected |
| `+923561234567` | `778899` | no profile (starts at W02) |

These numbers are accepted by Auth without a provider call because `npm run db:local` adds them as `[auth.sms.test_otp]` to the generated local config (list in `scripts/lib/local-config.mjs`). They are not in `supabase/config.toml` and must never be enabled on hosted DEV or production.

## Checks (last run 30 Oct, all green except two known script checks)

- `npm run worker:typecheck`, `worker:lint`, `worker:test` (194 unit tests).
- `supabase test db`: 592 assertions in 16 files (worker files: `worker_app_prep`, `worker_documents`, `worker_feed_open_jobs`, `worker_job_detail`, `worker_quote`, `worker_work_step`, `worker_my_jobs`, `worker_cash_cancel`, `worker_report`, `realtime_publication`). `supabase db lint --local`.
- Local phone auth smoke test (30 Oct): `signInWithOtp({ channel: 'whatsapp' })` and `verifyOtp({ type: 'sms' })` succeeded for the seeded approved number without a provider call; the approved worker saw the feed; pending returned no feed; the no-profile number registered a profile with `email = null`.
- `npx expo export --platform ios|android` bundles.
- End-to-end scripts drive the real RPCs and storage with the app's own functions. They are kept outside the repo; known non-bugs: one assertion in the Stage A script was too strict, and "staff are notified" is 0 locally because no admin profile exists.

## Open items

- UI movement ("the layout moves here and there"): not reproduced; waiting for a screen recording or a description of the screen and motion.
- Commit and push of Stage A to D when the user has reviewed; push of 0016, 0017, 0020 to DEV only on explicit request.
- Decisions: the two proposals, W09 revisit, native vs designed tab bar, public repo, account email named in HANDOVER and SETUP.
- Not built: customer app, admin portal and the staff write RPCs (approve/reject, resolve reports, cancellation decisions, suspend).
