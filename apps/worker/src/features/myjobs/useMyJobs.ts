import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useLiveRefresh } from '@/features/live/useLiveRefresh';
import { supabase } from '@/lib/supabase';

import { sortJobs, type MyJob } from './rules';

export type MyJobsData = { status: 'loading' } | { status: 'error' } | { status: 'ready'; jobs: MyJob[] };

export const MY_JOB_COLUMNS =
  'id, code, status, title, phase, lane, scheduled_start, scheduled_end, started_at, completed_at, is_mine, my_quote_status, my_quote_total, resident_name, resident_phone, plot_no, floor, cancellation_pending';

type Row = {
  id: string | null;
  code: string | null;
  status: string | null;
  title: string | null;
  phase: number | null;
  lane: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  started_at: string | null;
  completed_at: string | null;
  is_mine: boolean | null;
  my_quote_status: string | null;
  my_quote_total: number | null;
  resident_name: string | null;
  resident_phone: string | null;
  plot_no: string | null;
  floor: string | null;
  cancellation_pending: boolean | null;
};

export function toMyJob(r: Row): MyJob {
  return {
    id: r.id ?? '',
    code: r.code ?? '',
    status: r.status ?? '',
    title: r.title ?? '',
    phase: r.phase ?? 0,
    lane: r.lane ?? '',
    scheduledStart: r.scheduled_start,
    scheduledEnd: r.scheduled_end,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    isMine: r.is_mine,
    myQuoteStatus: r.my_quote_status,
    myQuoteTotal: r.my_quote_total,
    residentName: r.resident_name,
    residentPhone: r.resident_phone,
    plotNo: r.plot_no,
    floor: r.floor,
    cancellationPending: r.cancellation_pending === true,
  };
}

async function fetchMyJobs(): Promise<MyJobsData> {
  // worker_jobs only returns jobs this worker engaged with (interest, quote or won); the resident's name, phone and
  // plot come back only for jobs this worker won. Nothing else is readable.
  const { data, error } = await supabase.from('worker_jobs').select(MY_JOB_COLUMNS).limit(200);
  if (error) return { status: 'error' };
  const jobs = (data ?? []).map((r) => toMyJob(r as Row));
  // Which completed jobs already have this worker's cash amount (row-level security shows only their own rows).
  const completed = jobs.filter((j) => j.status === 'completed' && j.isMine === true).map((j) => j.id);
  if (completed.length > 0) {
    const cash = await supabase.from('cash_records').select('job_id, worker_amount').in('job_id', completed);
    const done = new Set((cash.data ?? []).filter((c) => c.worker_amount !== null).map((c) => c.job_id));
    for (const j of jobs) j.cashRecorded = done.has(j.id);
  }
  return { status: 'ready', jobs: sortJobs(jobs) };
}

/** Loads when the tab opens and each time it is shown again; keeps the list on screen if a reload fails. */
export function useMyJobs(): { data: MyJobsData; refresh: () => Promise<void>; refreshing: boolean } {
  const [data, setData] = useState<MyJobsData>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void fetchMyJobs().then((next) => {
        if (active) setData((current) => (next.status === 'error' && current.status === 'ready' ? current : next));
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const next = await fetchMyJobs();
    setData((current) => (next.status === 'error' && current.status === 'ready' ? current : next));
    setRefreshing(false);
  }, []);

  // A notification (quote accepted, job cancelled, cash confirmed ...) means a job changed: reload quietly.
  useLiveRefresh(() => {
    void fetchMyJobs().then((next) => setData((current) => (next.status === 'error' && current.status === 'ready' ? current : next)));
  });

  return { data, refresh, refreshing };
}
