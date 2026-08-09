import { useRef, useState } from 'react';
import {
  notify,
  registerCredential,
  useSessionBusy,
  useSessionMeta,
  useSessionStatus,
} from '../../store/session';
import { PrivacyBoundary } from '../visual/PrivacyBoundary';
import { DemoSetupActions } from './DemoSetupActions';
import { Reveal } from '../ui/Reveal';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { DataTable } from '../ui/DataTable';
import { CopyButton } from '../ui/CopyButton';
import { Stepper } from '../ui/Stepper';
import { IconCertificate, IconCheckCircle, IconLock, IconZap } from '../icons';
import { formatTimestamp } from '../../lib/formats';

const CLAIMS = [
  { label: 'Issuer signature valid & issued this credential', hint: 'Jubjub signature verified in-circuit' },
  { label: 'Key possession', hint: 'You hold the subject key the issuer signed' },
  { label: 'Signed claims bound to the credential', hint: 'Every signed slot is checked against the witness in-circuit' },
  { label: 'Not expired / not revoked', hint: 'Checked against public state' },
  { label: 'Age ≥ policy minimum', hint: 'Proven in-circuit at registration, exact value hidden' },
  { label: 'KYC level ≥ policy requirement', hint: 'Proven in-circuit at registration, level hidden' },
  { label: 'Jurisdiction in allowed list', hint: 'Proven in-circuit at registration, value hidden' },
];

export function CredentialPanel() {
  const status = useSessionStatus();
  const busy = useSessionBusy();
  const meta = useSessionMeta();

  if (status !== 'ready') {
    return (
      <div className="card">
        <h3>Credential</h3>
        <p className="muted">
          Once the session is ready, this page shows the issuer-signed credential held privately by your wallet.
        </p>
      </div>
    );
  }

  const subject = meta?.mySubject ?? null;
  const active = subject?.status === 1;

  return (
    <>
      <DemoSetupActions />

      <div className="grid-2" style={{ gap: 'var(--sp-4)' }}>
        <Reveal>
          <div className="card">
            <div className="row-between">
              <div className="row" style={{ gap: 10 }}>
                <span className="badge badge-proof">
                  <IconCertificate size={16} />
                </span>
                <h3 style={{ margin: 0 }}>Credential</h3>
              </div>
              <StatusBadge tone={active ? 'ok' : 'warn'}>{active ? 'ACTIVE' : 'NOT REGISTERED'}</StatusBadge>
            </div>

            {active && subject ? (
              <div className="stack-sm" style={{ gap: 10, marginTop: 16 }}>
                <CredRow k="Pseudonym (public)" v={meta!.myPseudonym} mono copyable />
                <CredRow k="Credential id" v={subject.credId} mono copyable />
                <CredRow k="Issuer id" v={subject.issuerId} mono copyable />
                <CredRow k="KYC level" v={`≥ ${subject.kycLevel.toString()}`} />
                <CredRow k="Policy version" v={`v${subject.policyVersion.toString()}`} />
                <CredRow k="Registered" v={formatTimestamp(subject.registeredAt)} />
                <CredRow k="Expires" v={formatTimestamp(subject.expiresAt)} />
              </div>
            ) : (
              <>
                <p className="muted" style={{ marginTop: 12 }}>
                  Register your credential to bind the issuer-signed claims to your wallet. The signature is verified
                  in-circuit — it is never written to the ledger.
                </p>
                <div className="row-wrap" style={{ marginTop: 12 }}>
                  <Button
                    variant="primary"
                    onClick={() => void registerCredential()}
                    loading={busy !== null}
                    icon={<IconCheckCircle size={16} />}
                  >
                    {busy ? 'Proving…' : 'Register credential'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Reveal>

        <Reveal delay={1}>
          <div className="card">
            <h3>What this credential proves</h3>
            <p className="muted">Each check runs inside the zero-knowledge circuit:</p>
            <DataTable
              columns={[
                { key: 'claim', label: 'Proven claim' },
                { key: 'hint', label: 'How' },
              ]}
              rows={CLAIMS.map((c, i) => ({ key: `${c.label}-${i}`, claim: c.label, hint: c.hint }))}
            />
          </div>
        </Reveal>
      </div>

      <Reveal>
        <section style={{ marginTop: 'var(--sp-8)' }}>
          <div className="section-head">
            <div>
              <h1 style={{ fontSize: 'var(--fs-h2)' }}>Fields in your credential</h1>
              <p className="lead">Everything below the boundary is private to your wallet — even the issuer cannot see it afterwards.</p>
            </div>
          </div>
          <PrivacyBoundary />
        </section>
      </Reveal>

      {!active && <IssuanceWizard />}

      <Reveal>
        <p className="muted" style={{ marginTop: 'var(--sp-5)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconLock size={13} />
          Privacy invariant: an on-chain observer sees only the pseudonym and credential id — never your identity,
          jurisdiction, age, or the signature.
        </p>
      </Reveal>
    </>
  );
}

const ISSUANCE_STEPS: ReadonlyArray<{ label: string; desc: string }> = [
  { label: 'Request', desc: 'Your wallet asks the issuer to sign your claims.' },
  { label: 'Consent', desc: 'You approve exactly which claims are shared — nothing else.' },
  { label: 'Signature', desc: 'The issuer signs the claims. The signature stays in your wallet.' },
  { label: 'ZK proof', desc: 'Your wallet proves it holds the signed claims, in-circuit.' },
  { label: 'Register', desc: 'The proof is submitted to the Midnight ledger.' },
  { label: 'Registered', desc: 'The credential id is public; your attributes are not.' },
];

function IssuanceWizard() {
  const busy = useSessionBusy();
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const alive = useRef(true);

  const run = () => {
    if (running) return;
    setDone(false);
    setRunning(true);
    void (async () => {
      for (let i = 0; i < 3; i++) {
        await sleep(1150);
        if (!alive.current) return;
        setStep(i + 1);
      }
      try {
        const res = await registerCredential();
        if (!alive.current) return;
        if (!res?.txId) {
          notify('error', res?.extra ?? 'Credential registration did not return a receipt.');
          setStep(3);
          setRunning(false);
          return;
        }
        setStep(4);
        await sleep(900);
        if (!alive.current) return;
        setStep(5);
        setDone(true);
        setRunning(false);
        notify('ok', 'Credential registered — it is now active on the ledger.');
      } catch (err) {
        if (!alive.current) return;
        notify('error', err instanceof Error ? err.message : String(err));
        setStep(3);
        setRunning(false);
      }
    })();
  };

  return (
    <Reveal>
      <section style={{ marginTop: 'var(--sp-8)' }}>
        <div className="section-head">
          <div>
            <h1 style={{ fontSize: 'var(--fs-h2)' }}>How a credential is issued</h1>
            <p className="lead">Six steps, end to end — from your wallet to the Midnight ledger.</p>
          </div>
        </div>
        <div className="card">
          <Stepper steps={ISSUANCE_STEPS.map((s) => s.label)} current={done ? 5 : step} />
          <div className="row-between" style={{ marginTop: 18, alignItems: 'flex-start' }}>
            <p className="muted" style={{ maxWidth: 460, margin: 0 }}>
              {ISSUANCE_STEPS[done ? 5 : step]?.desc}
            </p>
            {!done && (
              <Button variant="primary" onClick={run} loading={running} disabled={busy !== null} icon={<IconZap size={15} />}>
                {running ? 'Issuing…' : 'Start issuance'}
              </Button>
            )}
          </div>
        </div>
      </section>
    </Reveal>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function CredRow({ k, v, mono, copyable }: { k: string; v: string; mono?: boolean; copyable?: boolean }) {
  return (
    <div className="row-between" style={{ gap: 12 }}>
      <span className="k caption">{k}</span>
      <span className={`row mono truncate ${mono ? '' : ''}`.trim()} style={{ gap: 8, minWidth: 0, maxWidth: '70%' }}>
        <span className={`truncate ${mono ? 'mono' : ''}`.trim()} style={{ overflowWrap: 'anywhere' }}>
          {v}
        </span>
        {copyable && <CopyButton text={v} label="" />}
      </span>
    </div>
  );
}
