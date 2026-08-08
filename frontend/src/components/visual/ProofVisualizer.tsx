import { useId } from 'react';
import { IconCheck, IconLock } from '../icons';

const NODES = ['Private inputs', 'Witness', 'Circuit', 'ZK proof', 'Verification', 'Permit'] as const;

const NODE_X = [30, 130, 230, 330, 430, 530];

/**
 * Animated proof-generation visualization. Pure SVG + CSS animation:
 * nodes light up in sequence, links draw while work is in progress, and the
 * status list tracks the pipeline. No JavaScript animation loop, no fake
 * progress percentages. Fully disabled under prefers-reduced-motion.
 */
export function ProofVisualizer({
  activeStep,
  status,
}: {
  /** Index of the currently active step (use -1 when idle). */
  activeStep: number;
  /** 'idle' | 'running' | 'done' | 'failed' */
  status: 'idle' | 'running' | 'done' | 'failed';
}) {
  const id = useId().replace(/:/g, '');
  const completed = status === 'done';
  const failed = status === 'failed';

  return (
    <div className="proof-viz" aria-live="polite">
      <svg viewBox="0 0 560 120" role="img" aria-label="Proof generation circuit">
        <defs>
          <marker id={`arrow-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="var(--accent)" />
          </marker>
        </defs>

        {NODE_X.slice(0, -1).map((x, i) => (
          <line
            key={x}
            x1={x + 56}
            y1={40}
            x2={NODE_X[i + 1]! - 4}
            y2={40}
            className={`viz-link ${activeStep > i || completed ? 'complete' : ''}`.trim()}
            stroke={activeStep > i || completed ? 'var(--proof)' : 'var(--border-3)'}
            strokeWidth="1.5"
            markerEnd={`url(#arrow-${id})`}
          />
        ))}

        {NODES.map((label, i) => {
          const active = activeStep === i || completed;
          const past = activeStep > i;
          const x = NODE_X[i]!;
          return (
            <g key={label} className={`viz-node ${active ? 'active' : ''}`.trim()}>
              <circle
                cx={x + 26}
                cy={40}
                r={past || completed ? 11 : 14}
                fill={past || completed ? 'var(--proof-soft)' : failed ? 'var(--err-soft)' : 'var(--bg-3)'}
                stroke={past || completed ? 'var(--proof)' : failed ? 'var(--err)' : active ? 'var(--accent)' : 'var(--border-2)'}
                strokeWidth={active ? 2 : 1.2}
              />
              {completed && (
                <text x={x + 26} y={44} textAnchor="middle" fontSize="13" fill="var(--proof)">
                  ✓
                </text>
              )}
              {failed && i === 4 && (
                <text x={x + 26} y={44} textAnchor="middle" fontSize="13" fill="var(--err)">
                  !
                </text>
              )}
              <text x={x + 26} y={84} textAnchor="middle" fontSize="10.5" fill={active ? 'var(--text-1)' : 'var(--text-4)'} fontWeight={active ? 700 : 500}>
                {label}
              </text>
            </g>
          );
        })}
      </svg>

      <ol className="proof-steps">
        <ProofStep label="Private inputs stay inside the proving environment" state={status === 'idle' ? 'idle' : status === 'done' ? 'done' : 'active'} />
        <ProofStep label="Witness prepared from your signed credential" state={activeStep >= 1 ? (completed ? 'done' : 'active') : 'idle'} />
        <ProofStep label="Circuit asserts issuer signature and policy requirements" state={activeStep >= 2 ? (completed ? 'done' : 'active') : 'idle'} />
        <ProofStep label="Zero-knowledge proof generated" state={activeStep >= 3 ? (completed ? 'done' : 'active') : 'idle'} />
        <ProofStep label="Verifier receives the proof — not your identity" state={activeStep >= 4 ? (completed ? 'done' : 'active') : 'idle'} />
        <ProofStep label={completed ? 'Permit issued' : 'Permit pending'} state={completed ? 'done' : failed ? 'failed' : 'idle'} />
      </ol>

      <p className="caption" style={{ marginTop: 12 }}>
        The wallet generates and verifies this proof locally using the contract&apos;s ZK keys. Only commitments, policy parameters and
        status flags are ever written to the ledger.
      </p>
    </div>
  );
}

function ProofStep({ label, state }: { label: string; state: 'idle' | 'active' | 'done' | 'failed' }) {
  return (
    <li className={`proof-step ${state}`.trim()}>
      <span className="proof-step-dot" aria-hidden="true" />
      {state === 'done' ? <IconCheck size={13} /> : state === 'failed' ? <IconLock size={13} /> : null}
      {label}
    </li>
  );
}
