# User Flows

Screen numbers (C05, W07, A03 and so on) refer to `DHA-Works-UI/`. Rules are in [PRD.md](PRD.md); technical detail in [DB-API-DESIGN.md](DB-API-DESIGN.md).

## 1. Resident: first use (C01 to C04)

1. Open the app, sign in with email or Google.
2. **About you:** full name, email, phone, date of birth, gender, CNIC number.
3. **Your home:** DHA phase 1 to 8, lane, plot or bungalow, floor; CNIC photos (front and back); a recent utility bill (electricity or gas, under 3 months).
4. **Pending review:** DHA staff check the CNIC and bill (usually under 24 hours). The resident is notified. They can browse but cannot post until approved.
5. If staff **ask for changes**, the resident corrects and resubmits.

## 2. Resident: post a job and choose a worker (C05, C10, C11, C19, C12, C13, C20, C15)

1. **Post a job:** describe the problem (up to 1000 characters), optionally record a voice note, pick the category and address, choose "As soon as possible" or a day and time window, add up to 6 photos. **Save draft** keeps it private; **Post job** publishes it.
2. The job is **Open** for **24 hours**. Matching workers are notified.
3. Workers mark interest and send quotes. **My jobs** shows how many workers viewed it and how many quoted.
4. **Compare quotes** (C19): sort by lowest price, top rated or soonest. Open a quote (C12) to see the breakdown: labour, materials, other.
5. **Accept** one quote. The job is **Scheduled**; the other workers are told they were not selected. Or **Reject** a quote with a reason (that worker cannot quote this job again).
6. The resident and worker now see each other's phone number and the full address, and call each other to arrange the visit.
7. If nobody is accepted within 24 hours the job **expires**; the resident can **Repost** with one tap.
8. After the work, **Confirm cash paid** (C20): same as the quote, or a different amount.
9. **Rate the worker** (C15): behaviour, completeness, quality, hire again, optional comment. The rating is anonymous.

## 3. Worker: sign-up to first job (W01 to W08, W10)

1. Sign in with email, then **About you** (name, mobile, date of birth, gender, CNIC number).
2. **Documents:** CNIC photos, police certificate (or 2 references from DHA residents), profile photo.
3. **Your work:** trades (several), experience, visit fee, optional voice introduction. Submit.
4. **Application under review** (usually under 24 hours). Outcomes: approved, **Visit HQ**, or rejected, with a reason.
5. After approval, **choose your areas** (DHA phases 1 to 8) and start receiving jobs.
6. **Open jobs** shows matching jobs (category and phase), newest and urgent first. Open a job to see photos, description, voice note and how many others are interested.
7. Tap **I will quote this job**, then **Create quote**: labour, materials (with a list), other (with a reason), visit day and a 2-hour window. A sent quote cannot be edited.
8. If accepted, the phone number and address are revealed. At the visit, **Start job**; when finished, **Mark complete**.
9. **Record cash collected** (full amount, or a different amount with a reason).
10. If another worker was chosen, the worker gets "Quote not selected" and finds more jobs.

## 4. Cash and disputes

1. Worker and resident each enter the amount paid, in either order, and cannot edit it afterwards.
2. Equal amounts: the job becomes **Cash collected**; any difference from the quote is recorded.
3. Different amounts: the job becomes **Disputed** and a cash report is sent to staff.

## 5. Report a problem or an unsafe situation (C14, W14)

1. Available from **Scheduled** until 7 days after completion (a staff setting).
2. **I feel unsafe** and **Call 1092** are shown first. Otherwise pick a reason, describe, add photos, send.
3. Unsafe reports appear at the top of the admin queue with both phone numbers for an immediate call-back.
4. Staff record **no action**, **warning** or **suspend**, with a reason. Staff can also cancel the job as a separate action.

## 6. Staff: verify a worker or resident (A03 to A06)

1. Open the **Worker queue** or **Resident queue**, sorted by waiting time.
2. Open the application: details, documents (zoomable), voice introduction, checklist; for residents, check the address against the bill.
3. Decide: **Approve** (all checklist items ticked), **Visit HQ** (workers) or **Ask for changes** (residents), or **Reject**. A reason is shown to the applicant.
4. Everything is written to the audit trail.

## 7. Staff: reports and jobs (A07 to A13)

1. **Reports** list unsafe cases first. Open a case to see the reporter, the other party, the job, the message and photos.
2. Call tracking records who was called and when. Set the case status (new, in review, resolved) and record the action.
3. **Jobs** lists every job by status; open one for its timeline, quote, cash record and reports. Staff can cancel a job with a reason.
4. **Users** lists workers and residents; staff can suspend or reactivate and read a worker's reviews.

## 8. Cancellation

- Resident: can cancel before accepting a quote.
- Worker: can withdraw interest or a quote before acceptance.
- After acceptance: the resident or worker submits a **cancellation request** (below); staff decide. Staff can also cancel directly. No penalty policy in MVP 1.

### Request cancellation (both apps, proposed)

1. Open an accepted, scheduled or in-progress job and tap **Request cancellation**.
2. Pick a reason and optionally add details.
3. The job stays active and shows **Cancellation requested, under review**. The other party and DHA staff are notified. The requester can withdraw the request until staff decide.
4. Staff review and record a decision. Approved: the job is cancelled. Declined: the job stays active. The decision and reason appear in the job history.
5. For work already in progress the screen says the request does not stop the work or settle any payment dispute; in a safety concern, use **I feel unsafe**.
- System: open jobs expire after 24 hours.

## Not in MVP 1

Booking a specific worker, chat, quote revisions (MVP 2), distance filter, helpline log, dashboard.
