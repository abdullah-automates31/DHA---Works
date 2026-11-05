import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

// One paging state machine for the lists that grow without bound (open jobs, my jobs, notifications):
//  - loads when the screen is shown and again every time it is shown, keeping the list on screen while it reloads;
//  - a reload fetches as many rows as the worker had already scrolled through, so the list does not jump back;
//  - a failed silent reload keeps what is shown (only a first load can end in the error state);
//  - loadMore adds the next page, ignores taps while a page is loading, and reports a failure so the screen can
//    offer "Try again".
// `consumed` counts the rows taken from the server's paged query (not the rows shown, which merging may reduce).

export type PagedBase = { consumed: number; hasMore: boolean };
export type Paged<R extends PagedBase> = { status: 'loading' } | { status: 'error' } | ({ status: 'ready' } & R);

export function usePaged<R extends PagedBase>(options: {
  pageSize: number;
  /** The first `count` paged rows plus anything else the screen needs; null when the request failed. */
  first: (count: number) => Promise<R | null>;
  /** The next page, merged into `current`; null when the request failed. */
  more: (current: R) => Promise<R | null>;
  /** Changing this re-runs the load (for example the worker's chosen areas). */
  key?: string;
}) {
  const { pageSize, first, more, key } = options;
  const [data, setData] = useState<Paged<R>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const latest = useRef<Paged<R>>({ status: 'loading' });
  const busy = useRef(false);
  // `first` and `more` are re-created on every render by their callers; keep the newest ones without re-running effects.
  const firstRef = useRef(first);
  const moreRef = useRef(more);
  useEffect(() => {
    firstRef.current = first;
    moreRef.current = more;
  });

  const set = useCallback((next: Paged<R>) => {
    latest.current = next;
    setData(next);
  }, []);

  const load = useCallback(async () => {
    const shown = latest.current.status === 'ready' ? latest.current.consumed : 0;
    const next = await firstRef.current(Math.max(pageSize, shown));
    if (next) set({ status: 'ready', ...next });
    else if (latest.current.status !== 'ready') set({ status: 'error' });
  }, [pageSize, set]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const shown = latest.current.status === 'ready' ? latest.current.consumed : 0;
      void firstRef.current(Math.max(pageSize, shown)).then((next) => {
        if (!active) return;
        if (next) set({ status: 'ready', ...next });
        else if (latest.current.status !== 'ready') set({ status: 'error' });
      });
      return () => {
        active = false;
      };
      // `key` is not read inside: it only makes the screen reload when it changes
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, pageSize, set]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const loadMore = useCallback(async () => {
    const current = latest.current;
    if (busy.current || current.status !== 'ready' || !current.hasMore) return;
    busy.current = true;
    setLoadingMore(true);
    setMoreFailed(false);
    const { status: _status, ...state } = current;
    const next = await moreRef.current(state as unknown as R);
    if (next) set({ status: 'ready', ...next });
    else setMoreFailed(true);
    busy.current = false;
    setLoadingMore(false);
  }, [set]);

  /** Changes the rows on screen without a request (for example marking notifications read). */
  const mutate = useCallback(
    (change: (state: R) => R) => {
      const current = latest.current;
      if (current.status !== 'ready') return;
      const { status: _status, ...state } = current;
      set({ status: 'ready', ...change(state as unknown as R) });
    },
    [set],
  );

  return { data, reload: load, refresh, refreshing, loadMore, loadingMore, moreFailed, mutate };
}
