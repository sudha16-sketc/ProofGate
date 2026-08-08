import { useMidnight } from '../../hooks/useMidnight';
import { NETWORK } from '../../lib/env';
import { ProofPipeline, type PipelineStage } from '../visual/ProofPipeline';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { IconCheck, IconGlobe, IconLock, IconShield, IconWallet, IconX, IconZap } from '../icons';

const STAGES: PipelineStage[] = [
  { icon: 'id', label: 'Identity', name: 'Verified by the KYC provider', kind: 'private' },
  { icon: 'cred', label: 'Private credential', name: 'Issuer-signed, held in your wallet', kind: 'private' },
  { icon: 'zk', label: 'ZK proof', name: 'Generated locally in your wallet', kind: 'transition' },
  { icon: 'elig', label: 'Eligibility', name: 'Predicates verified on Midnight', kind: 'public' },
  { icon: 'permit', label: 'One-time permit', name: 'Public authorization state', kind: 'public' },
  { icon: 'action', label: 'Protected action', name: 'Consumed by the third-party dApp', kind: 'public' },
];

/**
 * Landing hero + connect CTA, shown whenever the wallet is not connected.
 * The pipeline and honesty copy are visible before any wallet exists so the
 * privacy model is clear up front.
 */
export function ConnectView({ navigate }: { navigate: (route: string) => void }) {
  const { state, connect, network, clearError } = useMidnight();
  const connecting = state.status === 'connecting';

  return (
    <>
      <section className="hero">
        <span className="hero-eyebrow">
          <StatusBadge tone={connecting ? 'dim' : 'accent'}>
            {connecting ? 'Connecting…' : `Powered by Midnight · ${NETWORK}`}
          </StatusBadge>
        </span>
        <h1>
          Prove eligibility. <span className="accent">Not identity.</span>
        </h1>
        <p className="lead">
          ProofGate lets a service know you qualify — 18+, KYC-complete, in an allowed jurisdiction — without ever
          learning your name, age, or where you live. Every action is a zero-knowledge proof; the ledger stores only
          commitments and status flags.
        </p>
        <div className="hero-actions">
          <Button variant="primary" size="lg" onClick={connect} loading={connecting} icon={<IconWallet size={17} />}>
            {connecting ? 'Connecting…' : `Connect wallet (${network})`}
          </Button>
          <Button variant="outline" size="lg" onClick={() => navigate('trust')} icon={<IconShield size={17} />}>
            How trust works
          </Button>
        </div>
        {state.status === 'error' && (
          <div className="error-state" role="alert">
            <p>{state.error}</p>
            <Button variant="ghost" size="sm" onClick={clearError}>
              Dismiss
            </Button>
          </div>
        )}
        <p className="hero-honesty">
          <IconLock size={13} />
          In this demo, a built-in demo issuer signs your claims. Your age, jurisdiction, and signature never leave
          your wallet.
        </p>
      </section>

      <Section title="What happens after you connect" subtitle="Connect your Midnight wallet — the proofs are generated in-wallet, then submitted to the network.">
        <ProofPipeline stages={STAGES} />
      </Section>

      <Section title="Three guarantees" subtitle="The ProofGate contract enforces these on-chain.">
        <div className="grid-3">
          <Card icon={<IconZap size={18} />} title="Zero-knowledge">
            Proofs are generated and verified locally or in-wallet. The verifier learns only that the proof is valid.
          </Card>
          <Card icon={<IconGlobe size={18} />} title="Public, but private">
            The ledger stores commitments, policy parameters and status flags — never your attributes.
          </Card>
          <Card icon={<IconLock size={18} />} title="Unlinkable permits">
            Each permit uses a fresh salt, so permit ids cannot be tied back to you.
          </Card>
        </div>
      </Section>

      <Section
        title="Why ProofGate?"
        subtitle="Traditional KYC trades your data for access. ProofGate trades a zero-knowledge proof."
      >
        <KycComparison />
      </Section>
    </>
  );
}

const KYC_ROWS: ReadonlyArray<{ label: string; traditional: string; proofgate: string }> = [
  {
    label: 'Data shared',
    traditional: 'Full documents — ID, passport, proof of address',
    proofgate: 'A zero-knowledge proof, and nothing else',
  },
  {
    label: 'Storage',
    traditional: 'Copies kept on the service’s servers',
    proofgate: 'Commitments + status flags on a public ledger',
  },
  {
    label: 'Portability',
    traditional: 'Every site starts the check from scratch',
    proofgate: 'One credential works across many services',
  },
  {
    label: 'Replayability',
    traditional: 'Stored copies can be reused without consent',
    proofgate: 'One-time permits, fresh salt per permit',
  },
  {
    label: 'Breach risk',
    traditional: 'Data at rest can leak in a breach',
    proofgate: 'Nothing stored — proofs are ephemeral',
  },
  {
    label: 'Revocation',
    traditional: 'Often outside your control',
    proofgate: 'Permits expire and revoke on-chain',
  },
];

function KycComparison() {
  return (
    <div className="kyc-compare" role="table" aria-label="Traditional KYC versus ProofGate">
      <div className="kyc-row kyc-row-head" role="row">
        <span className="kyc-label" role="columnheader" />
        <span className="kyc-cell kyc-traditional" role="columnheader">
          Traditional KYC
        </span>
        <span className="kyc-cell kyc-proofgate" role="columnheader">
          ProofGate
        </span>
      </div>
      {KYC_ROWS.map((row) => (
        <div className="kyc-row" role="row" key={row.label}>
          <span className="kyc-label" role="cell">
            {row.label}
          </span>
          <span className="kyc-cell kyc-traditional" role="cell">
            <IconX size={13} aria-hidden="true" />
            {row.traditional}
          </span>
          <span className="kyc-cell kyc-proofgate" role="cell">
            <IconCheck size={13} aria-hidden="true" />
            {row.proofgate}
          </span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 'var(--sp-8)' }}>
      <div className="section-head">
        <div>
          <h1 style={{ fontSize: 'var(--fs-h2)' }}>{title}</h1>
          {subtitle && <p className="lead">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <span className="badge badge-proof" style={{ width: 'fit-content' }}>
        {icon}
      </span>
      <h3 style={{ marginTop: 12 }}>{title}</h3>
      <p className="muted" style={{ marginTop: 6 }}>
        {children}
      </p>
    </div>
  );
}
