// Metrics polling hook for the landing page.
//
// Fetches the aggregate activity snapshot on mount and refreshes it on a
// timer, so the Proof network metrics stay live while the hero is open. The
// panel renders skeleton/error states from the hook's status — the API is
// optional, so the landing page degrades gracefully when the server is down.

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

  const refresh = useCallback(() => {
    if (cancelledRef.current) return;
    setState({ status: 'loading' });
    fetchMetrics()
      .then((metrics) => {
        if (cancelledRef.current) return;
        setState({ status: 'ok', metrics, at: Date.now() });
      })
      .catch((err: unknown) => {
        if (cancelledRef.current) return;
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    timerRef.current = window.setInterval(refresh, pollMs);
    return () => {
      cancelledRef.current = true;
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, [refresh, pollMs]);

  return { state, refresh };
}
