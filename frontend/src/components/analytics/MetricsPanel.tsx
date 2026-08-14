// Metrics panel for the cinematic hero (Phase 2 of the landing story).
//
// Renders the aggregate Proof network activity from GET /api/metrics. The API
// is optional — while loading the panel shows skeleton cells, and if the server
// is unreachable it degrades to a quiet "temporarily unavailable" note instead
// of breaking the hero. No wallet data is ever shown here (that export is
// admin-only and never lands on the public landing page).

import { useEffect, useMemo, useRef, useState } from 'react';
import { IconActivity, IconCheck, IconZap } from '../icons';
import type { MetricsSnapshot } from '../../lib/analytics';
import type { MetricsState } from '../../hooks/useMetrics';
import { NETWORK } from '../../lib/env';

type Tile = {
  label: string;
  value: string;
  sub?: string;
  accent?: 'proof' | 'accent';
};

function tiles(m: MetricsSnapshot): Tile[] {
  return [
    { label: 'Wallets', value: m.users.total.toLocaleString(), sub: `${m.users.active} active` },
    {
      label: 'Completed flow',
      value: m.users.completedFlow.toLocaleString(),
      sub: 'full prove → permit journey',
    },
    {
      label: 'Operations',
      value: m.operations.total.toLocaleString(),
      sub: `${m.operations.successful} ok · ${m.operations.failed} failed`,
    },
    {
      label: 'Success rate',
      value: `${m.successRate.toLocaleString()}%`,
      accent: 'proof',
    },
    {
      label: 'Proofs',
      value: m.proofs.generated.toLocaleString(),
      sub: `${m.proofs.verified} verified`,
    },
    {
      label: 'Protected actions',
      value: m.protectedActions.toLocaleString(),
      sub: `${m.permits.created} permits created`,
      accent: 'accent',
    },
  ];
}

export function MetricsPanel({ state, onRetry }: { state: MetricsState; onRetry?: () => void }) {
  return (
    <div className="proof-metrics" aria-label="Proof network activity metrics">
      <div className="proof-metrics__header">
        <span className="proof-metrics__kicker">Live Proof network activity</span>
        <span className="proof-metrics__net">
          <IconActivity size={11} aria-hidden="true" />
          {NETWORK} · Midnight
        </span>
      </div>

      {state.status === 'loading' && (
        <div className="proof-metrics__skeleton" aria-label="Loading metrics">
          <div className="proof-metrics__skeleton-bar" />
          <div className="proof-metrics__skeleton-bar" style={{ width: '72%' }} />
          <div className="proof-metrics__skeleton-bar" style={{ width: '88%' }} />
        </div>
      )}

      {state.status === 'error' && (
        <div className="proof-metrics__error" role="status">
          <p>Metrics temporarily unavailable.</p>
          <span>The analytics server could not be reached.</span>
          {onRetry && (
            <button type="button" className="proof-metrics__retry" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      )}

      {state.status === 'ok' && <MetricsGrid metrics={state.metrics} />}
    </div>
  );
}

function MetricsGrid({ metrics }: { metrics: MetricsSnapshot }) {
  const preprodPct = metrics.preprodTarget > 0 ? Math.min(100, Math.round((metrics.preprodUsers / metrics.preprodTarget) * 100)) : 0;
  return (
    <div className="proof-metrics__body">
      <div className="proof-metrics__target">
        <div className="proof-metrics__target-copy">
          <span className="proof-metrics__target-label">Preprod users</span>
          <span className="proof-metrics__target-value">
            <CountUp value={metrics.preprodUsers.toLocaleString()} /> <em>/ {metrics.preprodTarget.toLocaleString()}</em>
          </span>
        </div>
        <div
          className="proof-metrics__target-track"
          role="progressbar"
          aria-valuenow={metrics.preprodUsers}
          aria-valuemin={0}
          aria-valuemax={metrics.preprodTarget}
          aria-label="Preprod onboarding progress"
        >
          <span className="proof-metrics__target-fill" style={{ width: `${preprodPct}%` }} />
        </div>
        <span className="proof-metrics__target-note">
          <IconCheck size={10} aria-hidden="true" /> Onboarding target on Midnight Preprod
        </span>
      </div>

      <div className="proof-metrics__grid">
        {tiles(metrics).map((tile) => (
          <div className={`proof-metrics__tile${tile.accent ? ` proof-metrics__tile--${tile.accent}` : ''}`} key={tile.label}>
            <span className="proof-metrics__tile-label">{tile.label}</span>
            <span className="proof-metrics__tile-value">
              <CountUp value={tile.value} />
            </span>
            {tile.sub && <span className="proof-metrics__tile-sub">{tile.sub}</span>}
          </div>
        ))}
      </div>

      <div className="proof-metrics__footer">
        <IconZap size={10} aria-hidden="true" />
        Aggregates public operation events only — no identity data is stored.
      </div>
    </div>
  );
}

// Counts up to the displayed value on mount and on refresh. Respects
// prefers-reduced-motion; format is always the real number, never fabricated.
function CountUp({ value }: { value: string }) {
  const parsed = useMemo(() => {
    const match = /^([^0-9]*)([0-9][0-9,.]*)(.*)$/.exec(value);
    if (!match) return { num: NaN, prefix: value, suffix: '' };
    return { num: parseFloat(match[2].replace(/,/g, '')), prefix: match[1], suffix: match[3] };
  }, [value]);

  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const [display, setDisplay] = useState(parsed.num);
  const fromRef = useRef(0);

  useEffect(() => {
    const { num } = parsed;
    if (!Number.isFinite(num) || reduced) {
      setDisplay(num);
      fromRef.current = num;
      return;
    }
    if (fromRef.current === num) return;

    const from = fromRef.current;
    const start = performance.now();
    const duration = 800;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (num - from) * eased);
      setDisplay(current);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = num;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [parsed, reduced]);

  const shown = Number.isFinite(display) ? display.toLocaleString() : '';
  return (
    <>
      {parsed.prefix}
      {shown}
      {parsed.suffix}
    </>
  );
}
