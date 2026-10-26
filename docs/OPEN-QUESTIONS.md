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
- The MVP Plan Google Doc is out of date.

## Technical setup (before M0)

- Node.js 22 and the Supabase CLI are installed. **Docker Desktop is installed but not running**; start it before `supabase start`. `pnpm` is not installed yet (needed when the monorepo is created).
- Create the local `supabase/` folder and a separate hosted development project (test data only; nothing deployed until the design is reviewed).
- Expo Go for early UI testing on an Android phone (an iPhone also works for early tests); a development build later if native features need it.
- Custom SMTP for auth email (Resend or similar) before relying on auth emails beyond basic development tests.
- Stuck-job and other thresholds are settings, not code.

## Decided, kept here for reference

Competing quotes model, 24-hour expiry with repost, accept goes straight to Scheduled, no re-quote after a rejected quote, contact details only after acceptance, several categories per worker (eight total), voice notes in MVP 1, no distance filter, no chat, draft jobs, cash rules, report window and outcomes, cancellation requests after acceptance, stuck-job flags, quote revisions in MVP 2, commission 0%, own backups. Details: [DECISIONS.md](DECISIONS.md).
