import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabase';

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

export type FeedData =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; jobs: FeedJob[]; trades: string[] };

const PAGE = 50;

async function fetchFeed(): Promise<FeedData> {
  // worker_feed already limits the rows to this worker's trades, phases and non-expired open jobs, hides jobs they
  // engaged with, and carries no resident, phone, plot or address. Order: ASAP first (enum order), then newest.
  const [feed, mine, categories] = await Promise.all([
    supabase
      .from('worker_feed')
      .select('id, title, description, category_id, phase, lane, urgency, preferred_date, window_from, window_to, voice_note_path, posted_at, photo_count')
      .order('urgency', { ascending: true })
      .order('posted_at', { ascending: false })
      .limit(PAGE),
    supabase.from('worker_categories').select('category_id'),
    supabase.from('categories').select('id, name').order('sort'),
  ]);
  if (feed.error || mine.error || categories.error) return { status: 'error' };

  const rows = feed.data ?? [];
  const ids = rows.map((r) => r.id).filter((id): id is string => id !== null);

  // Thumbnails: the first two photos of each job, signed for an hour. A photo problem never hides a job.
  const urls = new Map<string, string[]>();
  if (ids.length > 0) {
    const photos = await supabase.from('job_photos').select('job_id, storage_path, sort').in('job_id', ids).lt('sort', 2).order('sort');
    if (!photos.error && photos.data && photos.data.length > 0) {
      const signed = await supabase.storage.from('job-media').createSignedUrls(
        photos.data.map((p) => p.storage_path),
        3600,
      );
      const byPath = new Map<string, string>();
      for (const item of signed.data ?? []) if (item.path && item.signedUrl) byPath.set(item.path, item.signedUrl);
      for (const p of photos.data) {
        const url = byPath.get(p.storage_path);
        if (url) urls.set(p.job_id, [...(urls.get(p.job_id) ?? []), url]);
      }
    }
  }

  const mineIds = new Set((mine.data ?? []).map((m) => m.category_id));
  const trades = (categories.data ?? []).filter((c) => mineIds.has(c.id)).map((c) => c.name);

  return {
    status: 'ready',
    trades,
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
      photos: urls.get(r.id ?? '') ?? [],
      photoCount: r.photo_count ?? 0,
    })),
  };
}

/**
 * Loads the feed when the tab is first shown and again every time it is shown (new jobs, changed areas), keeping
 * the list on screen while it reloads. `areaKey` (the worker's chosen phases) re-runs it when the areas change.
 */
export function useFeed(areaKey: string): { data: FeedData; refresh: () => Promise<void>; refreshing: boolean } {
  const [data, setData] = useState<FeedData>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void fetchFeed().then((next) => {
        // A failed silent reload keeps what is already shown; only a first load can end in the error state.
        if (active) setData((current) => (next.status === 'error' && current.status === 'ready' ? current : next));
      });
      return () => {
        active = false;
      };
    // areaKey is not read inside: it only makes the tab reload when the worker saves different phases
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [areaKey]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const next = await fetchFeed();
    setData((current) => (next.status === 'error' && current.status === 'ready' ? current : next));
    setRefreshing(false);
  }, []);

  return { data, refresh, refreshing };
}
