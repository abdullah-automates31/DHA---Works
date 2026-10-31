// Pure rules for W18 Request cancellation (unit tested). After a quote is accepted neither side cancels directly: the
// worker sends a request and DHA staff decide (docs/PRD.md section 6). The job stays active meanwhile.

/** The worker's reasons. "No longer needed" is the customer's reason, so it is not offered here (docs/OPEN-QUESTIONS.md). */
export const WORKER_REASONS = ['schedule_conflict', 'price_dispute', 'safety_concern', 'worker_unavailable', 'other'] as const;
export type WorkerReason = (typeof WORKER_REASONS)[number];

export function isWorkerReason(value: string | null | undefined): value is WorkerReason {
  return (WORKER_REASONS as readonly string[]).includes(value ?? '');
}

export const DETAILS_MAX = 500;

/** Details are optional; tidy them and send nothing when blank. */
export function tidyDetails(raw: string): string | null {
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, DETAILS_MAX);
  return text === '' ? null : text;
}

// ---------------------------------------------------------------- the calls
export type CancelErrorKey =
  | 'cancel.errors.notAllowed'
  | 'cancel.errors.alreadyPending'
  | 'cancel.errors.suspended'
  | 'cancel.errors.noPending'
  | 'cancel.errors.network'
  | 'cancel.errors.generic';

type Err = { name?: string; message?: string } | null | undefined;

export function cancelErrorKey(error: Err): CancelErrorKey {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (text.includes('already waiting for review')) return 'cancel.errors.alreadyPending';
  if (text.includes('while the job is scheduled or in progress') || text.includes('job not found')) return 'cancel.errors.notAllowed';
  if (text.includes('suspended')) return 'cancel.errors.suspended';
  if (text.includes('no pending request found')) return 'cancel.errors.noPending';
  if (text.includes('network') || text.includes('fetch') || error?.name === 'TypeError') return 'cancel.errors.network';
  return 'cancel.errors.generic';
}

export type CancelClient = {
  request(jobId: string, reason: WorkerReason, details: string | null): PromiseLike<{ error: Err }>;
  withdraw(requestId: string): PromiseLike<{ error: Err }>;
};
export type CancelResult = { ok: true } | { ok: false; key: CancelErrorKey };

async function guarded(run: () => Promise<{ error: Err }>): Promise<CancelResult> {
  try {
    const { error } = await run();
    return error ? { ok: false, key: cancelErrorKey(error) } : { ok: true };
  } catch (thrown) {
    return { ok: false, key: thrown instanceof Error && thrown.name === 'TypeError' ? 'cancel.errors.network' : 'cancel.errors.generic' };
  }
}

export function requestCancellation(client: CancelClient, jobId: string, reason: WorkerReason, details: string): Promise<CancelResult> {
  return guarded(async () => client.request(jobId, reason, tidyDetails(details)));
}

export function withdrawCancellation(client: CancelClient, requestId: string): Promise<CancelResult> {
  return guarded(async () => client.withdraw(requestId));
}
