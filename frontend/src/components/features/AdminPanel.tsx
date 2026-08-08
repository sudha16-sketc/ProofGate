import { useState } from 'react';
import {
  useSessionBusy,
  useSessionLedger,
  useSessionMeta,
  useSessionStatus,
  activateDemoPolicy,
  registerDemoIssuer,
  revokeCredentialAction,
  revokePermitAction,
  rotateAdminAction,
  setIssuerStatusAction,
  setPolicyAction,
  setSubjectStatusAction,
  unrevokeCredentialAction,
} from '../../store/session';
import { DemoSetupActions } from './DemoSetupActions';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { Reveal } from '../ui/Reveal';
import { IconGavel, IconShieldLock } from '../icons';
import { shortId } from '../../lib/formats';
import { JURISDICTION_LABELS } from '../../lib/formats';
import { DEFAULT_POLICY_ID, JURISDICTIONS } from '../../lib/proofgate';

const STATUS_OPTIONS = [
  { value: '1', label: 'ACTIVE' },
  { value: '2', label: 'SUSPENDED' },
  { value: '3', label: 'REVOKED' },
];

export function AdminPanel() {
  const status = useSessionStatus();
  const busy = useSessionBusy();
  const meta = useSessionMeta();

  if (status !== 'ready' || !meta) {
    return (
      <EmptyState
        icon={<IconGavel size={20} />}
        title="Admin"
        description="Connect your wallet and finish session setup to use governance actions."
      />
    );
  }

  if (!meta.isAdmin) {
    return (
      <EmptyState
        icon={<IconShieldLock size={20} />}
        title="Not the admin"
        description="This wallet's session secret does not match the deployed admin commitment, so governance actions are unavailable."
      />
    );
  }

  const issuing = busy !== null;

  return (
    <div className="stack" style={{ gap: 'var(--sp-5)' }}>
      <div className="row-between">
        <div>
          <h1 style={{ fontSize: 'var(--fs-h2)' }}>Governance</h1>
          <p className="muted">
            Admin actions proven in zero-knowledge. Only the holder of the deployment secret can run them.
          </p>
        </div>
        <StatusBadge tone="ok">Admin session</StatusBadge>
      </div>

      <DemoSetupActions />

      <Reveal>
        <Card pad="sm">
          <div className="row-between">
            <div>
              <h3 style={{ margin: 0 }}>Demo quick actions</h3>
              <p className="muted">The two one-click setup steps, plus admin key rotation.</p>
            </div>
          </div>
          <div className="row-wrap" style={{ marginTop: 12 }}>
            <Button variant="outline" onClick={() => void activateDemoPolicy()} disabled={issuing} loading={busy === 'Activate demo policy'}>
              Activate demo policy
            </Button>
            <Button variant="outline" onClick={() => void registerDemoIssuer()} disabled={issuing} loading={busy === 'Register demo issuer'}>
              Register demo issuer
            </Button>
            <Button variant="danger" onClick={() => void rotateAdminAction()} disabled={issuing} loading={busy === 'Rotate admin key'}>
              Rotate admin key
            </Button>
          </div>
        </Card>
      </Reveal>

      <IssuerControls busy={issuing} />
      <SubjectControls busy={issuing} />
      <CredentialControls busy={issuing} />
      <PermitControls busy={issuing} />
      <PolicyControls busy={issuing} />
    </div>
  );
}

function IssuerControls({ busy }: { busy: boolean }) {
  const ledger = useSessionLedger();
  const [id, setId] = useState<string>('');
  const [status, setStatus] = useState('1');
  const issuers = ledger?.issuers ?? [];
  const issuer = issuers.find((i) => i.id === id);

  return (
    <Reveal>
      <Card pad="sm">
        <h3 style={{ margin: 0 }}>Issuer status</h3>
        <p className="muted">Suspend or revoke a registered KYC issuer.</p>
        <div className="row-wrap" style={{ marginTop: 12 }}>
          <select value={id} onChange={(e) => setId(e.target.value)} aria-label="Issuer">
            <option value="">Select issuer…</option>
            {issuers.map((i) => (
              <option key={i.id} value={i.id}>
                {shortId(i.id, 10)}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="New status">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            disabled={!issuer || busy}
            onClick={() => issuer && void setIssuerStatusAction(issuer.pkX, issuer.pkY, Number(status))}
          >
            Update status
          </Button>
        </div>
      </Card>
    </Reveal>
  );
}

function SubjectControls({ busy }: { busy: boolean }) {
  const ledger = useSessionLedger();
  const [pk, setPk] = useState('');
  const [status, setStatus] = useState('1');
  const subjects = ledger?.subjects ?? [];

  return (
    <Reveal>
      <Card pad="sm">
        <h3 style={{ margin: 0 }}>Subject status</h3>
        <p className="muted">Manage a registered subject by pseudonym.</p>
        <div className="row-wrap" style={{ marginTop: 12 }}>
          <select value={pk} onChange={(e) => setPk(e.target.value)} aria-label="Subject">
            <option value="">Select subject…</option>
            {subjects.map((s) => (
              <option key={s.pk} value={s.pk}>
                {shortId(s.pk, 10)}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="New status">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button variant="outline" disabled={!pk || busy} onClick={() => void setSubjectStatusAction(pk, Number(status))}>
            Update status
          </Button>
        </div>
      </Card>
    </Reveal>
  );
}

function CredentialControls({ busy }: { busy: boolean }) {
  const ledger = useSessionLedger();
  const subjects = ledger?.subjects ?? [];
  const revoked = new Set(ledger?.revoked ?? []);
  const [credId, setCredId] = useState('');

  return (
    <Reveal>
      <Card pad="sm">
        <h3 style={{ margin: 0 }}>Credential revocation</h3>
        <p className="muted">Add or remove a credential id from the on-chain revocation set.</p>
        <div className="row-wrap" style={{ marginTop: 12 }}>
          <select value={credId} onChange={(e) => setCredId(e.target.value)} aria-label="Credential">
            <option value="">Select credential…</option>
            {subjects.map((s) => (
              <option key={s.credId} value={s.credId}>
                {shortId(s.credId, 10)}
                {revoked.has(s.credId) ? ' (revoked)' : ''}
              </option>
            ))}
          </select>
          <Button variant="danger" disabled={!credId || revoked.has(credId) || busy} onClick={() => void revokeCredentialAction(credId)}>
            Revoke
          </Button>
          <Button variant="outline" disabled={!credId || !revoked.has(credId) || busy} onClick={() => void unrevokeCredentialAction(credId)}>
            Un-revoke
          </Button>
        </div>
      </Card>
    </Reveal>
  );
}

function PermitControls({ busy }: { busy: boolean }) {
  const ledger = useSessionLedger();
  const permits = ledger?.permits ?? [];
  const [permitId, setPermitId] = useState('');

  return (
    <Reveal>
      <Card pad="sm">
        <h3 style={{ margin: 0 }}>Permit revocation</h3>
        <p className="muted">Revoke a one-time permit before it is consumed.</p>
        <div className="row-wrap" style={{ marginTop: 12 }}>
          <select value={permitId} onChange={(e) => setPermitId(e.target.value)} aria-label="Permit">
            <option value="">Select permit…</option>
            {permits.map((p) => (
              <option key={p.id} value={p.id}>
                {p.feature} · {shortId(p.id, 8)}
              </option>
            ))}
          </select>
          <Button variant="danger" disabled={!permitId || busy} onClick={() => void revokePermitAction(permitId)}>
            Revoke permit
          </Button>
        </div>
      </Card>
    </Reveal>
  );
}

function PolicyControls({ busy }: { busy: boolean }) {
  const ledger = useSessionLedger();
  const active = ledger?.activePolicyId ?? DEFAULT_POLICY_ID;
  const [policyId, setPolicyId] = useState(active);
  const [version, setVersion] = useState((ledger?.activePolicyVersion ?? 1n) + 1n);
  const [minAge, setMinAge] = useState(ledger?.minimumAge ?? 18n);
  const [kycLevel, setKycLevel] = useState(ledger?.requiredKycLevel ?? 1n);
  const [credVersion, setCredVersion] = useState(ledger?.requiredCredentialVersion ?? 1n);
  const [juris, setJuris] = useState<string[]>(() => {
    const committed = ledger?.jurisdictionCommitment ?? '';
    return JURISDICTIONS.filter((c) => committed.toLowerCase().includes(c.toLowerCase()));
  });

  const toggleJuris = (code: string) =>
    setJuris((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const submit = () => {
    if (juris.length === 0) return;
    void setPolicyAction({
      policyId: policyId.trim() || DEFAULT_POLICY_ID,
      version,
      minAge,
      kycLevel,
      credVersion,
      jurisdictions: juris,
    });
  };

  return (
    <Reveal>
      <Card pad="sm">
        <div className="row-between">
          <div>
            <h3 style={{ margin: 0 }}>Policy configuration</h3>
            <p className="muted">
              Set the eligibility rules the ZK circuit enforces. Jurisdictions become a commitment on-chain.
            </p>
          </div>
          <StatusBadge tone="dim">admin</StatusBadge>
        </div>

        <div className="policy-grid" style={{ marginTop: 14 }}>
          <label className="field">
            <span className="k caption">Policy id</span>
            <input value={policyId} onChange={(e) => setPolicyId(e.target.value)} aria-label="Policy id" />
          </label>
          <label className="field">
            <span className="k caption">Version</span>
            <input
              type="number"
              min={1}
              value={version.toString()}
              onChange={(e) => setVersion(BigInt(Math.max(1, Number(e.target.value))))}
              aria-label="Policy version"
            />
          </label>
          <label className="field">
            <span className="k caption">Minimum age</span>
            <input
              type="number"
              min={0}
              value={minAge.toString()}
              onChange={(e) => setMinAge(BigInt(Math.max(0, Number(e.target.value))))}
              aria-label="Minimum age"
            />
          </label>
          <label className="field">
            <span className="k caption">Required KYC level</span>
            <input
              type="number"
              min={0}
              value={kycLevel.toString()}
              onChange={(e) => setKycLevel(BigInt(Math.max(0, Number(e.target.value))))}
              aria-label="Required KYC level"
            />
          </label>
          <label className="field">
            <span className="k caption">Credential version</span>
            <input
              type="number"
              min={0}
              value={credVersion.toString()}
              onChange={(e) => setCredVersion(BigInt(Math.max(0, Number(e.target.value))))}
              aria-label="Credential version"
            />
          </label>
          <fieldset className="field" style={{ border: 'none', padding: 0 }}>
            <legend className="k caption">Allowed jurisdictions</legend>
            <div className="row-wrap" style={{ gap: 6, marginTop: 4 }}>
              {JURISDICTIONS.map((code) => (
                <label key={code} className="chip">
                  <input
                    type="checkbox"
                    checked={juris.includes(code)}
                    onChange={() => toggleJuris(code)}
                    aria-label={`Allow ${JURISDICTION_LABELS[code] ?? code}`}
                  />
                  {code}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="row-between" style={{ marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
          <p className="caption" style={{ margin: 0, maxWidth: 420 }}>
            Current on-chain: v{(ledger?.activePolicyVersion ?? 1n).toString()}, age ≥{' '}
            {(ledger?.minimumAge ?? 18n).toString()}, KYC ≥ {(ledger?.requiredKycLevel ?? 1n).toString()}.
          </p>
          <Button variant="outline" disabled={busy || juris.length === 0} onClick={submit}>
            Apply policy
          </Button>
        </div>
      </Card>
    </Reveal>
  );
}
