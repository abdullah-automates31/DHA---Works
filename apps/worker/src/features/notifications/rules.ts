// Pure rules for W15 Notifications (unit tested): what each notification type says, which group it sits in, and
// where it opens. The database writes only the type, the job and a small payload (the job title, sometimes a
// visit time); it never puts a resident's name, phone or address in a notification, so none is shown here.
import { timeAgo } from '../feed/format.ts';
import { dayWord, windowText } from '../myjobs/rules.ts';

export type Notice = {
  id: string;
  type: string;
  jobId: string | null;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

export type NoticeIcon = 'check' | 'info' | 'alert' | 'job';
export type NoticeView = { title: string; body: string; icon: NoticeIcon; opensJob: boolean };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** "Bathroom flush tank leak" or, when the payload has no title, a neutral "your job". */
function jobName(n: Notice): string {
  return text(n.payload?.title) || 'your job';
}

export function describe(n: Notice, now: Date = new Date()): NoticeView {
  const job = jobName(n);
  switch (n.type) {
    case 'quote_accepted': {
      const start = text(n.payload?.start);
      const when = start ? ` Visit ${dayWord(start, now)}, ${windowText(start, null)}.` : '';
      return { title: 'Quote accepted', body: `Your quote for ${job} was accepted.${when}`, icon: 'check', opensJob: true };
    }
    case 'quote_not_selected':
      return { title: 'Quote not selected', body: `Another worker was chosen for ${job}. Find more jobs.`, icon: 'info', opensJob: true };
    case 'quote_rejected':
      return { title: 'Quote declined', body: `The customer declined your quote for ${job}.`, icon: 'info', opensJob: true };
    case 'job_cancelled':
      return { title: 'Job cancelled', body: `${capitalize(job)} was cancelled by the customer. Nothing is owed.`, icon: 'alert', opensJob: true };
    case 'job_expired':
      return { title: 'Job expired', body: `${capitalize(job)} expired before a worker was chosen.`, icon: 'info', opensJob: true };
    case 'cash_collected':
      return { title: 'Job closed', body: `The cash for ${job} is confirmed. The customer will rate the job.`, icon: 'check', opensJob: true };
    case 'cash_disputed':
      return { title: 'Cash amounts differ', body: `The amounts entered for ${job} do not match. DHA staff may check it.`, icon: 'alert', opensJob: true };
    case 'job_stuck':
      return { title: 'Job needs an update', body: `${capitalize(job)} looks stuck. Open it and update its status.`, icon: 'alert', opensJob: true };
    case 'cancellation_requested':
      return { title: 'Cancellation requested', body: `A cancellation was requested for ${job}. DHA staff will review it.`, icon: 'alert', opensJob: true };
    default:
      return { title: 'New update', body: n.jobId ? `There is an update on ${job}.` : 'Open the app to see what changed.', icon: 'job', opensJob: n.jobId !== null };
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// ---------------------------------------------------------------- grouping
export type Group = { key: 'today' | 'earlier'; items: Notice[] };

function sameDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** Newest first, split into Today and Earlier (empty groups are left out). */
export function groupNotices(list: readonly Notice[], now: Date = new Date()): Group[] {
  const sorted = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const today = sorted.filter((n) => sameDay(n.createdAt, now));
  const earlier = sorted.filter((n) => !sameDay(n.createdAt, now));
  return [
    ...(today.length > 0 ? [{ key: 'today' as const, items: today }] : []),
    ...(earlier.length > 0 ? [{ key: 'earlier' as const, items: earlier }] : []),
  ];
}

export function unreadIds(list: readonly Notice[]): string[] {
  return list.filter((n) => n.readAt === null).map((n) => n.id);
}

/** "2 min ago" for today, "Mon 26 Oct"-style for older ones is overkill here: reuse the relative wording. */
export function ago(n: Notice, now: Date = new Date()): string {
  return timeAgo(n.createdAt, now);
}
