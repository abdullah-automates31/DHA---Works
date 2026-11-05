import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const QUIET_MS = 400; // several notifications can arrive together; refresh once

/**
 * Calls onChange when a new notification row for the signed-in worker arrives (Realtime, see migration 0020). Job
 * screens refresh from this, because the notification is written in the same transaction as the state change it
 * announces (quote accepted, job cancelled, cash confirmed ...). Pull-to-refresh and refresh-on-focus remain as the
 * fallback when the connection drops.
 *
 * Two rules keep this cheap (docs/PERFORMANCE.md):
 * - only INSERT counts. Marking notifications as read is an UPDATE and changes no job, so it must not reload screens;
 * - the channel lives only while the screen is in front. Tab screens stay mounted, so otherwise four to six
 *   channels would all reload on every notification. A screen that comes back to the front reloads anyway.
 */
export function useLiveRefresh(onChange: () => void): void {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const latest = useRef(onChange);

  useEffect(() => {
    latest.current = onChange;
  });

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const channel = supabase
        .channel(`notices-${userId}-${Math.random().toString(16).slice(2, 8)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => latest.current(), QUIET_MS);
        })
        .subscribe();
      return () => {
        if (timer) clearTimeout(timer);
        void supabase.removeChannel(channel);
      };
    }, [userId]),
  );
}
