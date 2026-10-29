import { useCallback, useEffect, useState } from 'react';

import { isSameDay } from './format';
import { supabase } from '@/lib/supabase';

export type TodayJob = {
  id: string;
  title: string;
  status: string;
  phase: number;
  lane: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  residentName: string | null; // only filled by the database once this worker's quote was accepted
  total: number | null;
};

export type HomeData =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; newJobs: number; today: TodayJob[]; unread: boolean };

async function fetchHome(now: Date): Promise<HomeData> {
  // All three read the caller's own view of the data (security-definer views and own-row policies).
  const [feed, jobs, unread] = await Promise.all([
    supabase.from('worker_feed').select('id', { count: 'exact', head: true }),
    supabase
      .from('worker_jobs')
      .select('id, title, status, phase, lane, scheduled_start, scheduled_end, resident_name, my_quote_total, is_mine')
      .eq('is_mine', true)
      .in('status', ['scheduled', 'in_progress'])
      .order('scheduled_start', { ascending: true }),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
  ]);
  if (feed.error || jobs.error) return { status: 'error' };
  const today = (jobs.data ?? [])
    // Today's work: visits booked for today, plus anything already in progress.
    .filter((j) => j.status === 'in_progress' || isSameDay(j.scheduled_start, now))
    .map((j) => ({
      id: j.id ?? '',
      title: j.title ?? '',
      status: j.status ?? '',
      phase: j.phase ?? 0,
      lane: j.lane ?? '',
      scheduledStart: j.scheduled_start,
      scheduledEnd: j.scheduled_end,
      residentName: j.resident_name,
      total: j.my_quote_total,
    }));
  return { status: 'ready', newJobs: feed.count ?? 0, today, unread: !unread.error && (unread.count ?? 0) > 0 };
}

export function useHome(): { data: HomeData; refresh: () => Promise<void> } {
  const [data, setData] = useState<HomeData>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void fetchHome(new Date()).then((next) => {
      if (active) setData(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setData(await fetchHome(new Date()));
  }, []);

  return { data, refresh };
}
