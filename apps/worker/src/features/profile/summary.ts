// Display helpers for W16 Profile (unit tested). The numbers come from the database (get_my_earnings and the
// worker's own rows); nothing here computes earnings or ratings.
import { joinList } from '../feed/format.ts';

/** "Phase 5, 6 and 7", or "No areas yet". */
export function areaSummary(phases: readonly number[]): string {
  const sorted = [...phases].sort((a, b) => a - b);
  if (sorted.length === 0) return 'No areas yet';
  return `Phase ${joinList(sorted.map(String))}`;
}

/** "Plumber", "Plumber and Electrician", or "No trade yet". */
export function tradeSummary(names: readonly string[]): string {
  return names.length === 0 ? 'No trade yet' : joinList(names);
}

/** "4.8" for a rated worker; a dash until the first rating (a rating of 0.0 would look like a bad rating). */
export function ratingText(average: number | null | undefined, count: number | null | undefined): string {
  if (!count || !average) return '–';
  return average.toFixed(1);
}

export type Earnings = { cashThisWeek: number; weekJobs: number; ratingAvg: number | null; ratingCount: number; jobsDone: number };

/** get_my_earnings returns a json object; anything missing counts as zero so a half-empty answer cannot crash the screen. */
export function parseEarnings(value: unknown): Earnings {
  const o = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    cashThisWeek: num(o.cash_total),
    weekJobs: num(o.jobs_count),
    ratingAvg: o.rating_avg === null || o.rating_avg === undefined ? null : num(o.rating_avg),
    ratingCount: num(o.rating_count),
    jobsDone: num(o.jobs_done),
  };
}
