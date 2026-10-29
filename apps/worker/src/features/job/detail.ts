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

export type InterestBanner = { titleKey: 'job.interested.one' | 'job.interested.many'; count: number; quoted: number } | null;

/**
 * The yellow banner: how many OTHER workers are interested (and how many already sent a quote). Hidden when nobody
 * else is. The counts come from worker_feed, which hides jobs this worker already engaged with, so "others" is exact.
 */
export function interestBanner(interested: number | null | undefined, quoted: number | null | undefined): InterestBanner {
  const count = Math.max(0, Number(interested ?? 0));
  if (count === 0) return null;
  return { titleKey: count === 1 ? 'job.interested.one' : 'job.interested.many', count, quoted: Math.max(0, Number(quoted ?? 0)) };
}

/** How the worker stands on this job, which decides the button. */
export type Standing = 'none' | 'interested' | 'quoted' | 'closed';

/**
 * From worker_jobs (jobs this worker engaged with): a sent quote -> quoted; still open for quotes -> interested;
 * anything else (won by someone, expired, cancelled, rejected) -> closed.
 */
export function standingFromMyJob(job: { status: string; myQuoteStatus: string | null }): Standing {
  if (job.myQuoteStatus === 'sent') return 'quoted';
  if (job.myQuoteStatus === 'rejected' || job.myQuoteStatus === 'not_selected' || job.myQuoteStatus === 'withdrawn') return 'closed';
  return ['open', 'interested', 'quoted'].includes(job.status) ? 'interested' : 'closed';
}

export type InterestErrorKey = 'job.errors.unavailable' | 'job.errors.rejected' | 'job.errors.network' | 'job.errors.generic';

type Err = { name?: string; message?: string } | null | undefined;

/** Maps the express_interest failures to friendly messages; raw server text is never shown. */
export function interestErrorKey(error: Err): InterestErrorKey {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (text.includes('this job is not available') || text.includes('not approved') || text.includes('suspended')) {
    return 'job.errors.unavailable';
  }
  if (text.includes('did not accept your quote')) return 'job.errors.rejected';
  if (text.includes('network') || text.includes('fetch') || error?.name === 'TypeError') return 'job.errors.network';
  return 'job.errors.generic';
}

export type StartQuoteClient = {
  expressInterest(jobId: string): PromiseLike<{ error: Err }>;
};

export type StartQuoteResult = { ok: true } | { ok: false; key: InterestErrorKey };

/**
 * "I will quote this job": record interest, then the screen opens quote creation. Safe to repeat: the database
 * returns quietly when interest already exists, so a double tap or a retry after a lost response is harmless.
 */
export async function startQuote(client: StartQuoteClient, jobId: string): Promise<StartQuoteResult> {
  try {
    const { error } = await client.expressInterest(jobId);
    return error ? { ok: false, key: interestErrorKey(error) } : { ok: true };
  } catch (thrown) {
    return { ok: false, key: thrown instanceof Error && thrown.name === 'TypeError' ? 'job.errors.network' : 'job.errors.generic' };
  }
}
