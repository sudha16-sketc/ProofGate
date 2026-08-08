import { useState } from 'react';
import { IconChevronDown, IconChevronUp } from '../icons';

/**
 * Persistent demo-environment banner. Always visible so nobody mistakes demo
 * credentials for real KYC; the explanation is collapsible.
 */
export function DemoBanner() {
  const [open, setOpen] = useState(false);

  return (
    <div className="demo-banner" role="note">
      <span className="badge badge-warn">DEMO ENVIRONMENT</span>
      <span>Test credentials and in-app demo issuer — not real KYC.</span>
      <button className="btn-link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? 'Less' : 'How production works'}
        {open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
      </button>
      {open && (
        <p className="demo-detail">
          ProofGate never stores or transmits your identity. In production, a real KYC issuer signs your claims
          off-chain; your wallet proves eligibility in zero-knowledge and only the result is recorded on the public
          ledger. Nothing here reveals your age, jurisdiction, or who you are.
        </p>
      )}
    </div>
  );
}
