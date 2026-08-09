import { useState } from 'react';
import { useSessionLedger, useSessionStatus } from '../../store/session';
import { Tabs } from '../ui/Tabs';
import { DataTable } from '../ui/DataTable';
import { StatusBadge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { CopyButton } from '../ui/CopyButton';
import { IconLedger, IconLock } from '../icons';
import { shortId, formatTimestamp } from '../../lib/formats';

const SUBJECT_STATUS = ['NONE', 'ACTIVE', 'SUSPENDED', 'REVOKED'] as const;
const ISSUER_STATUS = ['NONE', 'ACTIVE', 'SUSPENDED', 'REVOKED'] as const;

const TABS = [
  { id: 'policy', label: 'Policy' },
  { id: 'issuers', label: 'Issuers' },
  { id: 'subjects', label: 'Subjects' },
  { id: 'permits', label: 'Permits' },
  { id: 'revoked', label: 'Revoked' },
];

export function LedgerPanels() {
  const status = useSessionStatus();
  const ledger = useSessionLedger();
  const [tab, setTab] = useState('policy');
  const [view, setView] = useState<'public' | 'privacy'>('public');

  if (status !== 'ready' || !ledger) {
    return (
      <EmptyState
        icon={<IconLedger size={20} />}
        title="Public ledger"
        description="Connect your wallet and finish session setup to inspect the on-chain contract state."
      />
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-4)' }}>
      <p className="muted">
        Read-only view of the ProofGate contract state via the indexer. Every value here is public — commitments,
        policy parameters and status flags.
      </p>

      <div className="ledger-toggle" role="group" aria-label="Ledger view">
        <button
          type="button"
          className={view === 'public' ? 'active' : ''}
          aria-pressed={view === 'public'}
          onClick={() => setView('public')}
        >
          Public view
        </button>
        <button
          type="button"
          className={view === 'privacy' ? 'active' : ''}
          aria-pressed={view === 'privacy'}
          onClick={() => setView('privacy')}
        >
          Privacy explanation
        </button>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} ariaLabel="Ledger sections" />

      {view === 'privacy' ? (
        <PrivacyExplainer tab={tab} />
      ) : (
        <>
          {tab === 'policy' && (
        <DataTable
          columns={[
            { key: 'k', label: 'Parameter' },
            { key: 'v', label: 'Value', align: 'left' },
          ]}
          rows={[
            { key: 'domain', k: 'Contract domain', v: <Id value={ledger.contractDomain} /> },
            { key: 'owner', k: 'Owner commitment', v: <Id value={ledger.owner} /> },
            { key: 'deployer', k: 'Deployer identity', v: <Id value={ledger.deployerId} /> },
            { key: 'policyId', k: 'Active policy id', v: <Id value={ledger.activePolicyId} /> },
            { key: 'policyVersion', k: 'Active policy version', v: ledger.activePolicyVersion.toString() },
            { key: 'minAge', k: 'Minimum age', v: ledger.minimumAge.toString() },
            { key: 'kyc', k: 'Required KYC level', v: `≥ ${ledger.requiredKycLevel.toString()}` },
            { key: 'credVersion', k: 'Required credential version', v: ledger.requiredCredentialVersion.toString() },
            { key: 'juris', k: 'Jurisdiction commitment', v: <Id value={ledger.jurisdictionCommitment} /> },
            { key: 'seq', k: 'Logical sequence', v: ledger.seq.toString() },
          ]}
        />
      )}

      {tab === 'issuers' && (
        <DataTable
          empty="No issuers registered."
          columns={[
            { key: 'id', label: 'Issuer id', render: (r) => <Id value={r.id} /> },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge tone={statusTone(r.status)}>{ISSUER_STATUS[r.status] ?? r.status}</StatusBadge> },
            { key: 'pkX', label: 'pkX', render: (r) => <Id value={r.pkX} /> },
            { key: 'pkY', label: 'pkY', render: (r) => <Id value={r.pkY} /> },
            { key: 'created', label: 'Registered', render: (r) => formatTimestamp(r.createdAt) },
          ]}
          rows={ledger.issuers.map((i) => ({ ...i, key: i.id }))}
        />
      )}

      {tab === 'subjects' && (
        <DataTable
          empty="No subjects registered."
          columns={[
            { key: 'pk', label: 'Pseudonym', render: (r) => <Id value={r.pk} /> },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge tone={statusTone(r.status)}>{SUBJECT_STATUS[r.status] ?? r.status}</StatusBadge> },
            { key: 'credId', label: 'Credential id', render: (r) => <Id value={r.credId} /> },
            { key: 'issuer', label: 'Issuer', render: (r) => <Id value={r.issuerId} /> },
            { key: 'kyc', label: 'KYC', render: (r) => r.kycLevel.toString() },
            { key: 'polV', label: 'Policy v', render: (r) => `v${r.policyVersion.toString()}` },
            { key: 'expires', label: 'Expires', render: (r) => formatTimestamp(r.expiresAt) },
          ]}
          rows={ledger.subjects.map((s) => ({ ...s, key: s.pk }))}
        />
      )}

      {tab === 'permits' && (
        <DataTable
          empty="No permits issued."
          columns={[
            { key: 'id', label: 'Permit id', render: (r) => <Id value={r.id} /> },
            { key: 'feature', label: 'Feature', render: (r) => <span className="mono">{r.feature}</span> },
            {
              key: 'status',
              label: 'Status',
              render: (r) => {
                // Determine effective status considering expiry
                const now = Date.now();
                const timeValid = Number(r.expiresAt) * 1000 > now;
                const label = r.status === 1 ? 'CONSUMED' : r.status === 2 ? 'REVOKED' : timeValid ? 'VALID' : 'EXPIRED';
                const tone = label === 'VALID' ? 'ok' : label === 'EXPIRED' ? 'warn' : label === 'REVOKED' ? 'err' : 'dim';
                return <StatusBadge tone={tone}>{label}</StatusBadge>;
              },
            },
            { key: 'holder', label: 'Holder', render: (r) => <Id value={r.holder} /> },
            { key: 'policy', label: 'Policy', render: (r) => <Id value={r.policyId} /> },
            { key: 'issued', label: 'Issued', render: (r) => <span className="mono">seq {r.issuedAt.toString()}</span> },
            { key: 'expires', label: 'Expires', render: (r) => formatTimestamp(r.expiresAt) },
          ]}
          rows={ledger.permits.map((p) => ({ ...p, key: p.id }))}
        />
      )}

      {tab === 'revoked' && (
        <DataTable
          empty="Revocation set is empty."
          columns={[{ key: 'id', label: 'Revoked credential id', render: (r) => <Id value={r.id} /> }]}
          rows={ledger.revoked.map((id) => ({ key: id, id }))}
        />
      )}
        </>
      )}
    </div>
  );
}

function statusTone(status: number): 'ok' | 'dim' | 'err' {
  if (status === 1) return 'ok';
  if (status === 3) return 'err';
  return 'dim';
}

const PRIVACY: Record<string, { title: string; note: string; rows: { public: string; private: string }[] }> = {
  policy: {
    title: 'Policy parameters',
    note: 'Anyone can read the policy; that is the point — eligibility rules are public so proofs can be checked by anyone.',
    rows: [
      { public: 'Minimum age, required KYC level', private: 'Which birth date belongs to a subject' },
      { public: 'Allowed jurisdictions (commitment)', private: 'Which jurisdiction a subject lives in' },
      { public: 'Policy version, owner & deployer commitment', private: 'Who controls the contract (only commitments)' },
    ],
  },
  issuers: {
    title: 'Issuer registry',
    note: 'Issuer ids and public keys are public, like a certificate authority directory.',
    rows: [
      { public: 'Issuer id, status, public key', private: 'Who holds credentials signed by each issuer' },
    ],
  },
  subjects: {
    title: 'Subjects',
    note: 'Each subject appears only as a pseudonym + credential id + status flag.',
    rows: [
      { public: 'Pseudonym, credential id, status', private: 'Name, age, jurisdiction, or the signature' },
      { public: 'KYC level, policy version', private: 'The underlying documents behind that level' },
    ],
  },
  permits: {
    title: 'Permits',
    note: 'Permit ids use a fresh salt per permit, so one-time permits cannot be linked to each other or to a subject.',
    rows: [
      { public: 'Permit id, feature, status, expiry', private: 'Which subject the permit belongs to' },
      { public: 'Holder pseudonym', private: 'The holder’s identity or attributes' },
    ],
  },
  revoked: {
    title: 'Revocation',
    note: 'Revocation is public so wallets can skip expired or revoked credentials before proving.',
    rows: [{ public: 'Revoked credential ids', private: 'Why a credential was revoked' }],
  },
};

function PrivacyExplainer({ tab }: { tab: string }) {
  const data = PRIVACY[tab] ?? PRIVACY.policy;
  return (
    <div className="privacy-explainer" role="group" aria-label={`Privacy explanation: ${data.title}`}>
      <p className="caption">
        <IconLock size={12} style={{ verticalAlign: '-2px', marginRight: 6 }} />
        {data.note}
      </p>
      <div className="grid-2" style={{ gap: 'var(--sp-3)', marginTop: 12 }}>
        {data.rows.map((row, i) => (
          <div className="card" key={i}>
            <h4 style={{ fontSize: '0.82rem' }}>Public</h4>
            <p className="muted">{row.public}</p>
            <h4 style={{ fontSize: '0.82rem', marginTop: 10 }}>Still private</h4>
            <p className="muted">{row.private}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Id({ value }: { value: string }) {
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className="mono" style={{ fontSize: '0.74rem' }}>
        {shortId(value, 10)}
      </span>
      <CopyButton text={value} label="" />
    </span>
  );
}
