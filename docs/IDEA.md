# The Idea, in Depth

## One-minute version

DHA Works helps DHA residents find a trusted, approved worker for home repairs. The customer posts a job with photos. Approved workers who work in that area and trade can see it, and several of them send itemised quotes. The customer compares the quotes and accepts one, the two arrange the visit by phone, the work is done, and the customer pays cash. If anything goes wrong, DHA staff step in with the full record in front of them.

## The problem

Finding a plumber, electrician or AC technician in DHA today depends on word of mouth and phone numbers from neighbours.

- **Hard to find.** There is no list of workers anyone has checked.
- **Trust is a guess.** Customers cannot tell who is real, skilled or reliable, and they are letting a stranger into their home.
- **Blind pricing.** Prices are negotiated on the spot. Labour and materials are not itemised, and there is nothing to compare a quote against.
- **No record.** Nobody can prove what was agreed, so disagreements turn into arguments.
- **No neutral party.** When work goes wrong there is nobody to complain to.
- **Missed income.** Good workers lose jobs because customers cannot find them, and they have no steady source of nearby work.

## The vision

A neighbourhood marketplace where **every worker is verified by DHA staff**, **every price is an itemised quote the customer chooses between**, and **every job, quote and status change is kept** so disputes can be settled fairly.

The first version is deliberately small. Its goal is to put a real customer and a real worker through one complete job, and let a DHA admin resolve a dispute, to learn whether people use it and trust it.

## Who it is for

| Person | What they want |
| --- | --- |
| **Customer** (DHA resident) | A reliable worker, a clear price before work starts, and somewhere to turn if it goes wrong |
| **Worker** (plumber, electrician, AC technician, carpenter, painter and so on) | Steady, nearby jobs and a profile that proves they are trustworthy |
| **DHA staff** | A queue to verify workers, a view of every job, and tools to settle complaints |

## How it works

1. **Onboarding and verification.** A resident gives name, contact details, CNIC, DHA address and a recent utility bill. A worker gives identity details, CNIC photos, a police certificate (or two references), a photo, trades, experience, a visit fee and an optional voice introduction. DHA staff review both by hand: approve, ask for changes or visit HQ, or reject.
2. **Post.** An approved resident posts a job: description, optional voice note, category, address, time and photos (or saves a draft). It stays open for 24 hours.
3. **Interest and quotes.** Approved workers matching the category and DHA phase see the job, mark interest and send an itemised quote: labour, materials, other, plus a visit window. Workers see only the area; the resident's phone and plot stay hidden.
4. **Choose.** The resident compares quotes (price, rating, soonest) and accepts one. The others are told they were not selected. The phone numbers and full address are then revealed, and the two call each other.
5. **Work.** The worker starts and completes the job at the scheduled visit.
6. **Cash.** Both sides record the amount paid. Equal amounts close the job; different amounts flag it for staff.
7. **Review.** The resident rates behaviour, completeness and quality; the rating is anonymous.
8. **If it goes wrong.** Either side can report a problem or press "I feel unsafe" from when the job is scheduled until 7 days after completion. DHA staff decide: no action, a warning, or suspend, and can cancel the job. The DHA helpline is 1092.

## Design principles

- **Trust first.** Verification, a visible Verified badge, ratings and a permanent record are the product. Convenience comes second.
- **Cash only.** The first version takes no money. This removes payment risk and licensing while the service is proven.
- **The database enforces the rules.** Permissions and job transitions are enforced in Postgres, not just in app screens, so a modified app cannot cheat.
- **Small and finishable.** Category plus DHA phase matching (no GPS), manual verification, one language first.
- **One record of truth.** Quotes, photos, cash entries and the status timeline live together so a dispute has evidence.

## What success looks like

The MVP is complete when a real customer and a real worker can finish one job end to end and an admin can resolve a dispute. Proposed targets (to confirm with Shariq Bhai):

| Metric | Proposed target |
| --- | --- |
| Jobs posted that receive at least one quote | 70% within 24 hours |
| Jobs that receive 2 or more quotes | 50% |
| Jobs with a quote that get one accepted | 50% |
| Completed jobs rated | 60% |
| Complaints per 100 completed jobs | under 5 |
| Worker applications reviewed | within 2 days |

## What it is not (yet)

Online payments and wallets, commission and payouts, live GPS tracking and distance matching, automated document checks, AI matching, in-app chat, quote revisions (MVP 2), booking a specific worker, advanced analytics, multiple cities and a customer web app all wait until the core loop is proven. See [ROADMAP.md](ROADMAP.md).

## Business model

Commission is **deferred**. The first version proves that people use and trust the service; how the platform earns is decided afterwards with Shariq Bhai.
