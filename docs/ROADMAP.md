# Roadmap

Build order agreed with Shariq Bhai (25 Oct 2026): **database and mobile APIs first, then the mobile apps, then the admin portal.** Supabase on the free tier for now.

## Milestones

| # | Milestone | Result |
| --- | --- | --- |
| M0 | Backend scaffold | `supabase/` project with local stack (Docker), migrations folder, seed, CI; `packages/shared` for types and Zod schemas. The full monorepo and apps follow later. |
| M1 | Database | Enums, identity and verification tables, catalogue and settings (8 categories, phases 1 to 8, helpline, report window), jobs, interests, quotes, cash, reviews, reports, notifications, audit log; RLS; state-transition RPCs; accept-quote race safe; 24-hour expiry job; pgTAP tests |
| M2 | Mobile APIs | RPC and read contract per screen ([DB-API-DESIGN.md](DB-API-DESIGN.md)), generated types, an API test pass with test accounts and a seed script that approves workers and residents (no admin portal yet) |
| M3 | Apps scaffold and auth | Expo resident and worker apps, sign-in (email, Google), onboarding and document upload, pending-review screens |
| M4 | Resident app | Post job (draft, photos, voice note), My jobs, compare and accept quotes, cash confirmation, rating, report, notifications |
| M5 | Worker app | Areas and categories, open jobs, interest, create quote, start and finish, record cash, report, notifications |
| M6 | Notifications | Push via Expo Edge Function and in-app |
| M7 | Admin portal | Worker and resident queues, reports, jobs, users, settings, audit trail (admin RPCs: decisions, suspend, resolve report, cancel job, resolve cash dispute) |
| M8 | Release | Free-tier limits checked (storage, auth email), upgrade plan, staging run, Play Store submission |

The accept-quote transaction, the RLS rules and the cash rules carry the most risk, so they are built and tested first.

## Before M0 can start

- [x] Supabase on the free tier approved (Shariq, 25 Oct)
- [x] Build order approved (DB and APIs, then mobile apps, then admin)
- [x] UI designs delivered (`DHA-Works-UI/`)
- [x] Product rules decided (see [DECISIONS.md](DECISIONS.md))
- [ ] Remaining questions: see [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) (none block the first migrations)
- [ ] Permission to create the hosted Supabase project and the `supabase/` folder
- [ ] Docker Desktop and Node.js installed and checked
- [ ] Test device chosen (real Android phone with Expo Go suggested)
- [ ] Custom SMTP provider for auth email (free tier email is heavily rate limited)
- [ ] Own backup job set up and a restore tested (daily database dump plus storage copy, encrypted, kept outside Supabase) before any real resident or worker data

## MVP 2 (planned)

Quote revisions (max 2, resident approves, extra work only after start; rules drafted in [DB-API-DESIGN.md](DB-API-DESIGN.md) item 14).

## After the MVP

Phone OTP, online payments and wallet, commission and payouts, booking a specific worker, in-app chat, distance matching, helpline log, dashboard, all-reviews screen, automated document checks, recurring or urgent jobs, analytics, GPS tracking, Urdu, iOS (needs an Apple developer account and a build route without a Mac, EAS), customer web app, multi-city, automated stuck-job calls.

## Definition of done for the MVP

A real resident and a real worker finish one job end to end (post, quotes, accept, work, cash, review), and DHA staff resolve a report, with no blocking bugs in the pilot.
