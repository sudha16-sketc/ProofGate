// StateView — read-only view of the ProofGate public ledger via the indexer.
//
// Shows only *public* data (minAge, owner commitment, issuers, subject
// pseudonyms, permit statuses). No private inputs are ever queried or shown.

import { useEffect, useRef, useState } from 'react';

import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import type { PublicDataProvider } from '@midnight-ntwrk/midnight-js-types';

import * as ProofGateContractModule from '../../../managed/proofgate/contract/index.js';
import { INDEXER_URL, indexerWsUrl } from '../lib/env';
import { hex } from '../lib/proofgate';
import type { LedgerView } from './PermitGate';

const SUBJECT_STATUS = ['NONE', 'ACTIVE', 'SUSPENDED', 'REVOKED'] as const;
const ISSUER_STATUS = ['NONE', 'ACTIVE', 'SUSPENDED', 'REVOKED'] as const;
const PERMIT_STATUS = ['VALID', 'CONSUMED', 'REVOKED'] as const;

function decodeFeature(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  const nul = text.indexOf('\0');
  return nul === -1 ? text : text.slice(0, nul);
}

const ZEROS = '00'.repeat(32);

function toView(state: { data: unknown }): LedgerView {
  const l = ProofGateContractModule.ledger(state.data as never);
  return {
    contractDomain: hex(l.contractDomain),
    owner: hex(l.owner),
    deployerId: hex(l.deployerId),
    minimumAge: l.minimumAge,
    requiredKycLevel: l.requiredKycLevel,
    activePolicyId: hex(l.activePolicyId),
    activePolicyVersion: l.activePolicyVersion,
    jurisdictionCommitment: hex(l.jurisdictionCommitment),
    issuers: [...l.issuers].map(([id, i]) => ({
      id: hex(id as Uint8Array),
      status: i.status,
      pkX: hex(i.pkX),
      pkY: hex(i.pkY),
    })),
    subjects: [...l.subjects].map(([pk, s]) => ({
      pk: hex(pk as Uint8Array),
      status: s.status,
      credId: hex(s.credId),
      issuerId: hex(s.issuerId),
      kycLevel: s.kycLevel,
      policyVersion: s.policyVersion,
      expiresAt: s.expiresAt,
      registeredAt: s.registeredAt,
    })),
    permits: [...l.permits].map(([id, p]) => ({
      id: hex(id as Uint8Array),
      holder: hex(p.holder),
      feature: decodeFeature(p.feature),
      policyId: hex(p.policyId),
      policyVersion: p.policyVersion,
      credId: hex(p.credId),
      issuedAt: p.issuedAt,
      expiresAt: p.expiresAt,
      status: p.status,
    })),
  };
}

const POLL_MS = 10_000;

export function StateView({ address }: { address: string | null }) {
  const [view, setView] = useState<LedgerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const providerRef = useRef<PublicDataProvider | null>(null);

  useEffect(() => {
    providerRef.current = indexerPublicDataProvider(INDEXER_URL, indexerWsUrl(INDEXER_URL));
  }, []);

  useEffect(() => {
    if (!address) {
      setView(null);
      setError(null);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      const provider = providerRef.current;
      if (!provider) return;
      try {
        const state = await provider.queryContractState(address as never);
        // DEBUG: surface raw indexer response to the browser console so we can inspect
        // whether the indexer includes on-chain block timestamps or other metadata.
        // Remove this log once we've confirmed the shape.
        // eslint-disable-next-line no-console
        console.debug('rawIndexerState', state);
        if (cancelled) return;
        if (!state) {
          setView(null);
          setError(`No contract state found at ${address}.`);
          return;
        }
        setView(toView(state));
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };

    void load();
    timer = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [address]);

  return (
    <section className="card">
      <div className="row">
        <h2>Public Ledger</h2>
        <span className="badge dim">indexer: {INDEXER_URL}</span>
      </div>

      {!address && <p>Deploy or configure a contract to see its public state.</p>}

      {error && <p className="error">{error}</p>}

      {view && (
        <>
          <p>
            policy {view.activePolicyId === ZEROS ? '—' : view.activePolicyId.slice(0, 16) + '…'} v{view.activePolicyVersion.toString()} ·
            minAge <strong>{view.minimumAge.toString()}</strong> · KYC ≥ {view.requiredKycLevel.toString()} · issuers{' '}
            <strong>{view.issuers.length}</strong> · subjects{' '}
            <strong>{view.subjects.length}</strong> · permits{' '}
            <strong>{view.permits.length}</strong>
          </p>

          {view.issuers.length > 0 && (
            <div className="table-block">
              <h3>Issuers</h3>
              <ul className="mono list">
                {view.issuers.map((i) => (
                  <li key={i.id}>
                    {i.id.slice(0, 16)}… · {ISSUER_STATUS[i.status] ?? i.status}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {view.subjects.length > 0 && (
            <div className="table-block">
              <h3>Subjects</h3>
              <ul className="mono list">
                {view.subjects.map((s) => (
                  <li key={s.pk}>
                    {s.pk.slice(0, 16)}… · {SUBJECT_STATUS[s.status] ?? s.status} · KYC #{s.kycLevel.toString()} ·
                    v{s.policyVersion.toString()} · expires{' '}
                    {new Date(Number(s.expiresAt) * 1000).toISOString()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {view.permits.length > 0 && (
            <div className="table-block">
              <h3>Permits</h3>
              <ul className="mono list">
                {view.permits.map((p) => (
                  <li key={p.id}>
                    {p.feature} · {PERMIT_STATUS[p.status] ?? p.status} · expires {new Date(Number(p.expiresAt) * 1000).toISOString()}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
