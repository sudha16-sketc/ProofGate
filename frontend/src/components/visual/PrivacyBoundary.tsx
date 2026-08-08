import { IconArrowDown, IconLock, IconShield, IconEye } from '../icons';

const PRIVATE_FIELDS = [
  { label: 'Identity', note: 'Never published to the public ledger.' },
  { label: 'Age', note: 'Never published to the public ledger.' },
  { label: 'Jurisdiction', note: 'Never published to the public ledger.' },
  { label: 'Credential signature', note: 'Verified in-circuit; never written on-chain.' },
  { label: 'Subject secret', note: 'Proves key possession without being revealed.' },
  { label: 'KYC evidence', note: 'The issuer checks it off-chain; ProofGate never sees it.' },
];

const PUBLIC_FIELDS = [
  { label: 'Commitment', note: 'Visible as public contract state.' },
  { label: 'Credential status', note: 'Visible as public contract state.' },
  { label: 'Policy', note: 'Visible as public contract state.' },
  { label: 'Permit status', note: 'Visible as public contract state.' },
  { label: 'Permit expiry', note: 'Visible as public contract state.' },
  { label: 'Feature', note: 'Visible as public contract state.' },
];

/**
 * Interactive privacy boundary: what stays private vs what becomes public,
 * with hover/click explanations for every field.
 */
export function PrivacyBoundary() {
  return (
    <div className="privacy-boundary">
      <div className="privacy-sides">
        <div className="privacy-side private">
          <span className="privacy-side-title">
            <IconLock size={14} />
            Private
          </span>
          {PRIVATE_FIELDS.map((f) => (
            <div className="privacy-item" key={f.label} tabIndex={0}>
              <span className="row">
                <span className="lock">
                  <IconLock size={13} />
                </span>
                <span>{f.label}</span>
              </span>
              <span className="privacy-tooltip">{f.note}</span>
            </div>
          ))}
        </div>

        <div className="privacy-side public">
          <span className="privacy-side-title">
            <IconEye size={14} />
            Public
          </span>
          {PUBLIC_FIELDS.map((f) => (
            <div className="privacy-item" key={f.label} tabIndex={0}>
              <span>{f.label}</span>
              <span className="privacy-tooltip">{f.note}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="privacy-membrane">
        <span className="membrane-label">
          <IconArrowDown size={14} />
          Zero-knowledge proof boundary
        </span>
      </div>

      <div className="privacy-legend">
        <span className="row">
          <IconLock size={13} />
          Everything above the boundary stays in your wallet.
        </span>
        <span className="row">
          <IconShield size={13} />
          The contract receives only eligibility — never your attributes.
        </span>
      </div>
    </div>
  );
}
