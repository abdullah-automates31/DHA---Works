// Display helpers for the W06 dashboard (unit tested with node --test). All times are the phone's local time.
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** First word of the full name ("Usman Khan" -> "Usman"); empty when unknown. */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? '';
}

/** "Saturday, 24 Oct". */
export function formatHomeDate(now: Date): string {
  return `${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;
}

/** "Today, Sat 24 Oct". */
export function formatTodayHeading(now: Date): string {
  return `Today, ${(WEEKDAYS[now.getDay()] ?? '').slice(0, 3)} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
}

function clock(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}${minutes === 0 ? '' : ':' + String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** "11 AM to 1 PM", "4 PM" when there is no end, "" when there is no start. */
export function timeWindow(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return '';
  const from = new Date(start);
  if (Number.isNaN(from.getTime())) return '';
  const to = end ? new Date(end) : null;
  if (!to || Number.isNaN(to.getTime())) return clock(from);
  return `${clock(from)} to ${clock(to)}`;
}

export function isSameDay(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/** "Hira Farooq" -> "Hira F."; one word stays as it is. Only used once a quote was accepted. */
export function shortName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0] ?? '';
  return `${parts[0]} ${Array.from(parts[parts.length - 1] ?? '')[0]?.toUpperCase() ?? ''}.`;
}

export function initialsOf(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => Array.from(p)[0] ?? '')
    .join('')
    .toUpperCase();
}

/** 3200 -> "Rs 3,200". */
export function formatRupees(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '';
  return `Rs ${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** "3 new jobs near you" / "1 new job near you". */
export function newJobsText(count: number): string {
  return count === 1 ? '1 new job near you' : `${count} new jobs near you`;
}
