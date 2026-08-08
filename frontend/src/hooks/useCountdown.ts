// Countdown that ticks once per second. Respects reduced motion by skipping
// the CSS transitions elsewhere; the numeric value still updates so the
// deadline is always accurate.

import { useEffect, useState } from 'react';

export function useCountdown(deadlineMs: number | null): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (deadlineMs === null || deadlineMs <= Date.now()) {
      setNow(Date.now());
      return;
    }
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [deadlineMs]);

  return deadlineMs === null ? 0 : Math.max(0, deadlineMs - now);
}
