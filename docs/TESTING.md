# Testing Strategy

CI runs lint, type check and tests on every change. The database comes first (build order: DB and APIs, then mobile apps, then admin), so database tests carry the early weight.

## Layers

| Layer | Tool | What it covers |
| --- | --- | --- |
| Database | **pgTAP** | RLS rules, every state transition, accept-quote race, expiry sweep, cash rules |
| Shared logic | **Vitest** | Validation (Zod), quote totals, money helpers |
| Mobile UI | **Jest + React Native Testing Library** | Key screens and forms |
| Admin web | **Playwright** | Approve a worker, resolve a report |
| End to end (mobile) | **Maestro** | Post job, interest, quote, accept, complete, cash, rate |

## Must-have tests (highest value first)

1. **RLS matrix.** For each table: a resident, a worker, an unapproved or suspended user and an unrelated user cannot read or write what they should not. Includes: a worker cannot see competitors' quotes; a worker cannot read reviews; plot number and phone are hidden until acceptance.
2. **Accept-quote race.** Two accepts at the same moment (or two quotes accepted on one job): exactly one succeeds; the others become "not selected".
3. **State machine.** Every legal transition works; every illegal one is rejected (for example Completed before Scheduled, accepting an expired or cancelled job).
4. **Quote integrity.** Total is computed on the server from labour, materials and other; a tampered total is rejected; "other" needs a reason; a sent quote cannot be edited; one live quote per worker per job.
5. **No re-quote.** A worker whose quote was rejected cannot quote the same job again; other workers can.
6. **Expiry.** An open job older than 24 hours with no accepted quote becomes expired, its quotes expire and both sides are notified; accepted jobs do not expire; a draft never expires; repost copies the job.
7. **Cash rules.** Either side can record first; amounts are write-once; equal amounts close the job and store the difference from the quote; unequal amounts still close the job as Cash collected with `matched = false` (no dispute, no report).
8. **Reports window.** Allowed from Scheduled until the setting's days after completion; blocked before and after; staff can still update existing reports.
9. **Verification gating.** Pending, needs-changes, rejected and suspended users cannot post, quote or see the feed.
10. **Storage access.** Another user's CNIC link cannot be opened; signed URLs expire.
11. **Audit log.** Cannot be updated or deleted by any role.
12. **Review rule.** One review per job, only by that job's resident, only after Cash collected.

## Manual checks before each release

- Supabase security advisor: zero warnings.
- Abuse attempts: guess job IDs, post a job in another phase, read another user's document, request a phone number before acceptance.
- Realistic device: a low-end Android phone on a slow connection; image and voice compression under the free-tier storage limit.
- Staging full run through the key flow with test accounts.

## Pilot

Small pilot with real DHA residents and workers once staging is clean: seed data, no blocking bugs. The free Supabase tier has no real backups, so use test data only until the upgrade.
