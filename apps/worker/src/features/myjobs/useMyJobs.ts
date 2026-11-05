import { useLiveRefresh } from '@/features/live/useLiveRefresh';
import { mergeById, splitPage } from '@/lib/paging';
import { supabase } from '@/lib/supabase';
import { usePaged, type Paged } from '@/lib/usePaged';

import { sortJobs, type MyJob } from './rules';

export const MY_JOB_COLUMNS =
  'id, code, status, title, phase, lane, scheduled_start, scheduled_end, started_at, completed_at, is_mine, my_quote_status, my_quote_total, resident_name, resident_phone, plot_no, floor, cancellation_pending, cash_recorded';

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
  cash_recorded: boolean | null;
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
    cashRecorded: r.cash_recorded === true,
  };
}

export const PAGE = 30;

// The worker's own jobs that are still moving. They are always loaded in full, however old, so a job scheduled for
// next month never falls off the list. This set is small by nature (a worker has only a few at a time).
const IN_FLIGHT = ['accepted', 'scheduled', 'in_progress', 'completed', 'disputed'] as const;

type Page = { jobs: MyJob[]; hasMore: boolean; consumed: number };

/**
 * Everything else, newest first, a page at a time. Open, interested and quoted jobs expire within a day, so they are
 * always on the first page; older rows are history. One row more than `count` tells whether another page exists.
 */
async function fetchRecent(from: number, count: number): Promise<Page | null> {
  const { data, error } = await supabase
    .from('worker_jobs')
    .select(MY_JOB_COLUMNS)
    .order('posted_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + count);
  if (error) return null;
  const { rows, hasMore } = splitPage(data ?? [], count);
  return { jobs: rows.map((r) => toMyJob(r as Row)), hasMore, consumed: rows.length };
}

async function fetchInFlight(): Promise<MyJob[] | null> {
  const { data, error } = await supabase.from('worker_jobs').select(MY_JOB_COLUMNS).eq('is_mine', true).in('status', IN_FLIGHT).limit(100);
  if (error) return null;
  return (data ?? []).map((r) => toMyJob(r as Row));
}

type MyJobsState = { jobs: MyJob[]; hasMore: boolean; consumed: number };
export type MyJobsData = Paged<MyJobsState>;

// worker_jobs only returns jobs this worker engaged with (interest, quote or won); the resident's name, phone and
// plot come back only for jobs this worker won. Whether the worker already entered their cash (`cash_recorded`)
// comes in the same row, so there is no second query.
async function fetchFirst(count: number): Promise<MyJobsState | null> {
  const [recent, inFlight] = await Promise.all([fetchRecent(0, count), fetchInFlight()]);
  if (!recent || !inFlight) return null;
  return { jobs: sortJobs(mergeById(inFlight, recent.jobs)), hasMore: recent.hasMore, consumed: recent.consumed };
}

async function fetchMore(current: MyJobsState): Promise<MyJobsState | null> {
  const page = await fetchRecent(current.consumed, PAGE);
  if (!page) return null;
  return { jobs: sortJobs(mergeById(current.jobs, page.jobs)), hasMore: page.hasMore, consumed: current.consumed + page.consumed };
}

/** Loads when the tab opens and each time it is shown again; keeps the list on screen if a reload fails. */
export function useMyJobs() {
  const paged = usePaged<MyJobsState>({ pageSize: PAGE, first: fetchFirst, more: fetchMore });
  // A notification (quote accepted, job cancelled, cash confirmed ...) means a job changed: reload quietly.
  useLiveRefresh(() => void paged.reload());
  return paged;
}
