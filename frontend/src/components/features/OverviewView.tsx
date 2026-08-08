import { useSession, useSessionStatus } from '../../store/session';
import { useMidnight } from '../../hooks/useMidnight';
import { ProofPipeline, type PipelineStage } from '../visual/ProofPipeline';
import { PrivacyBoundary } from '../visual/PrivacyBoundary';
import { DappView } from '../visual/DappView';
import { SetupCard } from './SetupCard';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Reveal } from '../ui/Reveal';
import { IconArrowRight, IconKey, IconShield, IconZap } from '../icons';
import { shortId } from '../../lib/formats';

const STAGES: PipelineStage[] = [
  { icon: 'id', label: 'Identity', name: 'Verified by the KYC provider', kind: 'private' },
  { icon: 'cred', label: 'Private credential', name: 'Issuer-signed, held in your wallet', kind: 'private' },
  { icon: 'zk', label: 'ZK proof', name: 'Generated locally in your wallet', kind: 'transition' },
  { icon: 'elig', label: 'Eligibility', name: 'Predicates verified on Midnight', kind: 'public' },
  { icon: 'permit', label: 'One-time permit', name: 'Public authorization state', kind: 'public' },
  { icon: 'action', label: 'Protected action', name: 'Consumed by the third-party dApp', kind: 'public' },
];

export function OverviewView({ navigate }: { navigate: (route: string) => void }) {
  const { state } = useMidnight();
  const session = useSession();
  const status = useSessionStatus();
  const ready = status === 'ready';
  const { ledger, meta } = session;
  const connected = state.status === 'connected';

  const validPermits = (meta?.myPermits ?? []).filter((p) => p.status === 0).length;

  return (
    <>
      <section className="hero">
        <span className="hero-eyebrow">
          <StatusBadge tone={ready ? 'ok' : 'accent'}>{ready ? 'Live demo instance' : 'Connect to begin'}</StatusBadge>
        </span>
        <h1>
          Prove eligibility. <span className="accent">Not identity.</span>
        </h1>
        <p className="lead">
          {ready
            ? `Your wallet is connected to a ProofGate instance${ledger ? ` at ${shortId(ledger.contractDomain, 10)}` : ''}. Every action below is a zero-knowledge proof — the ledger sees only commitments, policy parameters and status flags.`
            : 'ProofGate lets a service know you qualify — 18+, KYC-complete, in an allowed jurisdiction — without ever learning who you are.'}
        </p>
        <div className="hero-actions">
          {ready ? (
            <>
              <Button variant="primary" size="lg" onClick={() => navigate('prove')} icon={<IconZap size={17} />}>
                Prove eligibility
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate('permits')} icon={<IconKey size={17} />}>
                {validPermits > 0 ? `${validPermits} valid permit${validPermits === 1 ? '' : 's'}` : 'Permit center'}
              </Button>
            </>
          ) : (
            connected && (
              <Button variant="primary" size="lg" onClick={() => navigate('prove')} icon={<IconShield size={17} />}>
                Set up &amp; prove
              </Button>
            )
          )}
        </div>
        <SetupCard />
      </section>

      <Reveal>
        <MetricsStrip />
      </Reveal>

      <Reveal>
        <section style={{ marginTop: 'var(--sp-8)' }}>
          <SectionHead
            title="How a proof flows"
            subtitle="From identity to protected action — and what each party verifies."
          />
          <ProofPipeline stages={STAGES} />
        </section>
      </Reveal>

      <Reveal>
        <section style={{ marginTop: 'var(--sp-8)' }}>
          <SectionHead
            title="What stays private"
            subtitle="Hover or focus any field to see why it can never leave your wallet."
          />
          <PrivacyBoundary />
        </section>
      </Reveal>

      <Reveal>
        <section style={{ marginTop: 'var(--sp-8)' }}>
          <SectionHead
            title="What the application learns"
            subtitle="The dApp receives the outcome of the proof — nothing more."
          />
          <DappView />
          <div className="row-wrap" style={{ marginTop: 'var(--sp-4)' }}>
            <Button variant="ghost" onClick={() => navigate('trust')} icon={<IconArrowRight size={15} />}>
              Deep dive: security &amp; trust
            </Button>
          </div>
        </section>
      </Reveal>
    </>
  );
}

function SectionHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-head">
      <div>
        <h1 style={{ fontSize: 'var(--fs-h2)' }}>{title}</h1>
        {subtitle && <p className="lead">{subtitle}</p>}
      </div>
    </div>
  );
}

function MetricsStrip() {
  const session = useSession();
  const status = useSessionStatus();
  const ready = status === 'ready';
  const l = session.ledger;
  const meta = session.meta;

  const items = [
    { label: 'Active policy', value: ready && l?.activePolicyVersion && l.activePolicyVersion > 0n ? `v${l.activePolicyVersion}` : '—' },
    { label: 'Minimum age', value: l ? l.minimumAge.toString() : '—' },
    { label: 'KYC required', value: l ? `≥ ${l.requiredKycLevel.toString()}` : '—' },
    { label: 'Issuers', value: l ? l.issuers.length.toString() : '—' },
    { label: 'Registered subjects', value: l ? l.subjects.length.toString() : '—' },
    { label: 'Permits issued', value: l ? l.permits.length.toString() : '—' },
    { label: 'Credential', value: meta?.mySubject?.status === 1 ? 'ACTIVE' : '—' },
    { label: 'My valid permits', value: ready && meta ? (meta.myPermits.filter((p) => p.status === 0).length).toString() : '—' },
  ];

  return (
    <div className="metrics" style={{ marginTop: 'var(--sp-5)' }}>
      {items.map((m) => (
        <div className="metric" key={m.label}>
          <div className="metric-value">{m.value}</div>
          <div className="metric-label">{m.label}</div>
        </div>
      ))}
    </div>
  );
}
