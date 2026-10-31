// Pure rules for W11 My jobs and W12 Job status (unit tested with node --test). Everything here is derived from
// what the database already returns for the worker (worker_jobs plus the worker's own interest, quote and cash row).
// Times are the phone's local time.

export type MyJob = {
  id: string;
  code: string;
  status: string;
  title: string;
  phase: number;
  lane: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  startedAt: string | null;
  completedAt: string | null;
  isMine: boolean | null; // true only when this worker's quote was accepted
  myQuoteStatus: string | null;
  myQuoteTotal: number | null;
  residentName: string | null; // filled by the database only for the worker who won the job
  residentPhone: string | null;
  plotNo: string | null;
  floor: string | null;
  cancellationPending: boolean;
  cashRecorded?: boolean; // the worker has already entered the cash amount (the job waits for the customer)
};

export type JobKind =
  | 'interested'
  | 'quoted'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cash_collected'
  | 'reviewed'
  | 'disputed'
  | 'cancelled'
  | 'expired'
  | 'not_chosen';

/** Where the worker stands on a job, from the job status, their quote and whether they won it. */
export function jobKind(job: Pick<MyJob, 'status' | 'isMine' | 'myQuoteStatus'>): JobKind {
  switch (job.status) {
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'open':
    case 'interested':
    case 'quoted':
      if (job.myQuoteStatus === 'sent') return 'quoted';
      if (job.myQuoteStatus === 'rejected') return 'not_chosen'; // a rejected worker cannot quote the same job again
      return 'interested';
    default: {
      if (job.isMine !== true) return 'not_chosen'; // somebody else's job now
      if (job.status === 'accepted' || job.status === 'scheduled') return 'scheduled';
      if (job.status === 'in_progress') return 'in_progress';
      if (job.status === 'completed') return 'completed';
      if (job.status === 'cash_collected') return 'cash_collected';
      if (job.status === 'reviewed') return 'reviewed';
      if (job.status === 'disputed') return 'disputed';
      return 'not_chosen';
    }
  }
}

// ---------------------------------------------------------------- tabs
export type MyJobsTab = 'active' | 'completed' | 'all';

const ACTIVE: JobKind[] = ['interested', 'quoted', 'scheduled', 'in_progress', 'completed', 'disputed'];
const FINISHED: JobKind[] = ['cash_collected', 'reviewed'];

/**
 * Active = anything that still needs the worker or is waiting (a completed job stays here until its cash is
 * recorded, as in the design). Completed = cash recorded or reviewed. All = everything, including jobs that were
 * cancelled, expired or given to another worker.
 */
export function inTab(kind: JobKind, tab: MyJobsTab): boolean {
  if (tab === 'all') return true;
  return (tab === 'active' ? ACTIVE : FINISHED).includes(kind);
}

const ORDER: JobKind[] = ['in_progress', 'scheduled', 'completed', 'disputed', 'quoted', 'interested', 'cash_collected', 'reviewed', 'not_chosen', 'cancelled', 'expired'];

/** Most urgent first; scheduled jobs by visit time; finished jobs newest first. */
export function sortJobs<T extends Pick<MyJob, 'status' | 'isMine' | 'myQuoteStatus' | 'scheduledStart' | 'completedAt'>>(jobs: readonly T[]): T[] {
  return [...jobs].sort((a, b) => {
    const ka = ORDER.indexOf(jobKind(a));
    const kb = ORDER.indexOf(jobKind(b));
    if (ka !== kb) return ka - kb;
    const kind = jobKind(a);
    if (kind === 'scheduled' || kind === 'in_progress') return time(a.scheduledStart) - time(b.scheduledStart);
    return time(b.completedAt ?? b.scheduledStart) - time(a.completedAt ?? a.scheduledStart);
  });
}

function time(iso: string | null | undefined): number {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

// ---------------------------------------------------------------- progress bar (9 segments, from the design)
export const SEGMENTS = 9;

/** Interested 3, Scheduled 5, In progress 6, Completed 7 (as drawn in W06 and W11); the rest continue the pattern. */
export function progressSegments(kind: JobKind): number {
  switch (kind) {
    case 'interested':
      return 3;
    case 'quoted':
      return 4;
    case 'scheduled':
      return 5;
    case 'in_progress':
      return 6;
    case 'completed':
      return 7;
    case 'cash_collected':
      return 8;
    case 'reviewed':
      return 9;
    default:
      return 0; // disputed, cancelled, expired, not chosen: no bar
  }
}

// ---------------------------------------------------------------- chips
export type ChipStyle = { label: string; bg: string; fg: string };

// Colours from the approved chip palette (SPEC.md: wait/quoted, scheduled, in progress, done, declined) and .c-open.
const MINT = { bg: '#DCEBE2', fg: '#0A3D28' };
export function chipFor(kind: JobKind): ChipStyle {
  switch (kind) {
    case 'interested':
      return { label: 'Interested', ...MINT };
    case 'quoted':
      return { label: 'Quoted', bg: '#F6E7B4', fg: '#5C4300' };
    case 'scheduled':
      return { label: 'Scheduled', bg: '#D6E6F7', fg: '#17406B' };
    case 'in_progress':
      return { label: 'In progress', bg: '#E5DDF5', fg: '#44297A' };
    case 'completed':
      return { label: 'Completed', bg: '#C9E8D5', fg: '#0A5530' };
    case 'cash_collected':
      return { label: 'Cash collected', bg: '#C9E8D5', fg: '#0A5530' };
    case 'reviewed':
      return { label: 'Reviewed', bg: '#C9E8D5', fg: '#0A5530' };
    case 'disputed':
      return { label: 'Under review', bg: '#FADCDA', fg: '#99191A' };
    case 'cancelled':
      return { label: 'Cancelled', bg: '#FADCDA', fg: '#99191A' };
    case 'expired':
      return { label: 'Expired', bg: '#FADCDA', fg: '#99191A' };
    case 'not_chosen':
      return { label: 'Not chosen', bg: '#E6EBE8', fg: '#4F6A5C' };
  }
}

// ---------------------------------------------------------------- what the main button does
export type ActionKind = 'create_quote' | 'waiting' | 'start' | 'complete' | 'record_cash' | 'back' | 'find_jobs' | 'help';

/** The main action of a job in each state (the bottom button on W12; the call-to-action on a W11 card). */
export function primaryAction(kind: JobKind, cashRecorded = false): ActionKind {
  switch (kind) {
    case 'interested':
      return 'create_quote';
    case 'quoted':
      return 'waiting';
    case 'scheduled':
      return 'start';
    case 'in_progress':
      return 'complete';
    case 'completed':
      return cashRecorded ? 'waiting' : 'record_cash';
    case 'cash_collected':
    case 'reviewed':
      return 'back';
    case 'disputed':
      return 'help';
    default:
      return 'find_jobs';
  }
}

/** A job can be reported from the moment it starts until 7 days after completion (docs/DECISIONS.md). */
export function canReport(kind: JobKind): boolean {
  return kind === 'in_progress' || kind === 'completed' || kind === 'cash_collected' || kind === 'reviewed' || kind === 'disputed';
}

/** A cancellation request can be filed on an accepted job that has not finished (docs/FEATURES.md, W18). */
export function canRequestCancellation(kind: JobKind, pending: boolean): boolean {
  return !pending && (kind === 'scheduled' || kind === 'in_progress');
}

// ---------------------------------------------------------------- dates and times
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function clock(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function dayDiff(a: Date, b: Date): number {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(a) - start(b)) / 86_400_000);
}

/** "Sat 24 Oct, 9:40 AM" for the timeline. */
export function stamp(iso: string | null | undefined): string {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return '';
  return `${WEEKDAYS[t.getDay()]} ${t.getDate()} ${MONTHS[t.getMonth()]}, ${clock(t)}`;
}

/** "10:30 AM". */
export function clockText(iso: string | null | undefined): string {
  const t = iso ? new Date(iso) : null;
  return !t || Number.isNaN(t.getTime()) ? '' : clock(t);
}

/** "today", "tomorrow" or "Sat 24 Oct". */
export function dayWord(iso: string | null | undefined, now: Date = new Date()): string {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return '';
  const diff = dayDiff(t, now);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return `${WEEKDAYS[t.getDay()]} ${t.getDate()} ${MONTHS[t.getMonth()]}`;
}

function hourRange(a: Date, b: Date | null): string {
  const hour = (d: Date) => ({ n: d.getHours() % 12 === 0 ? 12 : d.getHours() % 12, p: d.getHours() < 12 ? 'AM' : 'PM', m: d.getMinutes() });
  const text = (d: Date) => {
    const h = hour(d);
    return h.m === 0 ? `${h.n}` : `${h.n}:${String(h.m).padStart(2, '0')}`;
  };
  if (!b) return `${text(a)} ${hour(a).p}`;
  return hour(a).p === hour(b).p ? `${text(a)} to ${text(b)} ${hour(b).p}` : `${text(a)} ${hour(a).p} to ${text(b)} ${hour(b).p}`;
}

/** "11 AM to 1 PM". */
export function windowText(start: string | null | undefined, end: string | null | undefined): string {
  const a = start ? new Date(start) : null;
  if (!a || Number.isNaN(a.getTime())) return '';
  const b = end ? new Date(end) : null;
  return hourRange(a, b && !Number.isNaN(b.getTime()) ? b : null);
}

/** "Today, 11 AM to 1 PM" / "Tomorrow, ..." / "Sat 24 Oct, ..." for a card. */
export function visitLine(start: string | null | undefined, end: string | null | undefined, now: Date = new Date()): string {
  const day = dayWord(start, now);
  const win = windowText(start, end);
  if (!day || !win) return '';
  const label = day === 'today' || day === 'tomorrow' || day === 'yesterday' ? day.charAt(0).toUpperCase() + day.slice(1) : day;
  return `${label}, ${win}`;
}

// ---------------------------------------------------------------- the W12 timeline
export type TimelineStep = { label: string; sub: string; state: 'done' | 'current' | 'todo' | 'stop' };

export type TimelineInput = {
  kind: JobKind;
  interestAt: string | null;
  quoteAt: string | null;
  quoteTotal: number | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cashAmount: number | null;
};

const BASE = ['Interested', 'Quoted', 'Scheduled', 'In progress', 'Completed', 'Cash collected', 'Review'] as const;
const AT: Partial<Record<JobKind, number>> = { interested: 0, quoted: 1, scheduled: 2, in_progress: 3, completed: 4, cash_collected: 5, reviewed: 7 };

function rupees(n: number): string {
  return `Rs ${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** The furthest stage the job actually reached, for jobs that stopped (cancelled, expired, not chosen, disputed). */
function reached(i: TimelineInput): number {
  if (i.completedAt) return 4;
  if (i.startedAt) return 3;
  if (i.scheduledStart) return 2;
  if (i.quoteAt) return 1;
  return 0;
}

export function timeline(i: TimelineInput): TimelineStep[] {
  const subs: Record<number, string> = {
    0: stamp(i.interestAt),
    1: i.quoteTotal !== null && i.quoteAt ? `${rupees(i.quoteTotal)} sent at ${clockText(i.quoteAt)}` : '',
    2: i.scheduledStart ? `${stamp(i.scheduledStart).split(',')[0]}, ${windowText(i.scheduledStart, i.scheduledEnd)}` : '',
    3: i.startedAt ? `Started at ${clockText(i.startedAt)}` : '',
    4: i.completedAt ? `Finished at ${clockText(i.completedAt)}` : '',
    5: i.cashAmount !== null ? `${rupees(i.cashAmount)} in cash` : '',
    6: 'Customer rated the job',
  };

  const stops: Partial<Record<JobKind, { label: string; sub: string }>> = {
    disputed: { label: 'Problem reported', sub: 'DHA staff are reviewing it' },
    cancelled: { label: 'Cancelled', sub: 'This job was cancelled' },
    expired: { label: 'Expired', sub: 'Nobody was chosen within 24 hours' },
    not_chosen: { label: 'Not chosen', sub: 'Another worker was chosen' },
  };
  const stop = stops[i.kind];
  if (stop) {
    const upTo = i.kind === 'disputed' ? 4 : reached(i);
    const steps: TimelineStep[] = BASE.slice(0, upTo + 1).map((label, n) => ({ label, sub: subs[n] ?? '', state: 'done' as const }));
    steps.push({ label: stop.label, sub: stop.sub, state: 'stop' });
    return steps;
  }

  const at = AT[i.kind] ?? 0;
  return BASE.map((label, n) => {
    const state = n < at ? 'done' : n === at ? 'current' : 'todo';
    // The Review step only says anything once the job is closed; future steps show no detail.
    const sub = state === 'todo' ? '' : n === 6 && i.kind !== 'reviewed' ? '' : (subs[n] ?? '');
    return { label, sub, state } as TimelineStep;
  });
}

// ---------------------------------------------------------------- the W12 note card (headline and body)
export type Note = { headline: string; body: string };

/** Wording follows the design, with the decided corrections: no contact before acceptance, no re-quote after a rejection. */
export function noteFor(job: MyJob, kind: JobKind, now: Date = new Date()): Note {
  const who = job.residentName ? shortName(job.residentName) : 'the customer';
  switch (kind) {
    case 'interested':
      return { headline: 'Send your quote', body: 'Review the job, then send one clear quote. The customer’s contact details are shared only after they accept it.' };
    case 'quoted':
      return { headline: 'Waiting for the customer to accept', body: 'Your quote cannot be edited. You will be told here if it is chosen or not.' };
    case 'scheduled': {
      const day = dayWord(job.scheduledStart, now);
      const when = day ? `Visit ${day}, ${windowText(job.scheduledStart, job.scheduledEnd)}` : 'Visit time to be confirmed';
      const place = [`Phase ${job.phase}`, job.lane, job.plotNo ? `House ${job.plotNo}` : '', job.floor ? `Floor ${job.floor}` : ''].filter(Boolean).join(', ');
      return { headline: when, body: `${place}. Tap Start job when you arrive.` };
    }
    case 'in_progress':
      return { headline: 'Work in progress', body: 'Tap Mark complete when the work is finished and the area is clean.' };
    case 'completed':
      if (job.cashRecorded) return { headline: 'Cash recorded', body: `Waiting for ${who} to confirm the amount. The job closes when they do.` };
      return { headline: 'Record the cash you collected', body: `Enter the amount ${who} paid you in cash. This closes the job.` };
    case 'cash_collected':
      return { headline: 'Waiting for the rating', body: `${capitalize(who)} will rate the job. You can report a problem for up to 7 days.` };
    case 'reviewed':
      return { headline: 'Job closed', body: 'Your overall rating on Profile is updated. You do not see who rated what.' };
    case 'disputed':
      return { headline: 'DHA staff are reviewing a problem', body: 'Do not discuss payment with the customer. DHA will contact you.' };
    case 'cancelled':
      return { headline: 'This job was cancelled', body: 'Nothing is owed. Find another job in Open jobs.' };
    case 'expired':
      return { headline: 'This job expired', body: 'Nobody was chosen within 24 hours. Find another job in Open jobs.' };
    case 'not_chosen':
      return { headline: 'Another worker was chosen', body: 'Your quote was not selected. Find more jobs in Open jobs.' };
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Hira Farooq" -> "Hira F."; only used after the quote was accepted (the database sends no name before). */
export function shortName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0] ?? '';
  return `${parts[0]} ${Array.from(parts[parts.length - 1] ?? '')[0]?.toUpperCase() ?? ''}.`;
}

export function initials(fullName: string | null | undefined): string {
  return (fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => Array.from(p)[0] ?? '')
    .join('')
    .toUpperCase();
}

/** A phone number the worker may call: only after acceptance, digits and a leading +. */
export function dialable(phone: string | null | undefined): string | null {
  const clean = (phone ?? '').replace(/[^\d+]/g, '');
  return /^\+?\d{7,15}$/.test(clean) ? clean : null;
}
