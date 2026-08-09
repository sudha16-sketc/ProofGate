import { useState } from 'react';
import { useSessionBusy, useSessionMeta, useSessionStatus } from '../../store/session';
import { useCountdown } from '../../hooks/useCountdown';
import { FEATURE_META } from '../../lib/formats';
import { formatCountdown, formatTimestamp, msUntil, shortId } from '../../lib/formats';
import type { PermitRow } from '../../lib/ledger';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Reveal } from '../ui/Reveal';
import { PermitConsumeModal } from './PermitConsumeModal';
import { IconClock, IconKey, IconLock, IconZap } from '../icons';

const PERMIT_STATUS = ['VALID', 'CONSUMED', 'REVOKED'] as const;

function featureLabel(feature: string): string {
  const match = Object.values(FEATURE_META).find((f) => f.id === feature);
  return match?.label ?? feature;
}

export function PermitPanel() {
  const status = useSessionStatus();
  const busy = useSessionBusy();
  const meta = useSessionMeta();
  const [consumeTarget, setConsumeTarget] = useState<PermitRow | null>(null);

  if (status !== 'ready') {
    return (
      <EmptyState
        icon={<IconKey size={20} />}
        title="Permit center"
        description="Connect your wallet and finish session setup to request and manage one-time permits."
      />
    );
  }

  const permits = meta?.myPermits ?? [];

  const validCount = permits.filter((p) => p.status === 0 && msUntil(p.expiresAt) > 0).length;

  return (
    <div className="stack" style={{ gap: 'var(--sp-4)' }}>
      <div className="row-between">
        <div>
          <h1 style={{ fontSize: 'var(--fs-h2)' }}>Your permits</h1>
          <p className="muted">
            Each permit is a one-time authorization produced by a zero-knowledge proof. A fresh salt per permit keeps
            them unlinkable.
          </p>
        </div>
        <span className="badge badge-proof">
          {validCount} valid
        </span>
      </div>

      {permits.length === 0 ? (
        <EmptyState
          icon={<IconKey size={20} />}
          title="No permits yet"
          description="Prove your eligibility to request your first one-time permit."
        />
      ) : (
        <div className="grid-2" style={{ gap: 'var(--sp-4)' }}>
          {permits.map((permit) => (
            <PermitCard key={permit.id} permit={permit} busy={busy !== null} onUse={() => setConsumeTarget(permit)} />
          ))}
        </div>
      )}

      <PermitConsumeModal permit={consumeTarget} onClose={() => setConsumeTarget(null)} />
    </div>
  );
}

function PermitCard({
  permit,
  busy,
  onUse,
}: {
  permit: PermitRow;
  busy: boolean;
  onUse: () => void;
}) {
// `useCountdown` expects an absolute deadline in milliseconds since epoch.
// `permit.expiresAt` is stored as unix seconds, so convert to ms.
const deadlineMs = Number(permit.expiresAt) * 1000;
const remaining = useCountdown(deadlineMs);

const statusValid = permit.status === 0;
const consumed = permit.status === 1;
const revoked = permit.status === 2;

const timeValid = remaining > 0;
const valid = statusValid && timeValid;

const label = revoked
  ? 'REVOKED'
  : consumed
    ? 'CONSUMED'
    : valid
      ? 'VALID'
      : 'EXPIRED';

const expiring = valid && remaining < 5 * 60 * 1000;

  return (
    <Reveal>
      <div className="permit-card" data-status={label}>
        <div className="permit-head">
          <div>
            <div className="permit-title">{featureLabel(permit.feature)}</div>
            <div className="permit-sub">Permit {shortId(permit.id, 10)}</div>
          </div>
          <StatusBadge
  tone={
    valid
      ? 'ok'
      : revoked
        ? 'err'
        : consumed
          ? 'dim'
          : 'warn'
  }
>
  {label}
</StatusBadge>
        </div>

        <div className="permit-meta">
          <PermitMeta k="Policy" v={shortId(permit.policyId, 8)} />
          <PermitMeta k="Issued" v={`seq ${permit.issuedAt.toString()}`} />
          <PermitMeta k="Expires" v={formatTimestamp(permit.expiresAt)} />
          <PermitMeta k="Credential" v={shortId(permit.credId, 8)} />
        </div>

        {valid ? (
  <div className="row-between">
    <span className={`permit-countdown ${expiring ? 'expiring' : ''}`.trim()}>
      <IconClock size={14} />
      Valid for {formatCountdown(remaining)}
    </span>

    <Button
      variant="success"
      size="sm"
      disabled={busy || remaining <= 0 || consumed || revoked}
      loading={busy}
      onClick={onUse}
      icon={<IconZap size={14} />}
    >
      Use permit
    </Button>
  </div>
) : (
  <div className="row-between">
    <span className="permit-countdown">
      <IconClock size={14} />
      {revoked ? 'Revoked' : consumed ? 'Already consumed' : 'Expired'}
    </span>
  </div>
)}

        <p className="caption" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconLock size={12} />
          Consuming this permit proves you hold it — it cannot be replayed or linked to your identity.
        </p>
      </div>
    </Reveal>
  );
}

function PermitMeta({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
