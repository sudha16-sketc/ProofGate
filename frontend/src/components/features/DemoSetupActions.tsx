import { useSessionMeta, useSessionStatus } from '../../store/session';
import { useSessionBusy } from '../../store/session';
import { runDemoSetup } from '../../store/session';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { IconCheck, IconShield } from '../icons';

/**
 * The admin-side demo setup steps (activate policy + register demo issuer).
 * Shown anywhere a user would otherwise fail with "no policy / no issuer".
 */
export function DemoSetupActions() {
  const status = useSessionStatus();
  const busy = useSessionBusy();
  const meta = useSessionMeta();

  if (status !== 'ready') return null;

  const steps = [
    { key: 'policy', label: 'Activate demo policy', done: Boolean(meta?.policyActive) },
    { key: 'issuer', label: 'Register demo issuer', done: Boolean(meta?.demoIssuerActive) },
  ];
  const pending = steps.filter((s) => !s.done);
  if (pending.length === 0) return null;

  return (
    <div className="card">
      <div className="row-between">
        <h3 style={{ margin: 0 }}>Demo setup required</h3>
        <StatusBadge tone="warn">{pending.length} step{pending.length === 1 ? '' : 's'} remaining</StatusBadge>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Registering a credential needs an active policy and a registered issuer. Run the one-click demo setup first —
        both are admin actions proven in zero-knowledge.
      </p>
      <div className="stack-sm" style={{ marginTop: 12, gap: 6 }}>
        {steps.map((s) => (
          <span key={s.key} className="row" style={{ gap: 8 }}>
            {s.done ? (
              <IconCheck size={15} className="status-ok" />
            ) : (
              <IconShield size={15} className="faint" />
            )}
            <span className={s.done ? 'muted' : ''}>{s.label}</span>
            {s.done && <span className="micro">done</span>}
          </span>
        ))}
      </div>
      <div className="row-wrap" style={{ marginTop: 12 }}>
        <Button variant="primary" onClick={() => void runDemoSetup()} loading={busy !== null} icon={<IconShield size={15} />}>
          {busy ? 'Submitting…' : 'One-click demo setup'}
        </Button>
      </div>
    </div>
  );
}
