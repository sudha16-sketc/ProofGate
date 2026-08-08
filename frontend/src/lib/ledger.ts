// Ledger view model + helpers for the ProofGate public state.
//
// Only *public* contract state is decoded here (policy parameters, issuer
// registry, subject pseudonyms, permit records, revocation set). Private
// inputs (age, jurisdiction, signatures, secrets) never appear in this module.

import * as ProofGateContractModule from '../../../managed/proofgate/contract/index.js';
import type { ProofGateProviders } from './providers';
import { hex, sleep, type ProofGatePrivateState } from './proofgate';
import { subjectKey } from './schnorr';

export const ZEROS = '00'.repeat(32);

export const SUBJECT_STATUS = ['NONE', 'ACTIVE', 'SUSPENDED', 'REVOKED'] as const;
export const ISSUER_STATUS = ['NONE', 'ACTIVE', 'SUSPENDED', 'REVOKED'] as const;
export const PERMIT_STATUS = ['VALID', 'CONSUMED', 'REVOKED'] as const;

export type SubjectStatusValue = (typeof SUBJECT_STATUS)[number];
export type IssuerStatusValue = (typeof ISSUER_STATUS)[number];
export type PermitStatusValue = (typeof PERMIT_STATUS)[number];

export type IssuerRow = {
  id: string;
  status: number;
  pkX: string;
  pkY: string;
  metadataHash: string;
  createdAt: bigint;
  revokedAt: bigint;
};

export type SubjectRow = {
  pk: string;
  status: number;
  credId: string;
  issuerId: string;
  kycLevel: bigint;
  policyVersion: bigint;
  expiresAt: bigint;
  registeredAt: bigint;
};

export type PermitRow = {
  id: string;
  holder: string;
  feature: string;
  policyId: string;
  policyVersion: bigint;
  credId: string;
  issuedAt: bigint;
  expiresAt: bigint;
  status: number;
};

export type LedgerView = {
  contractDomain: string;
  adminPk: string;
  minimumAge: bigint;
  requiredKycLevel: bigint;
  requiredCredentialVersion: bigint;
  activePolicyId: string;
  activePolicyVersion: bigint;
  jurisdictionCommitment: string;
  issuers: IssuerRow[];
  subjects: SubjectRow[];
  revoked: string[];
  permits: PermitRow[];
  seq: bigint;
};

export function decodeFeature(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  const nul = text.indexOf('\0');
  return nul === -1 ? text : text.slice(0, nul);
}

export function toBytes32(hexStr: string): Uint8Array {
  const out = new Uint8Array(32);
  const bytes = hexStr.match(/[0-9a-fA-F]{2}/g) ?? [];
  for (let i = 0; i < Math.min(bytes.length, 32); i++) out[i] = Number.parseInt(bytes[i] ?? '00', 16);
  return out;
}

/** Decode a raw indexer contract-state response into the LedgerView model. */
export function toLedgerView(state: { data: unknown }): LedgerView {
  const l = ProofGateContractModule.ledger(state.data as never);
  return {
    contractDomain: hex(l.contractDomain),
    adminPk: hex(l.adminPk),
    minimumAge: l.minimumAge,
    requiredKycLevel: l.requiredKycLevel,
    requiredCredentialVersion: l.requiredCredentialVersion,
    activePolicyId: hex(l.activePolicyId),
    activePolicyVersion: l.activePolicyVersion,
    jurisdictionCommitment: hex(l.jurisdictionCommitment),
    issuers: [...l.issuers].map(([id, i]) => ({
      id: hex(id as Uint8Array),
      status: i.status,
      pkX: hex(i.pkX),
      pkY: hex(i.pkY),
      metadataHash: hex(i.metadataHash),
      createdAt: i.createdAt,
      revokedAt: i.revokedAt,
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
    revoked: [...l.revoked].map((id) => hex(id as Uint8Array)),
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
    seq: l.seq,
  };
}

/** Fetch the public ledger view for a deployed contract via the wallet's indexer. */
export async function fetchLedgerView(providers: ProofGateProviders, address: string): Promise<LedgerView> {
  const state = await providers.publicDataProvider.queryContractState(address as never);
  if (!state) throw new Error(`No contract state found at ${address}.`);
  return toLedgerView(state);
}

/**
 * Locate the newest permit id held by `pseudonym` for `feature` by polling the
 * indexer until the request transaction is indexed (or the budget is spent).
 * Returns null if the indexer lags beyond the attempt budget.
 */
export async function findPermitId(
  providers: ProofGateProviders,
  address: string,
  pseudonym: Uint8Array,
  feature: Uint8Array,
  attempts = 15,
): Promise<string | null> {
  const pseudonymHex = hex(pseudonym);
  const featureHex = hex(feature);
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const view = await fetchLedgerView(providers, address);
      let newest: { id: string; issuedAt: bigint } | null = null;
      for (const p of view.permits) {
        if (p.holder === pseudonymHex && hex(toBytes32(p.feature)) === featureHex) {
          if (!newest || p.issuedAt > newest.issuedAt) newest = { id: p.id, issuedAt: p.issuedAt };
        }
      }
      if (newest) return newest.id;
    } catch {
      // indexer may lag — keep polling
    }
    await sleep(3000);
  }
  return null;
}

/** Derived, public identifiers for a wallet's session (all safe to display). */
export type SessionMeta = {
  /** Domain-separated pseudonym of this wallet on the connected instance. */
  myPseudonym: string;
  /** This wallet's own subject record, or null when not registered. */
  mySubject: SubjectRow | null;
  /** Permit records whose holder is this wallet's pseudonym. */
  myPermits: PermitRow[];
  /** True when this session's admin secret matches the deployed admin commitment. */
  isAdmin: boolean;
  /** True when the demo credential's issuer is registered and ACTIVE on-chain. */
  demoIssuerActive: boolean;
  /** True when a policy has been activated on-chain. */
  policyActive: boolean;
  /** Credential ids currently in the on-chain revocation set. */
  revoked: string[];
};

const ZERO_BYTES = new Uint8Array(32);

/** Compute the session meta from the ledger + the session's private state. */
export function deriveMeta(
  ledger: LedgerView | null,
  privateState: ProofGatePrivateState | null,
): SessionMeta | null {
  if (!ledger || !privateState) return null;

  const domainBytes = toBytes32(ledger.contractDomain);
  const pseudonym = hex(
    subjectKey(
      domainBytes,
      privateState.subjectPubX && privateState.subjectPubX.length ? privateState.subjectPubX : ZERO_BYTES,
      privateState.subjectPubY && privateState.subjectPubY.length ? privateState.subjectPubY : ZERO_BYTES,
    ),
  );

  const mySubject = ledger.subjects.find((s) => s.pk === pseudonym) ?? null;
  const myPermits = ledger.permits.filter((p) => p.holder === pseudonym).sort((a, b) => Number(b.issuedAt - a.issuedAt));

  // Admin detection: compare the commitment of this session's admin secret to
  // the public admin commitment stored on-chain. This is a deterministic,
  // public-data check (no secret is ever revealed).
  const adminCommitment = hex(ProofGateContractModule.pureCircuits.adminKey(privateState.adminSecret));
  const isAdmin = ledger.adminPk !== ZEROS && ledger.adminPk === adminCommitment;

  // Demo issuer key (sk = 42) — used to determine whether the demo setup step
  // can register a credential. Only the on-chain issuer registry is consulted.
  const demoIssuerId = hex(
    ProofGateContractModule.pureCircuits.issuerId(
      privateState.issuerPubX && privateState.issuerPubX.length ? privateState.issuerPubX : ZERO_BYTES,
      privateState.issuerPubY && privateState.issuerPubY.length ? privateState.issuerPubY : ZERO_BYTES,
    ),
  );
  const demoIssuerActive = ledger.issuers.some((i) => i.id === demoIssuerId && i.status === 1);

  return {
    myPseudonym: pseudonym,
    mySubject,
    myPermits,
    isAdmin,
    demoIssuerActive,
    policyActive: ledger.activePolicyId !== ZEROS && ledger.activePolicyVersion > 0n,
    revoked: ledger.revoked,
  };
}
