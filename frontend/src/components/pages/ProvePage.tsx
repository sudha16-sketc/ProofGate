import { useState } from 'react';
import { useMidnight } from '../../hooks/useMidnight';
import { PageHeader } from './PageHeader';
import { ProveFlow } from '../features/ProveFlow';
import { Reveal } from '../ui/Reveal';
import { Button } from '../ui/Button';
import { TrustGraph } from '../visual/TrustGraph';
import { IconBuilding, IconCertificate, IconKey, IconShieldCheck, IconWallet, IconZap } from '../icons';
import { FEATURE_META, type FeatureId } from '../../lib/formats';
import { FEATURES } from '../../lib/proofgate';

const TRUST_NODES = [
  { role: 'KYC issuer', desc: 'Verifies your identity off-chain and signs your claims', icon: <IconBuilding size={18} /> },
  { role: 'Your wallet', desc: 'Holds the signed credential and generates proofs', icon: <IconWallet size={18} /> },
  { role: 'ProofGate contract', desc: 'Verifies the proof and mints one-time permits', icon: <IconShieldCheck size={18} /> },
  { role: 'The dApp', desc: 'Receives only eligibility — never who you are', icon: <IconCertificate size={18} /> },
];

const TRUST_EDGES = ['verifies identity', 'proves eligibility (zero-knowledge)', 'reads public permit state'];

export function ProvePage({ navigate }: { navigate: (route: string) => void }) {
  const { state } = useMidnight();
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<FeatureId>(FEATURES.rwaPurchase);

  const features = Object.values(FEATURE_META);

  return (
    <>
      <PageHeader route="prove" />

      <div className="grid-2" style={{ gap: 'var(--sp-4)' }}>
        {features.map((metaItem, i) => (
          <Reveal key={metaItem.id} delay={i % 2 === 0 ? 1 : 2}>
            <div className="feature-card">
              <span className="feature-icon">
                <IconZap size={18} />
              </span>
              <h3>{metaItem.label}</h3>
              <p className="feature-desc">{metaItem.description}</p>
              <div className="feature-tags">
                {metaItem.claims.map((c) => (
                  <span className="tag" key={c.label} title={c.hint}>
                    {c.label}
                  </span>
                ))}
              </div>
              <div className="row-between">
                <span className="caption muted">One-time permit</span>
                <Button
                  variant="primary"
                  onClick={() => {
                    setSelected(metaItem.id);
                    setModalOpen(true);
                  }}
                  disabled={state.status !== 'connected'}
                >
                  Prove eligibility
                </Button>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <section style={{ marginTop: 'var(--sp-8)' }}>
          <div className="section-head">
            <div>
              <h1 style={{ fontSize: 'var(--fs-h2)' }}>What the dApp learns</h1>
              <p className="lead">
                Proving eligibility reveals the outcome — the permit — not your attributes. This is what the receiving
                dApp can read on-chain.
              </p>
            </div>
          </div>
          <TrustGraph nodes={TRUST_NODES} edges={TRUST_EDGES} />
          <div className="row-wrap" style={{ marginTop: 'var(--sp-4)' }}>
            <Button variant="ghost" icon={<IconKey size={15} />} onClick={() => navigate('trust')}>
              Security deep dive
            </Button>
          </div>
        </section>
      </Reveal>

      <ProveFlow open={modalOpen} onClose={() => setModalOpen(false)} initialFeature={selected} navigate={navigate} />
    </>
  );
}
