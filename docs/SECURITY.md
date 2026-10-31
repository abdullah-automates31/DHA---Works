# Security

Version 2.0 (draft), 27 Oct 2026 (updated for the competing-quotes model); worker auth updated 30 Oct 2026. Companion to [PRD.md](PRD.md). Items marked **Pending** need a decision from Shariq Bhai.

## 1. Principles

- **Least privilege:** every user and every app reaches only the data its role needs.
- **The database enforces the rules:** access is controlled by Postgres Row Level Security (RLS), not only app code. A modified app must not be able to read or change other people's data.
- **Collect only what we need:** CNIC and address proof are sensitive. Keep them private, restrict who sees them, delete them on a schedule.
- **Log everything important:** verification decisions, suspensions, complaint outcomes, admin actions.

## 2. What we protect

| Data | Sensitivity | Who may see it |
| --- | --- | --- |
| CNIC number and photos (workers and residents) | High | Owner and DHA admin only |
| Utility bill, police certificate | High | Owner and DHA admin only |
| Phone, email, date of birth, gender | Medium | Owner and admin. A worker's phone is also their sign-in identifier but is never shown to residents before acceptance. **A resident's phone number and a worker's phone number are shown to the other party only after the resident accepts that worker's quote.** |
| Home address (phase, lane, plot, floor) | Medium | Owner and admin. Workers see phase and lane on the job post; **plot and floor only after acceptance** (confirmed by Shariq, 26 Oct). |
| Job text, job photos, job voice note | Medium | The resident, workers whose category and phase match (while the job is open), the accepted worker and admin |
| Quotes | Medium | The resident, the worker who wrote it, admin. Competing workers never see each other's quotes. |
| Worker voice introduction, profile picture | Low | Residents viewing the worker |
| Individual reviews | Medium | The resident who wrote it and admin. **Workers never see who rated them or the individual reviews**; they see only their own average. |

## 3. Authentication

- Supabase Auth. The worker app uses **phone number + WhatsApp OTP** (six digits); email sign-in has been removed from that app. Resident and admin apps are not built; their planned sign-in remains email/Google. See [DECISIONS.md](DECISIONS.md).
- The worker's phone number is also their sign-in identifier. It is still private profile data: other users see it only under the contact-release rule. It is never exposed in a job feed or notification.
- **Production WhatsApp is not configured.** It needs Twilio or Twilio Verify with a WhatsApp sender/Messaging Service and the token stored server-side as `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`. An ordinary SMS gateway is not a WhatsApp substitute. Local fixed test OTPs must never be enabled on hosted DEV or production: they live only in the generated `.supabase-local/` config (git-ignored), never in `supabase/config.toml`, which is what `supabase config push` sends. `npm run safety:supabase` (also run by `npm run db:local` and `npm run supabase:config-push`; the git pre-push hook checks the config in every commit being pushed) fails on any static test OTP, literal or placeholder Twilio credential. Hosted config is pushed only with `npm run supabase:config-push -- <target>`, which also checks the linked project ref against `scripts/supabase-targets.json`, blocks the Relay and `dha-suite` refs, pins the CLI version and, for production, requires real Twilio credentials in the environment. A raw `supabase config push` bypasses these checks and, because the shared config has Twilio disabled, could switch Twilio off on a hosted project, so it is never run against hosted projects.
- Resident and worker accounts are separate. One sign-in identifier maps to one role; a person using both roles needs two accounts.
- Admin portal: email and password with mandatory two-factor authentication. Admin accounts are created by an existing admin only.
- Rate limits on login and OTP requests; lockout after repeated failures.
- Short-lived tokens with refresh. Apps store tokens in secure device storage.

> Note: the Security draft described phone number as the main identity, while the PRD said email and Google first. The worker app now uses phone + WhatsApp; resident/admin identity is still to be built.

## 4. Authorization (roles and RLS)

Roles: **customer**, **worker**, **admin**. The role is stored on the server and checked in every RLS policy; it is never trusted from the app.

| Object | Customer | Worker | Admin |
| --- | --- | --- | --- |
| Own profile | Read, update (not role or status) | Read, update (not role or status) | Read, set verification and account status |
| Jobs | Create, read, cancel own | Read open jobs in their category and phase while approved and active; read jobs they have interest in or won | Read all, cancel |
| Job private details (plot, floor, phone) | Own | Only the accepted worker | Read all |
| Quotes | Read quotes on own jobs; accept or reject | Create and withdraw own quotes; read own only | Read all |
| Reports | Create for own jobs in the allowed window; read own | Same | Read all, record outcomes |
| Reviews | Create once per cash-collected job | **No access** (aggregate rating only) | Read all, hide if abusive |
| Audit log | None | None | Read only; nobody can edit or delete |

**Accept safety.** Accepting a quote is one atomic transaction on a locked job row, allowed only for the owning resident while the job is open, interested or quoted. Interest and quotes are allowed only for Approved, non-suspended workers who match the job's category and phase.

**Privileged actions** (approve a worker or resident, suspend, resolve a report, cancel a job) run only in server-side functions that check the admin role and write to the audit log. The service-role key never ships in either mobile app or the browser.

## 5. Document and image storage

- Supabase Storage with **private buckets** (`identity`, `job-media`, `worker-media`, `report-media`). No public URLs.
- Short-lived signed URLs. Storage policies mirror the table rules: the owner uploads, the owner and admin read.
- Limits on file type (JPEG, PNG, and short audio clips for voice notes and introductions) and size; compress on the phone because the free tier has about 1 GB. Strip EXIF location metadata on upload.
- **Pending:** retention. Suggested: delete CNIC and bill images some time after account closure; keep the verification decision and audit entry.

## 6. Data protection

- HTTPS only. Supabase encrypts data at rest.
- Secrets (database URL, service key, Expo and Vercel tokens, Twilio/WhatsApp provider token) live in the host's environment settings, never in the repository. Commit `.env.example` files without real values.
- Separate Supabase projects for development and production with different keys.
- Backups: the free tier has no point-in-time recovery, so we run our own scheduled backups: a daily `pg_dump` of the database (run from CI or a small scheduled job using a read-only connection string kept as a secret), plus a copy of the Storage buckets (a database dump does not include uploaded files), stored encrypted outside Supabase with limited access, a retention rule for old backups, and a restore test before any real data is held. Backups contain CNIC and bill images, so they get the same protection as the live data (encrypted, access limited to the owner and named staff).
- Logs must not contain CNIC numbers, phone numbers or free-text report content.
- A person can ask for their data to be deleted. Admin follows a written procedure (what is removed, what is kept for the audit trail).

## 7. Abuse and trust controls

- **Contact details hidden until acceptance.** There is no chat in MVP 1. Phone and plot number are released only after a quote is accepted, which reduces side deals before the platform records a choice.
- **Fake accounts.** Workers must be approved (CNIC, police certificate or references, photo) before quoting. Residents must be approved (CNIC and a recent bill matching the address) before posting. Both are manual staff decisions.
- **Fake or retaliatory reviews.** Only the resident of a cash-collected job, one review per job, anonymous to the worker; admin hiding is logged.
- **Spam jobs and quotes.** Limit open jobs per resident, posting rate and quotes per worker per hour. Open jobs expire after 24 hours.
- **Reports.** From Scheduled until 7 days after completion (a staff setting). "I feel unsafe" alerts staff immediately and shows both phone numbers. Outcomes: no action, warning, suspend, with a reason, logged. Staff can cancel a job as a separate audited action.
- **Physical visit safety.** CNIC and police certificate (or references), ratings, the Verified badge, the helpline 1092 and the unsafe-report path are a screening and response step, not a guarantee.

## 8. Hardening

- Apps contain only the public Supabase URL and the anon (publishable) key. All protection comes from RLS.
- Validate every input on the server as well as in the app, using shared types.
- Admin portal: Content Security Policy headers, secure cookies, CSRF protection, no secrets in browser code, role checks on every page and API route.
- Release builds only through EAS Build with signed keys kept by the owner. Back the keystore up in two places.
- Run `pnpm audit` in the pipeline and review updates regularly.

## 9. Audit log

Append-only: who, what, when, which record, old and new value, reason. Covers worker and resident decisions, suspensions, report outcomes, job cancellations by staff, stuck-job actions, review hiding and admin sign-ins. Nobody, including admin, can edit or delete rows.

## 10. Security testing

- **RLS tests (pgTAP):** per table, prove a customer, a worker and an unrelated user cannot read or write what they should not. The most important test set.
- **Accept race test:** concurrent accepts on one job give exactly one winner; the other quotes become not selected.
- **Supabase advisors:** run the security advisor before each release; fix every warning.
- **Manual abuse checks:** read another user's CNIC link, guess job IDs, post a job in another phase, request a phone number or plot number before acceptance, read a competitor's quote or a review as a worker.

## 11. Incident response (simple version)

1. Detect: user report, unusual log spike, or Supabase alert.
2. Contain: disable the affected account or feature, rotate the exposed key.
3. Review the audit log and storage access to see what was exposed.
4. Tell the affected people and DHA staff.
5. Fix the cause and add a test so it cannot return.

## 12. Pending decisions

| # | Decision | Suggested default |
| --- | --- | --- |
| 1 | Production WhatsApp OTP provider and cost | Twilio or Twilio Verify with a WhatsApp sender; account, sender and cost still to configure. Local test OTPs are not a production substitute. |
| 2 | Retention of CNIC and bill images | Delete after account closure plus a fixed period |
| 3 | ~~Address visibility to workers~~ | **Decided:** area before acceptance; phone, plot and floor after (Shariq, 26 Oct) |
| 4 | ~~Who reviews resident onboarding~~ | **Decided:** DHA staff review CNIC and bill by hand |
| 5 | ~~Extra worker checks~~ | **Decided:** police certificate or 2 references, in the MVP |
| 6 | ~~Backup level~~ | **Decided (27 Oct):** we create our own backups (daily dump plus storage copy, encrypted, restore-tested) |
| 7 | Legal: privacy notice and terms | Short privacy policy and terms at sign-up; get them reviewed |
