# Open Questions

Updated 27 Oct 2026. From this date the builder (Abdullah) decides the remaining product and technical defaults; Shariq Bhai's confirmation is no longer required unless a row below says so. Every decision is in [DECISIONS.md](DECISIONS.md) and [DB-API-DESIGN.md](DB-API-DESIGN.md) section 9.

## Still unresolved

| # | Question | Current stance |
| --- | --- | --- |
| 1 | Workers rating residents | Not in MVP 1 (resident to worker only, anonymous). Revisit in MVP 2. |
| 2 | Retention period for identity documents and other records | Configurable, none committed, pending legal review. Access restricted to owner and staff. |
| 3 | Privacy policy and terms | Needs legal review before public launch (identity documents, verification, disputes, liability, personal data). |
| 4 | Helpline 1092 | Reported to be the DHA security helpline (not verified by us). Hidden behind `helpline_enabled = false` until DHA approves presenting it as the DHA Works support line. Wording and FAQ answers also need approval. |
| 5 | Phone OTP | Later. MVP 1 uses email and Google, as in the designs. Channel (SMS or WhatsApp) and cost to be chosen before it is built. |
| 6 | Store accounts | Provisional names DHA Works and DHA Works - Worker. Google Play account (one-time fee, account holder 18 or older); DHA should own the publisher account. Apple account later (no Mac available). |
| 7 | Real-data readiness | Own backup job and a tested restore before any real resident or worker data (see SECURITY.md). Free tier and fake data until then. |

## Design work still to do

- New screens: Request cancellation (C22 resident, W18 worker) and the "cancellation requested, under review" banner.
- Screen corrections listed in [UI-UX.md](UI-UX.md) section 8: remove "Call, then quote" and the km filter, fix categories and multi-select, reword the reject-quote copy, add expired and Repost, add cash "waiting for confirmation" and "disputed" states, hide helpline buttons until enabled.
- Shariq cannot yet edit or comment on the design artifacts (the owner must re-invite him as Editor).
- Sign-in code screen (worker, built 29 Oct): the designs show only W01 (email). Email OTP needs a second step to type the 6-digit code; it was built with the W01 frame and controls, wording is ours. A matching design is needed (customer app too). Also confirm: a worker who signs in with an email that already belongs to a customer account (accounts are separate).
- Worker About you (W02, built 29 Oct), assumptions to confirm: (1) phone stored as +92 and 10 digits (3XX XXXXXXX); (2) **minimum age**: none enforced, only a real past date from 1900; Shariq to confirm the policy; (3) gender is required and limited to Male or Female as designed (the database also allows "other"); (4) all five fields are required before moving on. Design gaps: no back target on step 1 (the button is hidden there), no sign-out control (a small "Not you? Sign out" link was added), no Review step 4 screen.
- Temporary screens with our own wording until designed: "Documents come next" (W03), "You are approved" (W05), under review, Visit HQ, rejected, suspended, and "This is not a worker account" (a customer or staff email used in the worker app). W04 exists in the designs for pending but is not built yet. Confirm what Visit HQ and rejected should show, and whether a suspended worker should see a reason.
- Backend proposal (not applied): lock name, gender, date of birth and CNIC while an application is pending, visit_hq or rejected, not only after approval; see supabase/proposals/.
- Worker documents (W03, built 29 Oct), design gaps filled with our own UI, to confirm: (1) a small menu "Take photo / Choose from library" (and "Choose a PDF" for the certificate); (2) the 2 references form (name, mobile, address for each; set_my_references) behind a text link "Add 2 references instead", since the design only mentions the option; (3) the profile picture shows initials until a photo exists and the button reads "Add" then "Change"; (4) "Next: your work" checks the same requirements as submit_for_review and lists what is missing. Files: images are resized to 1600 px and saved as JPEG (quality 0.7, location data dropped), PDFs only for the certificate, 5 MB limit.
- Identity files cannot be replaced or deleted by the worker today (storage rules, 0012): each replacement leaves an orphaned CNIC or certificate image in the private bucket. Proposal supabase/proposals/20261029000019_identity_owner_delete.sql lets the owner delete (and, as Postgres requires, read) their own identity files while the application is editable. Needs a privacy decision; files already orphaned and unreferenced files need a separate clean-up.
- Worker Your work (W03b) and Under review (W04), built 29 Oct, assumptions to confirm: (1) trades come from the database (8 categories with their database names), not the 5 pills in the design; (2) experience (0 to 70 years) and visit fee (whole rupees, up to 7 digits) are optional, a blank fee stays 0 = no visit fee; (3) the voice card is designed only for the recording state, we added idle (microphone button) and saved (play, record again) states, a recording stops at 30 s and under 1 s is discarded, no minimum length is enforced although a schema comment says "14 to 30 s"; (4) the W04 helpline card is shown only when app_settings.helpline_enabled is true and a number is set (off until DHA approves); (5) the "Sign out" link on the under-review screen is ours.
- Backend gap found while testing W03b (not changed): set_my_categories and update_worker_details have no status check, so a worker whose application is pending, visit_hq or rejected can still change trades, experience, fee and the voice introduction that staff are reviewing. Same class as the identity-lock proposal; decide whether to extend supabase/proposals/20261029000018 to these. After approval, editing trades from the profile may be intended.
- Worker Areas (W05) and Home (W06), built 29 Oct, differences from the mock to confirm: (1) the tab bar has 4 tabs (Home, Open jobs, My jobs, Profile): the Requests tab is gone with direct requests; (2) a resident name appears on a job card only after that worker's quote was accepted (shortened, "Hira F."), otherwise only "Phase 6, Lane 7"; "Call, then quote" is removed; (3) "Today" lists jobs scheduled today or in progress that this worker won, not interested or quoted jobs (they belong in My jobs); (4) the 9-segment progress bar on a job card is not built because what each segment means is not defined; (5) job cards are not tappable until the job status screen (W12) exists; (6) the banner reads "N new jobs near you" for jobs in the worker's trades and phases (no distance); (7) the bell shows its dot when there are unread notifications and opens a placeholder; (8) an empty-day message ("No jobs scheduled for today.") is ours; (9) areas can be changed later from a "Change my areas" button on the placeholder Profile tab.
- Worker Open jobs (W07), built 29 Oct, differences from the mock to confirm: (1) the "Newest / Nearest" switch, the "Within 3 km" distance sheet and the km labels are not built (distance is out of the MVP, docs/UI-UX.md section 8); the order is fixed: ASAP jobs first, then newest first (FEATURES: "newest and urgent first"); (2) the subtitle lists the worker's own trades and phases ("Plumbing jobs in Phase 5, 6 and 7"); (3) the red Urgent chip and "As soon as possible" pill mark ASAP jobs, every other job shows an "Open" chip and its date and time window; "today" is added when an ASAP job was posted today; (4) the small squares are the first two real job photos (signed thumbnails), a "Voice note" chip shows when the job has one, nothing else is shown about the resident; (5) category icons for categories other than plumbing are our own simple drawings; (6) empty ("No open jobs right now") and error (with Retry) states are our wording, pull down refreshes and the list reloads when the tab is shown; (7) the arrow opens a temporary job screen until W08 exists; (8) the feed shows at most 50 jobs, no paging yet.
- The MVP Plan Google Doc is out of date.

## Technical setup (before M0)

- Node.js 22 and the Supabase CLI are installed. **Docker Desktop is installed but not running**; start it before `supabase start`. `pnpm` is not installed yet (needed when the monorepo is created).
- Create the local `supabase/` folder and a separate hosted development project (test data only; nothing deployed until the design is reviewed).
- Expo Go for early UI testing on an Android phone (an iPhone also works for early tests); a development build later if native features need it.
- Custom SMTP for auth email (Resend or similar) before relying on auth emails beyond basic development tests.
- Stuck-job and other thresholds are settings, not code.

## Decided, kept here for reference

Competing quotes model, 24-hour expiry with repost, accept goes straight to Scheduled, no re-quote after a rejected quote, contact details only after acceptance, several categories per worker (eight total), voice notes in MVP 1, no distance filter, no chat, draft jobs, cash rules, report window and outcomes, cancellation requests after acceptance, stuck-job flags, quote revisions in MVP 2, commission 0%, own backups. Details: [DECISIONS.md](DECISIONS.md).

## From Shariq's 27 Oct feedback (assumed in migration 0013, to confirm)

- Pending: is the material bill required on every job, or only when the quote has materials? Built: only when materials are above 0.
- Pending: "rated below 3" is built as the mean of the three scores being below 3.
- Pending: with a price difference the job closes as `cash_collected` and both amounts are kept for staff. Built that way.
- Pending: "v2 need expiry" is not understood (quote expiry?). Nothing built.
- UI only, no backend change: customer status-variation screen; C13 shows cash collected by the worker with a single "Review pending" view; remove W11 action buttons; remove the Direct requests screen.
