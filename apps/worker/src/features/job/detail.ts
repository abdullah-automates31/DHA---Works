// Pure rules for W08 Job detail (unit tested with node --test).

export type JobChip = 'urgent' | 'new' | 'open';
const NEW_WITHIN_MS = 2 * 3_600_000; // our rule: the mock's "New" chip has no defined meaning (docs/OPEN-QUESTIONS.md)

/** Urgent for ASAP jobs, "New" when posted in the last 2 hours, otherwise "Open". */
export function jobChip(urgency: string, postedAt: string | null | undefined, now: Date = new Date()): JobChip {
  if (urgency === 'asap') return 'urgent';
  const posted = postedAt ? new Date(postedAt).getTime() : NaN;
  if (!Number.isNaN(posted) && now.getTime() - posted < NEW_WITHIN_MS) return 'new';
  return 'open';
}

/** "Posted 12 min ago" / "Posted 1 hr ago": the age text comes from feed/format.ts timeAgo. */
export function postedText(ago: string): string {
  return ago ? `Posted ${ago.charAt(0).toLowerCase()}${ago.slice(1)}` : '';
}

/** How the worker stands on this job, which decides the button. */
export type Standing = 'none' | 'interested' | 'quoted' | 'closed'; // interested and quoted only exist on jobs from before claim-and-lock

/**
 * From worker_jobs (jobs this worker engaged with): a sent quote -> quoted; still open for quotes -> interested;
 * anything else (won by someone, expired, cancelled, rejected) -> closed.
 */
export function standingFromMyJob(job: { status: string; myQuoteStatus: string | null }): Standing {
  if (job.myQuoteStatus === 'sent') return 'quoted';
  if (job.myQuoteStatus === 'rejected' || job.myQuoteStatus === 'not_selected' || job.myQuoteStatus === 'withdrawn') return 'closed';
  return ['open', 'interested', 'quoted'].includes(job.status) ? 'interested' : 'closed';
}
