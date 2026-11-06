// Display rules for the dashboard: labels, bar widths, where an item opens, and the date line. Pure and unit tested.
import { isUuidText, type Attention, type AttentionKind, type Stages } from './parse.ts';

export const STAGE_ROWS: { key: keyof Stages; label: string; tone: 'green' | 'red' }[] = [
  { key: 'open', label: 'Open', tone: 'green' },
  { key: 'scheduled', label: 'Scheduled', tone: 'green' },
  { key: 'in_progress', label: 'In progress', tone: 'green' },
  { key: 'completed', label: 'Completed', tone: 'green' },
  { key: 'cash_collected', label: 'Cash collected', tone: 'green' },
  { key: 'disputed', label: 'Disputed', tone: 'red' },
];

/** Bar width in percent, relative to the biggest stage. A non-zero count always shows at least a sliver. */
export function barPercent(count: number, max: number): number {
  if (!(count > 0) || !(max > 0)) return 0;
  return Math.min(100, Math.max(4, Math.round((count / max) * 100)));
}

export function maxStage(stages: Stages): number {
  return Math.max(0, ...Object.values(stages));
}

export const KIND_CHIP: Record<AttentionKind, { label: string; tone: 'red' | 'wait' | 'blue' | 'pur' }> = {
  unsafe: { label: 'Unsafe', tone: 'red' },
  report: { label: 'Report', tone: 'blue' },
  worker: { label: 'Worker', tone: 'wait' },
  resident: { label: 'Resident', tone: 'wait' },
  cancellation: { label: 'Cancel', tone: 'pur' },
  stuck: { label: 'Stuck', tone: 'wait' },
};

/** Where an attention item opens: an application its review screen, a report its case, a stuck job its page, a cancellation request the requests list. */
export function attentionHref(a: Attention): string {
  if (a.kind === 'worker' && isUuidText(a.id)) return `/workers/${a.id}`;
  if (a.kind === 'resident' && isUuidText(a.id)) return `/residents/${a.id}`;
  if ((a.kind === 'unsafe' || a.kind === 'report') && isUuidText(a.id)) return `/reports/${a.id}`;
  if (a.kind === 'unsafe' || a.kind === 'report') return '/reports';
  if (a.kind === 'stuck' && isUuidText(a.id)) return `/jobs/${a.id}`;
  if (a.kind === 'cancellation') return '/jobs/cancellations';
  return '/jobs';
}

/** "12 min ago", "3 h ago", "2 d ago". */
export function agoText(sinceIso: string | null, now: Date = new Date()): string {
  if (!sinceIso) return '-';
  const ms = now.getTime() - Date.parse(sinceIso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/** "Oldest waiting 20 h", or null when nobody waits. */
export function oldestText(count: number, sinceIso: string | null, now: Date = new Date()): string | null {
  if (count === 0 || !sinceIso) return null;
  const ms = now.getTime() - Date.parse(sinceIso);
  if (!Number.isFinite(ms) || ms < 0) return 'Oldest waiting just now';
  const h = Math.floor(ms / 3_600_000);
  return h < 1 ? 'Oldest waiting under 1 h' : h < 48 ? `Oldest waiting ${h} h` : `Oldest waiting ${Math.floor(h / 24)} d`;
}

/** "Saturday, 24 October" in Karachi time, whatever the server's own time zone is. */
export function dateLine(now: Date = new Date()): string {
  // Built from parts so the punctuation does not depend on the Node/ICU version.
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Karachi' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')}, ${get('day')} ${get('month')}`;
}
