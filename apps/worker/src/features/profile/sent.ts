// "Today, 10:12 AM" / "Yesterday, 4:05 PM" / "29 Oct, 10:12 AM" for the W04 timeline (local time).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function clock(date: Date): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

function dayNumber(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86_400_000);
}

export function formatSent(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = dayNumber(now) - dayNumber(date);
  if (diff === 0) return `Today, ${clock(date)}`;
  if (diff === 1) return `Yesterday, ${clock(date)}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${clock(date)}`;
}
