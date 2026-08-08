import { TrustGraph } from '../visual/TrustGraph';
import { DappView } from '../visual/DappView';
import { CircuitDiagram } from '../visual/CircuitDiagram';
import { Reveal } from '../ui/Reveal';
import { IconBuilding, IconCertificate, IconKey, IconLock, IconShieldCheck, IconWallet } from '../icons';

const NODES = [
  { role: 'KYC issuer', desc: 'Verifies your identity off-chain and signs your claims', icon: <IconBuilding size={18} /> },
  { role: 'Your wallet', desc: 'Holds the signed credential and generates proofs', icon: <IconWallet size={18} /> },
  { role: 'ProofGate contract', desc: 'Verifies the proof and mints one-time permits', icon: <IconShieldCheck size={18} /> },
  { role: 'The dApp', desc: 'Receives only eligibility — never who you are', icon: <IconCertificate size={18} /> },
];

const EDGES = ['verifies identity', 'proves eligibility (zero-knowledge)', 'reads public permit state'];

export function TrustExplorer() {
  return (
    <div className="stack" style={{ gap: 'var(--sp-8)' }}>
      <Reveal>
        <section>
          <div className="section-head">
            <div>
              <h1 style={{ fontSize: 'var(--fs-h2)' }}>Who verifies what</h1>
              <p className="lead">
                Four parties cooperate, and each learns only what it must. ProofGate never sees your identity — and the
                contract verifies everything it sees.
              </p>
            </div>
          </div>
          <TrustGraph nodes={NODES} edges={EDGES} />
        </section>
      </Reveal>

      <Reveal>
        <section>
          <div className="section-head">
            <div>
              <h1 style={{ fontSize: 'var(--fs-h2)' }}>What the dApp receives</h1>
              <p className="lead">An app integrating ProofGate sees the outcome, not the attributes.</p>
            </div>
          </div>
          <DappView />
        </section>
      </Reveal>

      <Reveal>
        <section>
          <div className="section-head">
            <div>
              <h1 style={{ fontSize: 'var(--fs-h2)' }}>How the proof is built</h1>
              <p className="lead">A simplified look at the circuit flow. The wallet generates the proof; Midnight verifies it on-chain.</p>
            </div>
          </div>
          <CircuitDiagram />
        </section>
      </Reveal>

      <div className="grid-2" style={{ gap: 'var(--sp-4)' }}>
        <Reveal>
          <div className="card">
            <div className="row" style={{ gap: 10 }}>
              <IconLock size={16} className="muted" />
              <h3 style={{ margin: 0 }}>What stays private</h3>
            </div>
            <ul className="stack-sm" style={{ gap: 8, marginTop: 12 }}>
              {['Your name, age and exact jurisdiction', 'The Schnorr signature over your claims', 'Your subject secret key', 'Per-permit salts (keep ids unlinkable)'].map((t) => (
                <li key={t} className="row" style={{ gap: 8 }}>
                  <IconKey size={13} className="faint" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={1}>
          <div className="card">
            <div className="row" style={{ gap: 10 }}>
              <IconShieldCheck size={16} className="muted" />
              <h3 style={{ margin: 0 }}>What the ledger stores</h3>
            </div>
            <ul className="stack-sm" style={{ gap: 8, marginTop: 12 }}>
              {['Pseudonym: subjectKey(domain, pk)', 'Commitments: admin, jurisdiction list', 'Policy parameters and status flags', 'Permit records: holder, feature, expiry, status'].map((t) => (
                <li key={t} className="row" style={{ gap: 8 }}>
                  <IconShieldCheck size={13} className="faint" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
