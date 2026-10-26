# Product Requirements Document (MVP 1)

Version 2.0, updated 27 October 2026. Replaces v1.1: the job model changed from **claim-lock** to **competing quotes** (confirmed with Shariq Bhai and the UI designs, see [DECISIONS.md](DECISIONS.md)). Detailed database and API rules are in [DB-API-DESIGN.md](DB-API-DESIGN.md). Items marked **Pending** are not yet confirmed.

## 1. Overview

DHA Works is a home-services marketplace for DHA residents. A verified resident posts a job. Approved workers in that category and area mark interest and send quotes. The resident compares the quotes and accepts one. The work is done and paid in cash.

Three parts: **DHA Works** (resident app), **DHA Works - Worker** (worker app), **DHA admin portal** (web).

**Build order (Shariq Bhai, 25 Oct):** database and mobile APIs first, then the two mobile apps, then the admin portal. APIs are for the mobile apps only for now.

**Design status:** all three UIs are designed (55 screens) and live in `DHA-Works-UI/` (see [UI-UX.md](UI-UX.md)). Some designs need changes listed in section 14.

**Stack:** Expo (React Native) + TypeScript for both apps, Next.js for admin, Supabase (Postgres, Auth, Storage, Realtime) on the **free tier for now**, Vercel, EAS Build. Android first.

## 2. Problem, goals and metrics

See [IDEA.md](IDEA.md).

**MVP 1 goals**

1. A resident posts a job and receives quotes from verified workers within 24 hours.
2. Every worker and every resident is manually verified by DHA staff.
3. The job, its quotes and its status history sit in one place for dispute resolution.
4. A stable Android release first, then iOS.

## 3. Roles

A person's role is set by the system and cannot be changed from the app.

| Role | Who | App | Can do |
| --- | --- | --- | --- |
| Resident | DHA resident | DHA Works | Sign in (email or Google), complete onboarding (CNIC, address, utility bill), wait for approval, post jobs (category, description, photos, optional voice note, time), compare and accept or reject quotes, confirm cash, rate the worker, report a problem |
| Worker | Plumber, electrician, AC technician etc. | DHA Works - Worker | Register (CNIC, police certificate or references, photo, trades, experience, visit fee, voice introduction), wait for approval, choose DHA phases 1 to 8, see matching jobs, mark interest, send quotes, start and finish jobs, record cash, report a problem |
| DHA Admin | DHA staff | Web portal | Approve, ask for changes, send to HQ or reject residents and workers; manage reports; cancel jobs; suspend and reinstate; manage categories, phases, helpline and report window; view the audit trail |

**Rules for every role**

- Sign-in is email or Google; phone OTP comes later.
- Residents and workers are separate accounts (one email, one role).
- A resident or worker who is not Approved cannot post, quote or see the job feed.
- Staff accounts are created by invitation only.

## 4. Scope

| Area | MVP 1 | MVP 2 or later |
| --- | --- | --- |
| Accounts | Email and Google; resident and worker onboarding with documents | Phone OTP |
| Matching | Category plus DHA phase 1 to 8 (no GPS, no distance filter) | Distance matching, ranking |
| Jobs | Post (draft, photos, voice note), interest, quotes, accept, schedule, work, cash, review | Booking a specific worker, recurring jobs |
| Quotes | Itemised (labour, materials, other), visit window, immutable once sent | **Quote revisions (MVP 2)** |
| Payment | Cash only; both sides record the amount | Online payment, wallet, commission |
| Verification | Manual by DHA staff for workers and residents | Automated checks |
| Communication | Phone calls between the two parties after acceptance | In-app chat |
| Safety | Report a problem, "I feel unsafe", helpline 1092 | Helpline log, live support |
| Admin | Verification queues, reports, jobs, users, settings | Dashboard stats, all-reviews screen |
| Platforms | Android first, iOS via EAS | Customer web app |
| Language | English first; all text through a translation file | Urdu |

**Out of scope:** online payments, GPS tracking, distance filter, in-app chat, in-app calling, quote revisions, direct booking, commission, manual job assignment by staff, multi-city.

## 5. Job lifecycle

Statuses (stored): `draft`, `open`, `interested`, `quoted`, `accepted` (unused for now), `scheduled`, `in_progress`, `completed`, `cash_collected`, `reviewed`. Side states: `disputed`, `cancelled`, `expired`. Only the system changes status, after checking who is acting.

| # | Stage | Who moves it | What happens |
| --- | --- | --- | --- |
| 0 | Draft | Resident | Saved privately; no notifications; does not expire |
| 1 | Open | Resident posts | Visible to approved workers matching category and phase. The **24-hour clock** starts |
| 2 | Interested | Worker | At least one worker marked interest |
| 3 | Quoted | Worker | At least one live quote |
| 4 | Scheduled | Resident accepts a quote | One quote accepted; every other quote becomes "not selected"; visit window comes from the quote |
| 5 | In progress | Worker starts | Work under way; reports possible |
| 6 | Completed | Worker | Worker states the job is finished |
| 7 | Cash collected | Both sides | Each side records the amount paid; equal amounts close the job |
| 8 | Reviewed | Resident | Rates the worker |

**Rules**

1. **No lock.** Many workers can be interested and quote. Accepting a quote is one atomic action: that quote is accepted, the others are not selected, and the job is Scheduled. It can only happen once.
2. **24-hour expiry.** An open job nobody accepts within 24 hours becomes `expired`; its quotes expire; the resident can **repost** with one tap. Accepted jobs never expire.
3. **Rejected quote.** The resident can reject a quote with a reason. That worker cannot quote the same job again. Other workers still can.
4. **Quotes are final once sent.** Withdrawing is allowed before acceptance. Quote revisions are MVP 2.
5. **Visibility.** Before acceptance a worker sees only the phase and lane. The resident's phone number and plot number appear **only after** the resident accepts that worker's quote (Shariq, 26 Oct). Residents see worker phone numbers only after accepting.
6. **Cancellation.** A resident can cancel before accepting. After acceptance neither side cancels directly: the resident or worker submits a cancellation request with a reason and staff decide. Staff can also cancel any non-final job with a reason (separate audited action). The request is separate from the job's status (the job stays active, with a "cancellation requested" banner, until staff decide). Every cancellation records reason, requester, time and decision (proposed default, confirm with Shariq).
7. **Every change** is recorded (who, when, previous status) and shown as a timeline.
8. **Stuck jobs** are flagged, not cancelled: Scheduled and not started 24 hours after the start time; In progress for 48 hours; Completed with cash not recorded by both sides for 48 hours. Both parties and staff are notified and staff resolve it. Open jobs are never stuck, they expire. An automated call comes later.

## 6. Quotation rules

1. **Itemised.** Labour, materials (with a materials note), other (with a required reason), visit day and a 2-hour window, optional note. The server adds the total; it is never typed.
2. **Cash.** The total is paid in cash after the work.
3. **One live quote per worker per job.** A sent quote cannot be edited.
4. **Accept** moves the job to Scheduled.
5. **Reject** needs a reason; that worker cannot quote the job again.
6. **Not selected.** When one quote is accepted, other workers are told they were not selected.
7. **Price differs on the day.** In MVP 1 the worker records the different cash amount with a reason (see section 7); formal revisions arrive in MVP 2 (max 2, resident approves, extra work only after start; rules drafted in [DB-API-DESIGN.md](DB-API-DESIGN.md)).

## 7. Cash

1. After the worker marks the job completed, the worker and the resident each enter the amount paid, in either order.
2. If both amounts are equal the job becomes Cash collected, even if it differs from the quote. The difference is recorded for staff.
3. If they differ, the job becomes **Disputed** and a report is created for staff. It never closes automatically.
4. A submitted amount cannot be edited. Corrections go through staff dispute resolution.
5. Matching entries show both sides agree on the reported payment; they do not prove it happened.

## 8. Verification

No worker or resident can use the app fully until DHA staff review their documents by hand.

**Workers:** name, mobile, gender, date of birth, CNIC (number and front and back photos), **police character certificate** (issued by Karachi police within 12 months) or **2 references from DHA residents**, profile photo, trades (several allowed), experience, visit fee, optional voice introduction.

**Residents:** name, email, phone, date of birth, gender, CNIC photos, DHA phase, lane, plot, floor, a recent utility bill (under 3 months) matching the address.

**Decisions:** Approve, **Ask for changes** (resident) or **Visit HQ** (worker must come to the DHA office), or Reject, always with a reason shown to the person. After approval a worker chooses DHA phases 1 to 8.

**Ongoing:** staff can suspend and reinstate. Suspended users are blocked everywhere. If a worker with an active job is suspended, the job is flagged "under review: worker suspended", the resident and staff are notified, and staff decide to resume, replace or cancel; nothing is cancelled automatically (proposed default).

Requirements: documents private and visible only to the owner and staff; every decision audited; the user is notified of each decision; residents see a Verified badge on workers.

**Retention: configurable, pending legal review.** No fixed period is committed; access to identity documents is restricted to the owner and staff; a documented deletion policy is required before launch. Renewal of worker documents **Pending**.

## 9. Reports and safety

Both apps have **Report a problem** and **I feel unsafe**, and a **Call helpline** button that stays hidden until DHA confirms the helpline number (currently unverified).

- A report can be filed by the job's resident or accepted worker, from **Scheduled** until **7 days after completion** (a staff setting). After that, new reports are blocked; existing reports stay open for staff.
- Reasons: unsafe, no-show, poor or incomplete work, extra cash or price, rude behaviour or damage, other. Optional photos.
- An **unsafe** report alerts staff at the top of their queue and shows both phone numbers for a call-back, with call tracking.
- Outcomes: **no action, warning, suspend**, with a reason. Staff can also **cancel a job** (separate audited action). **No refunds**: payment is cash and off-platform.
- All actions are audited.

## 10. Reviews and ratings

- Three criteria: behaviour, completeness, quality; 1 to 5 stars each; "Hire again?" yes or no; optional comment.
- Only the resident of a job with Cash collected, once per job, within 7 days after completion.
- **Anonymous to the worker.** The worker sees only their own average rating and jobs done.
- Admin sees reviews in the user's detail page.
- Reviews cannot be edited. Staff can hide a rule-breaking review (audited).

**Top rated** = at least 10 completed jobs and an average of 4.5 or higher; the review count is always shown. **Pending:** whether workers may rate residents (not in MVP 1).

## 11. Functional requirements

See [FEATURES.md](FEATURES.md).

## 12. Notifications

In-app and push (Expo). Stored so nothing is lost if push fails.

| Event | To |
| --- | --- |
| New open job matching category and phase | Approved workers |
| Worker marked interest, quote received | Resident |
| Quote accepted / not selected / rejected | Worker |
| Job expiring (20 hours) / expired | Resident (and workers who quoted) |
| Job scheduled reminder, started, completed | Other party |
| Cash recorded, amount mismatch | Other party and staff |
| Rating reminder; rating received (average updated) | Resident; worker |
| Account approved, needs changes, visit HQ, rejected, suspended | The user |
| Report received, updated, resolved; unsafe alert | Both parties; staff |

## 13. Non-functional requirements

- **Security:** RLS on all data; role stored server-side; private storage with signed URLs; status changes only through server functions; no secrets in apps. See [SECURITY.md](SECURITY.md).
- **Privacy:** identity documents and voice recordings visible only to the owner and staff; contact details released only after acceptance; retention is configurable and pending legal review (see section 8).
- **Reliability:** atomic quote acceptance proven by a concurrency test; append-only audit log; staging before production.
- **Free tier:** about 1 GB storage (compress photos and voice clips), projects pause when idle, no point-in-time backups, so we create our own (daily dump plus storage copy, encrypted, restore-tested). Fine for development and a small pilot; upgrade once funded.
- **Performance:** lists under 2 seconds on a typical mobile connection; photo compression.
- **Usability:** simple English; large tap targets; the approved designs.
- **Quality:** pgTAP tests for permissions and every transition, unit tests for shared logic, end-to-end tests for the main flow. See [TESTING.md](TESTING.md).

## 14. Design changes needed (from decisions after the designs were made)

- Remove "Call, then quote" and any Call buttons shown before acceptance (W06, W07, W08, status screens).
- Reword the reject-quote copy (C12): the worker cannot send a new quote.
- Categories: customer Home gets Welding & Ironwork and General Handyman (replacing "Others"); worker category pickers become multi-select; admin Settings lists all eight.
- Remove the distance sheet, km labels and "Nearest" sort on Open jobs (W07).
- Booking a specific worker (C06 to C09, W09), "Saved workers" and quote revision screens are not part of MVP 1.
- **New screens needed:** Request cancellation and its status banner in both apps (C22, W18).
- Helpline buttons and FAQ lines naming 1092 stay hidden until DHA confirms the number.

## 15. Milestones

See [ROADMAP.md](ROADMAP.md). Glossary in [GLOSSARY.md](GLOSSARY.md).
