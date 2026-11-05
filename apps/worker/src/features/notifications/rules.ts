// Pure rules for W15 Notifications (unit tested): what each notification type says, which group it sits in, and
// where it opens. The database writes only the type, the job and a small payload (the job title, sometimes a
// visit time); it never puts a resident's name, phone or address in a notification, so none is shown here.
import { t } from '../../i18n/index.ts';
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
  return text(n.payload?.title) || t('notices.yourJob');
}

export function describe(n: Notice, now: Date = new Date()): NoticeView {
  const job = jobName(n);
  switch (n.type) {
    case 'quote_accepted': {
      const start = text(n.payload?.start);
      const when = start ? t('notices.quoteAcceptedWhen', { day: dayWord(start, now), window: windowText(start, null) }) : '';
      return { title: t('notices.quoteAcceptedTitle'), body: t('notices.quoteAcceptedBody', { job, when }), icon: 'check', opensJob: true };
    }
    case 'quote_not_selected':
      return { title: t('notices.quoteRejectedTitle'), body: t('notices.quoteNotSelectedBody', { job }), icon: 'info', opensJob: false };
    case 'quote_rejected':
      return { title: t('notices.quoteRejectedTitle'), body: t('notices.quoteRejectedBody', { job }), icon: 'info', opensJob: false };
    case 'job_cancelled':
      return { title: t('notices.jobCancelledTitle'), body: t('notices.jobCancelledBody'), icon: 'alert', opensJob: false };
    case 'job_expired':
      return { title: t('notices.jobExpiredTitle'), body: t('notices.jobExpiredBody', { job: capitalize(job) }), icon: 'info', opensJob: true };
    case 'cash_collected':
      return { title: t('notices.cashCollectedTitle'), body: t('notices.cashCollectedBody', { job }), icon: 'check', opensJob: true };
    case 'cash_disputed':
      return { title: t('notices.cashUpdateTitle'), body: t('notices.cashUpdateBody', { job }), icon: 'info', opensJob: true };
    case 'job_stuck':
      return { title: t('notices.jobStuckTitle'), body: t('notices.jobStuckBody', { job: capitalize(job) }), icon: 'alert', opensJob: true };
    case 'cancellation_requested':
      return { title: t('notices.cancelRequestedTitle'), body: t('notices.cancelRequestedBody', { job }), icon: 'alert', opensJob: true };
    default:
      return { title: t('notices.updateTitle'), body: n.jobId ? t('notices.updateBody', { job }) : t('notices.updateGeneric'), icon: 'job', opensJob: n.jobId !== null };
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
