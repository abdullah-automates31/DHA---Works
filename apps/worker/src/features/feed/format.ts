// Display helpers for W07 Open jobs (unit tested with node --test). Times are the phone's local time.
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 min ago", "1 hr ago", "3 hrs ago", "2 days ago" (the design's wording). */
export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.max(0, Math.floor((now.getTime() - then) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hr ago' : `${hours} hrs ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** ["Plumbing"] -> "Plumbing"; two -> "A and B"; three -> "A, B and C". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "Plumbing jobs in Phase 5, 6 and 7" (the design's subtitle, built from the worker's own trades and phases). */
export function feedSubtitle(trades: readonly string[], phases: readonly number[]): string {
  const sorted = [...phases].sort((a, b) => a - b);
  const where = sorted.length === 0 ? '' : ` in Phase ${joinList(sorted.map(String))}`;
  const what = trades.length === 0 ? 'Jobs' : `${joinList(trades)} jobs`;
  return `${what}${where}`;
}

function clock(hours: number, minutes: number): { text: string; period: 'AM' | 'PM' } {
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return { text: minutes === 0 ? String(hour12) : `${hour12}:${String(minutes).padStart(2, '0')}`, period: hours < 12 ? 'AM' : 'PM' };
}

function parseTime(value: string | null | undefined): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
  if (!match) return null;
  return { h: Number(match[1]), m: Number(match[2]) };
}

/** Postgres time columns ("16:00:00", "18:00:00") -> "4 to 6 PM"; "11 AM to 1 PM" when the periods differ. */
export function timeRange(from: string | null | undefined, to: string | null | undefined): string {
  const a = parseTime(from);
  if (!a) return '';
  const start = clock(a.h, a.m);
  const b = parseTime(to);
  if (!b) return `${start.text} ${start.period}`;
  const end = clock(b.h, b.m);
  return start.period === end.period ? `${start.text} to ${end.text} ${end.period}` : `${start.text} ${start.period} to ${end.text} ${end.period}`;
}

/** "2026-10-24" -> "Sat 24 Oct". */
export function shortDate(isoDate: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate ?? '');
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export type WhenPill = { urgent: boolean; text: string };

/**
 * The time pill on a card. ASAP jobs read "As soon as possible" plus "today" when they were posted today;
 * scheduled jobs read "Sat 24 Oct · 4 to 6 PM" from the date and time window the resident chose.
 */
export function whenPill(
  job: { urgency: string; preferredDate: string | null; windowFrom: string | null; windowTo: string | null; postedAt: string | null },
  now: Date = new Date(),
): WhenPill {
  if (job.urgency === 'asap') {
    const posted = job.postedAt ? new Date(job.postedAt) : null;
    const today =
      posted !== null &&
      posted.getFullYear() === now.getFullYear() &&
      posted.getMonth() === now.getMonth() &&
      posted.getDate() === now.getDate();
    return { urgent: true, text: today ? 'As soon as possible · today' : 'As soon as possible' };
  }
  const parts = [shortDate(job.preferredDate), timeRange(job.windowFrom, job.windowTo)].filter(Boolean);
  return { urgent: false, text: parts.join(' · ') };
}

/** Category ids are fixed by the catalogue seed (0002); anything else falls back to the generic tool icon. */
export type CategoryIconKey = 'wrench' | 'bolt' | 'snow' | 'hammer' | 'brush' | 'sparkle' | 'flame' | 'tool';
const ICONS_BY_CATEGORY: Record<number, CategoryIconKey> = {
  1: 'wrench', // Plumbing
  2: 'bolt', // Electrical
  3: 'snow', // AC & Refrigeration
  4: 'hammer', // Carpentry
  5: 'brush', // Painting
  6: 'sparkle', // Cleaning
  7: 'flame', // Welding & Ironwork
  8: 'tool', // General Handyman
};
export function categoryIconKey(categoryId: number | null | undefined): CategoryIconKey {
  return (categoryId !== null && categoryId !== undefined ? ICONS_BY_CATEGORY[categoryId] : undefined) ?? 'tool';
}
