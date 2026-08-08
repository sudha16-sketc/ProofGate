import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useSessionBusy,
  useSessionMeta,
  useSessionStatus,
  activateDemoPolicy,
  attestCompliance,
  registerCredential,
  registerDemoIssuer,
  requestPermit,
} from '../../store/session';
import { FEATURE_META, type FeatureId } from '../../lib/formats';
import { FEATURES } from '../../lib/proofgate';
import { Modal } from '../ui/Modal';
import { Stepper } from '../ui/Stepper';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { ProofVisualizer } from '../visual/ProofVisualizer';
import { IconArrowRight, IconLock, IconShieldCheck, IconZap } from '../icons';

type Phase = 'review' | 'running' | 'done' | 'failed';

type FlowStep =
  | { key: 'policy'; label: 'Activate demo policy' }
  | { key: 'issuer'; label: 'Register demo issuer' }
  | { key: 'credential'; label: 'Register credential' }
  | { key: 'attest'; label: 'Attest compliance' }
  | { key: 'permit'; label: 'Request one-time permit' };

/** Advance the visualizer's circuit stage while a call is in flight. */
function useStage(running: boolean): number {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!running) {
      setStage(0);
      return;
    }
    setStage(0);
    const timers = [1, 2, 3].map((i) => window.setTimeout(() => setStage(i), i * 600));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [running]);
  return stage;
}

export function ProveFlow({
  open,
  onClose,
  initialFeature,
  navigate,
}: {
  open: boolean;
  onClose: () => void;
  initialFeature?: FeatureId;
  navigate?: (route: string) => void;
}) {
  const meta = useSessionMeta();
  const status = useSessionStatus();
  const busy = useSessionBusy();
  const [feature, setFeature] = useState<FeatureId>(initialFeature ?? FEATURES.rwaPurchase);
  const [phase, setPhase] = useState<Phase>('review');
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ready = status === 'ready';

  useEffect(() => {
    if (open) {
      setFeature(initialFeature ?? FEATURES.rwaPurchase);
      setPhase('review');
      setStepIndex(0);
      setError(null);
    }
  }, [open, initialFeature]);

  const steps = useMemo<FlowStep[]>(() => {
    const list: FlowStep[] = [];
    if (!meta?.policyActive) list.push({ key: 'policy', label: 'Activate demo policy' });
    if (!meta?.demoIssuerActive) list.push({ key: 'issuer', label: 'Register demo issuer' });
    if (meta?.mySubject?.status !== 1) list.push({ key: 'credential', label: 'Register credential' });
    const notAttested = meta?.mySubject?.attestedPolicyVersion !== meta?.activePolicyVersion;
    if (meta?.mySubject && notAttested) list.push({ key: 'attest', label: 'Attest compliance' });
    list.push({ key: 'permit', label: 'Request one-time permit' });
    return list;
  }, [meta]);

  const stage = useStage(phase === 'running');
  const vizActive = phase === 'running' ? stage : phase === 'done' ? 5 : 0;
  const vizStatus: 'idle' | 'running' | 'done' | 'failed' =
    phase === 'running' ? 'running' : phase === 'done' ? 'done' : phase === 'failed' ? 'failed' : 'idle';

  const run = useCallback(async () => {
    if (!ready) return;
    setPhase('running');
    setError(null);
    setStepIndex(0);

    const runners: Record<FlowStep['key'], () => Promise<unknown>> = {
      policy: () => activateDemoPolicy(),
      issuer: () => registerDemoIssuer(),
      credential: () => registerCredential(),
      attest: () => attestCompliance(),
      permit: () => requestPermit(feature),
    };

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      setStepIndex(i);
      const ok = await runners[step.key]();
      if (ok === null) {
        setPhase('failed');
        return;
      }
      setStepIndex(i + 1);
    }

    setPhase('done');
  }, [ready, steps, feature]);

  const currentLabel = phase === 'running' && steps[stepIndex] ? steps[stepIndex]!.label : undefined;

  return (
    <Modal open={open} onClose={onClose} title="Prove eligibility" size="lg" labelledBy="prove-title">
      {phase === 'review' && (
        <div className="stack" style={{ gap: 'var(--sp-4)' }}>
          <p className="lead">
            Pick what you want to access. ProofGate proves you qualify for the selected feature using the claims in
            your credential — without revealing your identity.
          </p>

          <div className="grid-2" role="radiogroup" aria-label="Choose a feature">
            {Object.values(FEATURE_META).map((metaItem) => {
              const selected = feature === metaItem.id;
              const needsCredential = meta?.mySubject?.status !== 1;
              return (
                <button
                  key={metaItem.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`feature-card ${selected ? 'feature-card-selected' : ''}`.trim()}
                  onClick={() => setFeature(metaItem.id)}
                >
                  <span className="feature-icon">
                    <IconZap size={18} />
                  </span>
                  <h3>{metaItem.label}</h3>
                  <span className="feature-desc">{metaItem.category}</span>
                  <span className="feature-tags">
                    {metaItem.claims.map((c) => (
                      <span className="tag" key={c.label} title={c.hint}>
                        {c.label}
                      </span>
                    ))}
                  </span>
                  {needsCredential && <span className="caption">Requires credential registration first</span>}
                </button>
              );
            })}
          </div>

          {!ready && (
            <StatusBadge tone="warn">The session is not ready — complete setup first.</StatusBadge>
          )}

          <div className="row-between">
            <div className="row" style={{ gap: 8 }}>
              <IconLock size={14} className="muted" />
              <span className="caption">Your identity and attributes never leave the wallet.</span>
            </div>
            <Button
              variant="primary"
              onClick={() => void run()}
              disabled={!ready}
              loading={busy !== null}
              icon={<IconShieldCheck size={16} />}
            >
              Start proof
            </Button>
          </div>
        </div>
      )}

      {phase !== 'review' && (
        <div className="stack" style={{ gap: 'var(--sp-4)' }}>
          <div className="row-between">
            <div className="row" style={{ gap: 8 }}>
              <span className="feature-icon" style={{ width: 'auto' }}>
                <IconZap size={15} />
              </span>
              <strong>{FEATURE_META[feature].label}</strong>
              {currentLabel && <span className="caption muted">· {currentLabel}</span>}
            </div>
            <StatusBadge tone={phase === 'done' ? 'ok' : phase === 'failed' ? 'err' : 'accent'}>
              {phase === 'done' ? 'Permit issued' : phase === 'failed' ? 'Failed' : 'Proving…'}
            </StatusBadge>
          </div>

          <Stepper steps={steps.map((s) => s.label)} current={stepIndex} />

          <ProofVisualizer activeStep={vizActive} status={vizStatus} />

          {phase === 'failed' && (
            <div className="error-state" role="alert">
              <p>
                {error ?? 'The proof could not be completed. Check that the wallet has tNIGHT and tDUST and try again.'}
              </p>
            </div>
          )}

          <div className="row-between">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {phase === 'done' && (
              <Button variant="primary" onClick={() => navigate?.('permits')} icon={<IconArrowRight size={15} />}>
                View permit
              </Button>
            )}
            {phase === 'failed' && (
              <Button variant="primary" onClick={() => void run()}>
                Retry
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
