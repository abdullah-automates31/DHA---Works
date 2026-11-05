// Shared bits of "load the next page when the list is nearly scrolled to the end" (open jobs, my jobs, notifications).
// Pages are fetched with limit/offset (supabase `range`) in a stable order. A job can be posted while the worker is
// scrolling, which shifts later pages by one, so pages are always merged by id: nothing shows twice.

/** Merges a new page into the list already shown, by id. A row seen again replaces the old copy in its place. */
export function mergeById<T extends { id: string }>(current: readonly T[], incoming: readonly T[]): T[] {
  const replacement = new Map(incoming.map((row) => [row.id, row]));
  const merged = current.map((row) => replacement.get(row.id) ?? row);
  const known = new Set(current.map((row) => row.id));
  for (const row of incoming) {
    if (!known.has(row.id)) {
      known.add(row.id);
      merged.push(row);
    }
  }
  return merged;
}

/**
 * A page was requested with one row more than it shows. If that extra row came back, there is another page, and the
 * extra row is dropped. This avoids a count query and an empty last page.
 */
export function splitPage<T>(rows: readonly T[], pageSize: number): { rows: T[]; hasMore: boolean } {
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}

type ScrollEvent = {
  layoutMeasurement: { height: number };
  contentOffset: { y: number };
  contentSize: { height: number };
};

/** True when the visible area is within `threshold` points of the bottom of the content. */
export function nearEnd(event: ScrollEvent, threshold = 600): boolean {
  const { layoutMeasurement, contentOffset, contentSize } = event;
  if (contentSize.height <= 0) return false;
  return layoutMeasurement.height + contentOffset.y >= contentSize.height - threshold;
}
