import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useLiveRefresh } from '@/features/live/useLiveRefresh';
import { supabase } from '@/lib/supabase';

import type { Notice } from './rules';

export type NoticesData = { status: 'loading' } | { status: 'error' } | { status: 'ready'; notices: Notice[] };

async function fetchNotices(): Promise<NoticesData> {
  // Row-level security returns only the signed-in user's own notifications.
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, job_id, payload, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return { status: 'error' };
  return {
    status: 'ready',
    notices: (data ?? []).map((r) => ({
      id: r.id,
      type: r.type,
      jobId: r.job_id,
      payload: r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload) ? (r.payload as Record<string, unknown>) : null,
      readAt: r.read_at,
      createdAt: r.created_at,
    })),
  };
}

export function useNotifications() {
  const [data, setData] = useState<NoticesData>({ status: 'loading' });

  const load = useCallback(async () => {
    const next = await fetchNotices();
    setData((current) => (next.status === 'error' && current.status === 'ready' ? current : next));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useLiveRefresh(() => void load());

  /** Marks the given notifications (or all unread when ids is omitted) as read, then updates the list in place. */
  const markRead = useCallback(async (ids?: string[]) => {
    const { error } = await supabase.rpc('mark_notifications_read', ids ? { p_ids: ids } : {});
    if (error) return false;
    const stamp = new Date().toISOString();
    setData((current) =>
      current.status === 'ready'
        ? { status: 'ready', notices: current.notices.map((n) => (n.readAt === null && (!ids || ids.includes(n.id)) ? { ...n, readAt: stamp } : n)) }
        : current,
    );
    return true;
  }, []);

  return { data, reload: load, markRead };
}
