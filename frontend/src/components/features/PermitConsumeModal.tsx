import { useEffect, useRef, useState } from 'react';
import { consumePermit, notify } from '../../store/session';
import type { PermitRow } from '../../lib/ledger';
import { FEATURE_META, formatCountdown, msUntil, shortId } from '../../lib/formats';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { IconCheckCircle, IconKey, IconLock, IconZap } from '../icons';

type Phase = 'confirm' | 'proving' | 'confirmed' | 'consumed' | 'error';

const STAGES: ReadonlyArray<{ id: Phase; label: string; hint: string }> = [
  { id: 'proving', label: 'Proving', hint: 'Generating the zero-knowledge proof inside your wallet…' },
  { id: 'confirmed', label: 'Confirmed', hint: 'Proof verified. Transaction accepted by the ledger.' },
  { id: 'consumed', label: 'Consumed', hint: 'Permit consumed on-chain. It cannot be replayed.' },
];

function stageIndex(phase: Phase): number {
  if (phase === 'proving') return 0;
  if (phase === 'confirmed') return 1;
  if (phase === 'consumed') return 2;
  return -1;
}

function featureLabel(feature: string): string {
  const match = Object.values(FEATURE_META).find((f) => f.id === feature);
  return match?.label ?? feature;
}

export function PermitConsumeModal({ permit, onClose }: { permit: PermitRow | null; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const remaining = permit ? msUntil(permit.expiresAt) : 0;

  useEffect(() => {
    cancelRef.current = false;
    if (!permit) return;
    setPhase('confirm');
    setError(null);
  }, [permit]);

  const run = () => {
    if (!permit) return;
    setPhase('proving');
    void (async () => {
      try {
        const res = await consumePermit(permit.feature, permit.id);
        if (cancelRef.current) return;
        if (!res?.txId) {
          setPhase('error');
          setError(res?.extra ?? 'The transaction did not return a receipt. Try again.');
          return;
        }
        setPhase('confirmed');
        await sleep(1400);
        if (cancelRef.current) return;
        setPhase('consumed');
        await sleep(700);
        if (cancelRef.current) return;
        notify('ok', `Permit consumed — ${featureLabel(permit.feature)}`);
        onClose();
      } catch (err) {
        if (cancelRef.current) return;
        setPhase('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  };

  const close = () => {
    cancelRef.current = true;
    onClose();
  };

  const title = phase === 'confirm' ? 'Use this permit?' : 'Consuming permit';
  const active = stageIndex(phase);

  const footer = (
    <>
      {phase === 'confirm' && (
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="success"
            disabled={remaining <= 0}
            onClick={run}
            icon={<IconZap size={14} />}
            autoFocus
          >
            Prove &amp; consume
          </Button>
        </>
      )}
      {phase === 'error' && (
        <Button variant="ghost" onClick={close}>
          Close
        </Button>
      )}
      {(phase === 'proving' || phase === 'confirmed' || phase === 'consumed') && (
        <Button variant="ghost" onClick={close}>
          {phase === 'consumed' ? 'Done' : 'Close'}
        </Button>
      )}
    </>
  );

  return (
    <Modal open={permit !== null} onClose={close} title={title} labelledBy="permit-consume-title" footer={footer}>
      {permit && (
        <div className="permit-consumer" id="permit-consume-title">
          {phase === 'confirm' ? (
            <div className="pc-confirm">
              <p className="muted">
                This consumes the permit <strong>{shortId(permit.id, 12)}</strong> on the Midnight ledger in exchange
                for <strong>{featureLabel(permit.feature)}</strong>. The action is final — consumed permits cannot be
                restored.
              </p>
              <div className="pc-meta">
                <div className="kv">
                  <div className="k">Policy</div>
                  <div className="v">{shortId(permit.policyId, 10)}</div>
                </div>
                <div className="kv">
                  <div className="k">Remaining validity</div>
                  <div className="v">{remaining > 0 ? formatCountdown(remaining) : 'Expired'}</div>
                </div>
                <div className="kv">
                  <div className="k">Proof</div>
                  <div className="v">zero-knowledge</div>
                </div>
              </div>
              <p className="caption" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'var(--sp-3)' }}>
                <IconLock size={12} />
                Nobody learns anything about you beyond “this user holds a valid permit”.
              </p>
            </div>
          ) : phase === 'error' ? (
            <div className="pc-error">
              <p>
                <IconKey size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />
                Consumption failed.
              </p>
              <p className="caption" style={{ marginTop: 6, overflowWrap: 'anywhere' }}>
                {error}
              </p>
            </div>
          ) : (
            <div className="pc-stages" role="status" aria-live="polite">
              {STAGES.map((stage, i) => {
                const state = i < active ? 'done' : i === active ? 'active' : 'todo';
                return (
                  <div className={`pc-stage pc-${state}`} key={stage.id}>
                    <span className="pc-stage-dot">
                      {state === 'done' ? <IconCheckCircle size={14} /> : i + 1}
                    </span>
                    <span className="pc-stage-label">{stage.label}</span>
                    {state === 'active' && <span className="pc-stage-hint">{stage.hint}</span>}
                  </div>
                );
              })}
              <div className="pc-bar" aria-hidden="true">
                <div className={`pc-bar-fill pc-fill-${active}`} />
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
