// Metrics polling hook for the landing page.
//
// Fetches the aggregate activity snapshot on mount and refreshes it on a
// timer, so the Proof network metrics stay live while the hero is open. The
// panel renders skeleton/error states from the hook's status — the API is
// optional, so the landing page degrades gracefully when the server is down.
//
// Performance: the previous snapshot is kept while a refresh is in flight (no
// skeleton flash on every poll), and polling pauses while the tab is hidden.

import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchMetrics, type MetricsSnapshot } from '../lib/analytics';

export type MetricsState =
  | { status: 'loading' }
  | { status: 'ok'; metrics: MetricsSnapshot; at: number }
  | { status: 'error'; error: string };

export function useMetrics(pollMs = 30_000): { state: MetricsState; refresh: () => void } {
  const [state, setState] = useState<MetricsState>({ status: 'loading' });
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const hiddenRef = useRef(false);
  const lastRef = useRef<MetricsState | null>(null);

  const refresh = useCallback(() => {
    if (cancelledRef.current || hiddenRef.current) return;
    const prev = lastRef.current;
    // Keep showing the previous snapshot during a refresh; only fall back to
    // the skeleton when there is nothing to show yet.
    if (!prev) setState({ status: 'loading' });
    fetchMetrics()
      .then((metrics) => {
        if (cancelledRef.current) return;
        const next: MetricsState = { status: 'ok', metrics, at: Date.now() };
        lastRef.current = next;
        setState(next);
      })
      .catch((err: unknown) => {
        if (cancelledRef.current) return;
        if (!prev) setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    timerRef.current = window.setInterval(refresh, pollMs);

    const onVisibility = () => {
      hiddenRef.current = document.visibilityState === 'hidden';
      if (!hiddenRef.current) refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelledRef.current = true;
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh, pollMs]);

  return { state, refresh };
}
