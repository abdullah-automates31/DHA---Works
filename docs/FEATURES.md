# Features

IDs match the screens in `DHA-Works-UI/` (C = resident app, W = worker app, A = admin portal). "MVP 1" is the first version; "MVP 2" and "Later" are parked. Rules are in [PRD.md](PRD.md).

## Resident app (DHA Works)

| ID | Feature | Detail | Scope |
| --- | --- | --- | --- |
| C01 | Welcome and sign in | Email or Google | MVP 1 |
| C02, C03 | Onboarding | Personal details; DHA phase, lane, plot, floor; CNIC photos; utility bill | MVP 1 |
| C04 | Pending review | Shown while staff check CNIC and bill | MVP 1 |
| C05 | Home | Categories (8) with nearby counts, search, Emergency now, your jobs | MVP 1 |
| C10 | Post a job | Description, voice note, category, address, time (ASAP or window), up to 6 photos, save draft | MVP 1 |
| C11 | My jobs | Active, Completed, All; stage, quote count, lowest quote, edit or cancel while open, repost when expired | MVP 1 |
| C19 | Compare quotes | Sort by lowest price, top rated, soonest | MVP 1 |
| C12 | Quote detail | Labour, materials, other, total; accept or reject with a reason | MVP 1 |
| C13 | Job status timeline | Posted through Cash paid and review | MVP 1 |
| C20 | Confirm cash paid | Same as quote, or a different amount | MVP 1 |
| C15 | Rate the worker | Behaviour, completeness, quality, hire again, comment; anonymous | MVP 1 |
| C14 | Report a problem | Includes "I feel unsafe" and helpline | MVP 1 |
| C16 | Notifications | Quotes, schedule, status, verification | MVP 1 |
| C17 | Profile | Details, addresses, CNIC and bill status | MVP 1 |
| C21 | Help and support | FAQ; helpline shown only once DHA confirms the number | MVP 1 |
| C22 | Request cancellation | After acceptance; reason, details, status banner; staff decide (new, to design) | MVP 1 |
| C06 to C09 | Worker list, worker profile, book a specific worker, request status | | Later |

## Worker app (DHA Works - Worker)

| ID | Feature | Detail | Scope |
| --- | --- | --- | --- |
| W01 | Sign in | Email | MVP 1 |
| W02, W03, W03b | Onboarding | About you; documents (CNIC, police certificate or references, photo); your work (trades, experience, visit fee, voice introduction) | MVP 1 |
| W04 | Application under review | Approved, Visit HQ or rejected | MVP 1 |
| W05 | Choose your areas | DHA phases 1 to 8 | MVP 1 |
| W06 | Home | New jobs count, today's jobs | MVP 1 |
| W07 | Open jobs | Matching category and phase; newest and urgent first | MVP 1 |
| W08 | Job detail | Photos, description, voice note, how many others are interested; "I will quote this job" | MVP 1 |
| W10 | Create quote | Labour, materials, other with reason, visit day and window | MVP 1 |
| W11 | My jobs | Active, Completed, All | MVP 1 |
| W12 | Job status | Start job, mark complete | MVP 1 |
| W13 | Record cash collected | Full amount, or a different amount with a reason | MVP 1 |
| W14 | Report a problem | Includes "I feel unsafe" and helpline | MVP 1 |
| W15 | Notifications | Includes "Quote not selected" | MVP 1 |
| W16 | Profile | Categories (several), areas, availability, own rating, cash this week | MVP 1 |
| W17 | Help and support | FAQ; helpline shown only once DHA confirms the number | MVP 1 |
| W18 | Request cancellation | After acceptance; reason, details, status banner; staff decide (new, to design) | MVP 1 |
| W09 | Direct requests | Booking a specific worker | Later |
| | Quote revisions | Request a revision, resident approves | MVP 2 |

## Admin portal (web)

| ID | Feature | Detail | Scope |
| --- | --- | --- | --- |
| A01 | Staff sign-in | Email and password; staff only | MVP 1 |
| A03, A04 | Worker queue and review | Documents, voice introduction, checklist; approve, visit HQ, reject | MVP 1 |
| A05, A06 | Resident queue and review | CNIC, bill, address match; approve, ask for changes, reject | MVP 1 |
| A07, A08 | Reports and case detail | Unsafe cases first, both phone numbers, call tracking, status, action | MVP 1 |
| A10, A11 | Jobs list and detail | Timeline, quote, cash record; cancel with a reason; decide cancellation requests | MVP 1 |
| A12, A13 | Users and user detail | Suspend and reactivate; reviews tab | MVP 1 |
| A14 | Settings | Categories, phases, helpline number, report window, admin accounts | MVP 1 |
| A02, A09, A15 | Dashboard, helpline log, all-reviews screen | | Later |
| | Audit trail | Staff actions and status changes | MVP 1 |

## Platform features (behind the scenes)

- **Job state machine.** A job can only move through valid steps; only the system changes status.
- **Atomic quote acceptance.** Accepting one quote rejects the rest in one transaction, once only.
- **24-hour expiry** of open jobs (hourly sweep), with repost.
- **Server-calculated quote totals.** The total cannot be tampered with.
- **Cash cross-check.** Both sides record the amount; mismatches become disputes.
- **Contact release.** Phone and plot number are shown only after acceptance.
- **Notifications.** In-app and push (Expo); stored so nothing is lost if push fails.
- **Audit log.** Append-only; nobody can edit or delete rows.

## Service categories

Plumbing, Electrical, AC & Refrigeration, Carpentry, Painting, Cleaning, Welding & Ironwork, General Handyman. Stored in the database; admins enable or disable them.

## Explicitly later

Phone OTP sign-in, distance-based matching, booking a specific worker, chat, quote revisions (MVP 2), recurring or urgent jobs, online payment and commission, automated document checks, Urdu, GPS tracking, worker calendars, in-app calling, multi-city, iOS, customer web app.
