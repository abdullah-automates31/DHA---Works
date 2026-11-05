import { useCallback } from 'react';

import { useLiveRefresh } from '@/features/live/useLiveRefresh';
import { mergeById, splitPage } from '@/lib/paging';
import { supabase } from '@/lib/supabase';
import { usePaged, type Paged } from '@/lib/usePaged';

import type { Notice } from './rules';

type NoticesState = { notices: Notice[]; hasMore: boolean; consumed: number };
export type NoticesData = Paged<NoticesState>;

export const PAGE = 30;

type Page = { notices: Notice[]; hasMore: boolean; consumed: number };

async function fetchPage(from: number, count: number): Promise<Page | null> {
  // Row-level security returns only the signed-in user's own notifications. Newest first; id keeps the order stable
  // between pages (several notifications can share one timestamp). One extra row tells whether another page exists.
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, job_id, payload, read_at, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + count);
  if (error) return null;
  const { rows, hasMore } = splitPage(data ?? [], count);
  return {
    hasMore,
    consumed: rows.length,
    notices: rows.map((r) => ({
      id: r.id,
      type: r.type,
      jobId: r.job_id,
      payload: r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload) ? (r.payload as Record<string, unknown>) : null,
      readAt: r.read_at,
      createdAt: r.created_at,
    })),
  };
}

async function fetchFirst(count: number): Promise<NoticesState | null> {
  return fetchPage(0, count);
}

async function fetchMore(current: NoticesState): Promise<NoticesState | null> {
  const page = await fetchPage(current.consumed, PAGE);
  if (!page) return null;
  return { notices: mergeById(current.notices, page.notices), hasMore: page.hasMore, consumed: current.consumed + page.consumed };
}

export function useNotifications() {
  const paged = usePaged<NoticesState>({ pageSize: PAGE, first: fetchFirst, more: fetchMore });
  const { reload, mutate } = paged;
  useLiveRefresh(() => void reload());

  /** Marks the given notifications (or all unread when ids is omitted) as read, then updates the list in place. */
  const markRead = useCallback(
    async (ids?: string[]) => {
      const { error } = await supabase.rpc('mark_notifications_read', ids ? { p_ids: ids } : {});
      if (error) return false;
      const stamp = new Date().toISOString();
      mutate((state) => ({
        ...state,
        notices: state.notices.map((n) => (n.readAt === null && (!ids || ids.includes(n.id)) ? { ...n, readAt: stamp } : n)),
      }));
      return true;
    },
    [mutate],
  );

  return { data: paged.data, reload, markRead, loadMore: paged.loadMore, loadingMore: paged.loadingMore, moreFailed: paged.moreFailed };
}
