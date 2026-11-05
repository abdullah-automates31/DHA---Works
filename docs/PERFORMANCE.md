# Worker app performance work (5 Nov 2026)

Source: the mentor's "Improvements on DHA - Works Worker" list (9 points). Each point was reviewed, fixed, verified and challenged. Everything below is **local and uncommitted** until the user says so. Hosted DEV does not have migrations 0027 to 0029 yet; **push them before running the new app build**, because the app now reads `worker_feed.thumb_paths` and `worker_jobs.cash_recorded`.

## Results

| # | Point | What was done | Evidence |
| --- | --- | --- | --- |
| 1 | Skeleton loaders | `components/Skeleton.tsx` (one shared pulse per group, still when "reduce motion" is on, one "Loading" for screen readers); presets for feed card, job card, notifications, detail. Replaces the spinner on 12 screens. | typecheck, lint, both bundles. Needs a look on a phone. |
| 2 | Slow images | Signed URLs change on every load, so `expo-image` re-downloaded every photo each time. `lib/image.ts` gives each image a stable cache key (URL without the token); `memory-disk` cache, 150 ms fade; cache wiped on sign-out. | 4 unit tests. Uploads use `upsert: false`, so a path never changes content. |
| 3 | Compress images | Three profiles in `features/documents/files.ts`: documents (CNIC, police cert) 1600 px / 0.7, evidence (bill, report photos) 1280 px / 0.6, avatar 512 px. Voice: mono, 16 kHz, 32 kbps (about 120 KB per 30 s instead of about 480 KB). | 4 unit tests. **Needs a phone test of recording and playback.** |
| 4 | Join queries | Feed: first two photo paths now come in the feed row (`thumb_paths`). My Jobs: `cash_recorded` flag replaces the cash query. Job detail: reads run in parallel (5 trips down to 2). Categories plus the worker's choices: one nested query on 3 screens. | 28 live checks through PostgREST as a signed-in worker; pgTAP. |
| 5 | Pagination | Open jobs (20 per page), My Jobs (30), Notifications (30): `range()` with a stable order (id tie-break), one probe row instead of a count query, merge by id, auto-load near the end plus a "Show more" button. My Jobs always loads the worker's own in-flight jobs in full. | Live: pages cover every row once, ties included. |
| 6 | Indexes | Audited all foreign keys. Added only indexes with a real reader (0027, 0028). Not indexed on purpose: write-only audit columns (`decided_by`, `called_by`, ...). | pgTAP checks each index exists and the planner uses it. |
| 7 | Connection pool | **No pg-pool added.** See below. | Hosted DEV: 60 connections max, 7 in use. |
| 8 | SELECT * | App: none (guard test added). SQL: only `select * into v_job ... for update` inside PL/pgSQL, left as is. | `lib/queryRules.test.ts`, proven by planting violations. |
| 9 | Audit | Below. | |

## Big finds (measured on the local stack, exact app query)

| Query | Before | After |
| --- | --- | --- |
| Feed, 2,000 open jobs | 560 ms | 5.9 ms |
| Feed, 20,000 open jobs | 4,274 ms | 17.4 ms |
| My Jobs list, 30,000 jobs in the table | 64.6 ms, 32,342 buffers | 0.75 ms |

Cause of the feed cost: the matching rules were `SECURITY DEFINER` functions, which Postgres cannot see into, so it read every open job and ran them per row, and could not use `jobs_feed_idx`. Migration 0029 writes the same rules as plain SQL. `supabase/tests/worker_feed_equivalence.test.sql` keeps the old definition next to the new one and proves the same jobs are visible to 10 kinds of worker and at 3 expiry settings. My Jobs (0027) now starts from the worker's own quotes, interests and accepted jobs instead of testing every job.

## The five-point audit

- **N+1:** none in the app (guard test fails if an async `map` or a `for` loop awaits a query). In the database every per-row subquery in `worker_feed` is index-backed and only the returned page is shown.
- **Pagination:** every growing list is paged (feed, My Jobs, notifications). Single-row reads and config-sized tables (categories, service areas, settings) are exempt, and the guard test lists the exempt tables. Known limit: paging by offset can shift by one when a job is posted while scrolling; rows are merged by id so nothing shows twice, and a refresh fixes it.
- **Missing indexes:** 22 foreign keys had no index; 5 got one (0028), `notifications_unread_idx` was added (0027). The rest are never filtered by. Revisit when the admin portal is built (it will list reports and decisions by staff member).
- **Connection pool:** no code in this project opens a Postgres connection. The app talks to PostgREST over HTTPS and `send-push` uses supabase-js. Hosted DEV allows 60 connections and uses 7, nearly all Supabase's own services; PostgREST holds one. A new 10 to 20 connection pool would use up to a third of the whole budget with no caller. **Rule for later:** if the admin portal (Next.js on Vercel) ever needs a direct connection, use the Supavisor transaction pooler and a pool of 1 per serverless function, never a large pool per instance. Prefer supabase-js.
- **SELECT *:** none in the app. The `select * into v_job ... for update` lines in the RPC functions are single-row primary-key reads that lock and validate a row; naming about 30 columns in each would risk breaking the job state machine for no measurable gain.

## Not done, and why

- **Real thumbnails.** The feed still downloads the full photo to show a 34 px thumbnail. Supabase image transformation needs a paid plan, and the job photos are uploaded by the customer app (Shariq's). **Message for Shariq:** the customer app should compress with the same limits (photos 1280 px at 0.6, voice 16 kHz mono 32 kbps) and upload a second 320 px copy for the feed.
- **Backend clean-up of job media** after a job closes or expires (asks first).
- **Unused index review** on hosted DEV: traffic is too low to tell. Re-check with `pg_stat_user_indexes` once real users exist.

## Before shipping

1. User approves `supabase db push --linked` (0027, 0028, 0029). Order matters: database first, then the app.
2. Phone test: skeletons on slow network, scroll the feed to the end ("Show more"), voice intro record and play back, profile photo upload, bill photo legibility at 1280 px, My Jobs tabs.
3. Commit and push to `dev` only when the user says so.
