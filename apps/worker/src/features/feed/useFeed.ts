import { mergeById, splitPage } from '@/lib/paging';
import { signedUrlMap } from '@/lib/signedUrls';
import { supabase } from '@/lib/supabase';
import { usePaged, type Paged } from '@/lib/usePaged';

export type FeedJob = {
  id: string;
  title: string;
  description: string;
  categoryId: number;
  phase: number;
  lane: string;
  urgency: string;
  preferredDate: string | null;
  windowFrom: string | null;
  windowTo: string | null;
  hasVoiceNote: boolean;
  postedAt: string | null;
  photos: string[]; // signed URLs, at most two (the design shows two thumbnails)
  photoCount: number;
};

type FeedState = { jobs: FeedJob[]; trades: string[]; hasMore: boolean; consumed: number };
export type FeedData = Paged<FeedState>;

export const PAGE = 20;

// Only the columns the list draws (never select *: the view also computes counts the feed does not need).
const COLUMNS =
  'id, title, description, category_id, phase, lane, urgency, preferred_date, window_from, window_to, voice_note_path, posted_at, photo_count, thumb_paths';

type Page = { jobs: FeedJob[]; hasMore: boolean; consumed: number };

/**
 * Rows from..from+count of this worker's feed. worker_feed already limits the rows to this worker's trades, phases
 * and non-expired open jobs, hides jobs they engaged with, and carries no resident, phone, plot or address. Order:
 * ASAP first (enum order), then newest, then id so the order never wavers between pages. One row more than
 * `count` is requested to learn whether another page exists. The first two photo paths come in the same row
 * (thumb_paths), so there is no second query for photos.
 */
async function fetchPage(from: number, count: number): Promise<Page | null> {
  const feed = await supabase
    .from('worker_feed')
    .select(COLUMNS)
    .order('urgency', { ascending: true })
    .order('posted_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + count);
  if (feed.error) return null;
  const { rows, hasMore } = splitPage(feed.data ?? [], count);
  const urls = await signedUrlMap('job-media', rows.flatMap((r) => r.thumb_paths ?? []));
  return {
    hasMore,
    consumed: rows.length,
    jobs: rows.map((r) => ({
      id: r.id ?? '',
      title: r.title ?? '',
      description: r.description ?? '',
      categoryId: r.category_id ?? 0,
      phase: r.phase ?? 0,
      lane: r.lane ?? '',
      urgency: r.urgency ?? 'asap',
      preferredDate: r.preferred_date,
      windowFrom: r.window_from,
      windowTo: r.window_to,
      hasVoiceNote: Boolean(r.voice_note_path),
      postedAt: r.posted_at,
      photos: (r.thumb_paths ?? []).map((p) => urls.get(p)).filter((u): u is string => Boolean(u)),
      photoCount: r.photo_count ?? 0,
    })),
  };
}

/** The worker's trades, by name, in one join (categories that have a worker_categories row for this worker). */
async function fetchTrades(): Promise<string[] | null> {
  const { data, error } = await supabase.from('categories').select('name, worker_categories!inner(category_id)').order('sort');
  if (error) return null;
  return (data ?? []).map((c) => c.name);
}

/** The first `count` rows plus the worker's trades, fetched side by side. */
async function fetchFirst(count: number): Promise<FeedState | null> {
  const [page, trades] = await Promise.all([fetchPage(0, count), fetchTrades()]);
  if (!page || !trades) return null;
  return { jobs: page.jobs, trades, hasMore: page.hasMore, consumed: page.consumed };
}

async function fetchMore(current: FeedState): Promise<FeedState | null> {
  const page = await fetchPage(current.consumed, PAGE);
  if (!page) return null;
  return { ...current, jobs: mergeById(current.jobs, page.jobs), hasMore: page.hasMore, consumed: current.consumed + page.consumed };
}

/**
 * The matching feed, a page at a time. Loads when the tab is shown and every time it is shown again (new jobs,
 * changed areas), keeping the list on screen while it reloads. `areaKey` (the worker's chosen phases) re-runs it
 * when the areas change.
 */
export function useFeed(areaKey: string) {
  return usePaged<FeedState>({ pageSize: PAGE, first: fetchFirst, more: fetchMore, key: areaKey });
}
