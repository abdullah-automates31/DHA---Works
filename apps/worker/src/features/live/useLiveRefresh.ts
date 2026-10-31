import { useEffect, useRef } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

const QUIET_MS = 400; // several notifications can arrive together; refresh once

/**
 * Calls onChange when a notification row for the signed-in worker is inserted or changed (Realtime, see migration
 * 0020). Job screens refresh from this, because the notification is written in the same transaction as the state
 * change it announces (quote accepted, job cancelled, cash confirmed ...). Pull-to-refresh and refresh-on-focus
 * remain as the fallback when the connection drops.
 */
export function useLiveRefresh(onChange: () => void): void {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const latest = useRef(onChange);

  useEffect(() => {
    latest.current = onChange;
  });

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`notices-${userId}-${Math.random().toString(16).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => latest.current(), QUIET_MS);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}
