import { IconCheck, IconChip, IconEye, IconLock } from '../icons';

/**
 * "What the application learns" — the private attributes stay inside the
 * proving environment (rendered as redacted blocks) while the receiving dApp
 * sees only the eligibility outcome. Purely educational: mirrors exactly what
 * the ProofGate contract writes to the public ledger (permit status, feature,
 * policy reference, expiry) — never the attributes.
 */
export function DappView() {
  return (
    <div className="dapp-view">
      <div className="dapp-column user">
        <span className="dapp-heading">
          <IconLock size={14} />
          Your data
        </span>
        <div className="dapp-row">
          <span className="dapp-row-label">Identity</span>
          <span className="dapp-blocks">████████████</span>
        </div>
        <div className="dapp-row">
          <span className="dapp-row-label">Age</span>
          <span className="dapp-blocks">████████████</span>
        </div>
        <div className="dapp-row">
          <span className="dapp-row-label">Jurisdiction</span>
          <span className="dapp-blocks">████████████</span>
        </div>
        <div className="dapp-row">
          <span className="dapp-row-label">KYC</span>
          <span className="dapp-blocks">████████████</span>
        </div>
        <p className="caption" style={{ marginTop: 'var(--sp-2)' }}>
          Never published. Consumed only by the in-wallet ZK witness.
        </p>
      </div>

      <div className="dapp-gate" role="img" aria-label="Zero-knowledge proof boundary">
        <span className="dapp-gate-inner">
          <IconChip size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          ZK proof
        </span>
      </div>

      <div className="dapp-column recv">
        <span className="dapp-heading">
          <IconEye size={14} />
          The dApp receives
        </span>
        <div className="dapp-row verified">
          <span className="dapp-row-label">Eligibility</span>
          <span className="dapp-row-value">
            <IconCheck size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            proven
          </span>
        </div>
        <div className="dapp-row">
          <span className="dapp-row-label">Policy</span>
          <span className="dapp-row-value">RWA-PURCHASE-V3</span>
        </div>
        <div className="dapp-row">
          <span className="dapp-row-label">Permit</span>
          <span className="dapp-row-value">VALID</span>
        </div>
        <div className="dapp-row">
          <span className="dapp-row-label">Expiry</span>
          <span className="dapp-row-value">01:00:00</span>
        </div>
        <p className="caption" style={{ marginTop: 'var(--sp-2)' }}>
          Public permit state on the Midnight ledger.
        </p>
      </div>
    </div>
  );
}
