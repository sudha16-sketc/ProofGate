import { useMidnight } from '../../hooks/useMidnight';
import { useSessionAddress, useSessionMeta } from '../../store/session';
import { CONTRACT_ADDRESS, INDEXER_URL, NETWORK } from '../../lib/env';
import { CopyButton } from '../ui/CopyButton';
import { Card } from '../ui/Card';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Reveal } from '../ui/Reveal';
import { IconCode, IconInfo } from '../icons';
import { shortId } from '../../lib/formats';

export function SettingsPanel({ navigate }: { navigate: (route: string) => void }) {
  const { state } = useMidnight();
  const address = useSessionAddress();
  const meta = useSessionMeta();

  const rows = [
    { k: 'Network', v: NETWORK },
    { k: 'Indexer', v: INDEXER_URL },
    { k: 'Configured contract', v: CONTRACT_ADDRESS || '— (deploy a demo instance)' },
    { k: 'Session contract', v: address ?? '—' },
  ];

  return (
    <div className="stack" style={{ gap: 'var(--sp-5)' }}>
      <Reveal>
        <Card pad="sm">
          <h3 style={{ margin: 0 }}>Environment</h3>
          <p className="muted">All values below are public configuration — no secrets are stored in the browser.</p>
          <div className="stack-sm" style={{ gap: 10, marginTop: 12 }}>
            {rows.map((r) => (
              <div className="row-between" key={r.k} style={{ gap: 16 }}>
                <span className="caption k" style={{ textTransform: 'uppercase' }}>
                  {r.k}
                </span>
                <span className="row mono" style={{ gap: 8, minWidth: 0, maxWidth: '70%' }}>
                  <span className="truncate" style={{ overflowWrap: 'anywhere' }}>
                    {r.v}
                  </span>
                  {r.v !== '—' && <CopyButton text={r.v} label="" />}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </Reveal>

      <Reveal>
        <Card pad="sm">
          <h3 style={{ margin: 0 }}>Wallet</h3>
          <p className="muted">ProofGate uses the wallet's own configuration for proving, balancing and submission.</p>
          <div className="stack-sm" style={{ gap: 10, marginTop: 12 }}>
            <div className="row-between" style={{ gap: 16 }}>
              <span className="caption k">Status</span>
              <StatusBadge tone={state.status === 'connected' ? 'ok' : 'dim'}>{state.status}</StatusBadge>
            </div>
            {state.status === 'connected' && (
              <>
                <div className="row-between" style={{ gap: 16 }}>
                  <span className="caption k">Wallet</span>
                  <span>{state.walletName}</span>
                </div>
                <div className="row-between" style={{ gap: 16 }}>
                  <span className="caption k">Address</span>
                  <span className="row mono" style={{ gap: 8 }}>
                    <span className="truncate">{shortId(state.address, 14)}</span>
                    <CopyButton text={state.address} label="" />
                  </span>
                </div>
                <div className="row-between" style={{ gap: 16 }}>
                  <span className="caption k">Admin session</span>
                  <span>{meta?.isAdmin ? 'yes (demo deployer)' : 'no'}</span>
                </div>
              </>
            )}
          </div>
        </Card>
      </Reveal>

      <Reveal>
        <Card pad="sm">
          <div className="row" style={{ gap: 10 }}>
            <IconInfo size={16} className="muted" />
            <h3 style={{ margin: 0 }}>About this demo</h3>
          </div>
          <ul className="stack-sm" style={{ gap: 8, marginTop: 12 }}>
            <li>ProofGate stores no accounts, no credentials, and no KYC documents.</li>
            <li>Your private inputs live only in the in-memory private state and are consumed by the ZK witnesses.</li>
            <li>The activity feed stores only transaction ids, circuit names and statuses — never witnesses.</li>
            <li>The demo issuer (fixed key) signs claims in-page; production uses a real KYC issuer.</li>
          </ul>
        </Card>
      </Reveal>

      <Reveal>
        <Card pad="sm">
          <div className="row" style={{ gap: 10 }}>
            <IconCode size={16} className="muted" />
            <h3 style={{ margin: 0 }}>Technical explorer</h3>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            ProofGate is open-source. Read the actual in-circuit checks in{' '}
            <code className="mono" style={{ fontSize: '0.82rem' }}>
              contract/src/circuit.ts
            </code>{' '}
            and inspect the flow visually.
          </p>
          <div className="row-wrap" style={{ marginTop: 12 }}>
            <Button variant="outline" size="sm" onClick={() => navigate('trust')}>
              View circuit architecture
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<IconCode size={14} />}
              onClick={() => window.open('/zkir', '_blank', 'noopener,noreferrer')}
            >
              Open ZK artifacts
            </Button>
          </div>
        </Card>
      </Reveal>
    </div>
  );
}
