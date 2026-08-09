// ProofGate browser-side contract-facing helpers (v3).
//
// PRIVACY NOTE: everything here that is *private* (ProofGatePrivateState)
// lives only in memory for the current page session and is consumed by the ZK
// witnesses below. None of these values are written to the ledger, logged,
// rendered, or stored. The only values that reach the chain are hash
// commitments (pseudonym, issuer id, credential id), policy parameters and
// permit records produced by the circuits.

import type { Witnesses } from '../../../managed/proofgate/contract/index.js';
import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash,
} from '@midnight-ntwrk/compact-runtime';
import {
  deployerId,
  issuerId,
  keypair,
  le32,
  ownerKey,
  pad32,
  publicKey,
  randomBytes32,
  signCredential,
  subjectKey,
  type CredentialMessage,
} from './schnorr';

export { pad32, le32, randomBytes32, deployerId, ownerKey, issuerId, subjectKey };
export { keypair, publicKey, signCredential, verifyCredential, randScalar, CURVE_ORDER, DOMAIN } from './schnorr';
export type { CredentialMessage, JubjubKeyPair, SchnorrSignature } from './schnorr';

/**
 * Private state of the ProofGate contract for a single wallet.
 *
 * The credential fields (issuer public key, signature R/s, age, jurisdiction,
 * KYC level, issue/expiry times, credential version, policy version) are the
 * subject's issuer-signed credential, held privately. `subjectSk` is the
 * subject's own secret key whose public key the issuer signed — its possession
 * binds the credential to this wallet.
 */
export type ProofGatePrivateState = {
  /** Owner master secret (proves ownership in owner-only circuits). */
  ownerSecret: Uint8Array;
  /** Subject secret key scalar (LE field element). */
  subjectSk: Uint8Array;
  /** Subject public key X coordinate (32-byte LE field element). */
  subjectPubX: Uint8Array;
  /** Subject public key Y coordinate (32-byte LE field element). */
  subjectPubY: Uint8Array;
  /** Issuer public key X coordinate (32-byte LE field element). */
  issuerPubX: Uint8Array;
  /** Issuer public key Y coordinate (32-byte LE field element). */
  issuerPubY: Uint8Array;
  /** Signed issuer id commitment (persistentHash of issuer pk). */
  signedIssuerId: Uint8Array;
  /** Signed domain-separated subject commitment (pseudonym). */
  subjectCommitment: Uint8Array;
  /** Signed issuer-chosen credential id (revocation id). */
  credentialId: Uint8Array;
  /** Signed credential schema version (Uint<8>). */
  credentialVersion: bigint;
  /** LE 32-byte slot of credentialVersion. */
  credentialVersionSlot: Uint8Array;
  /** Signed raw age (Uint<8>) — never disclosed on-chain. */
  age: bigint;
  /** LE 32-byte slot of age. */
  ageSlot: Uint8Array;
  /** Signed jurisdiction code (32-byte padded) — never disclosed on-chain. */
  jurisdiction: Uint8Array;
  /** Signed KYC level (Uint<8>). */
  kycLevel: bigint;
  /** LE 32-byte slot of kycLevel. */
  kycLevelSlot: Uint8Array;
  /** Signed issue time (unix seconds, Uint<64>). */
  issuedAt: bigint;
  /** LE 32-byte slot of issuedAt. */
  issuedAtSlot: Uint8Array;
  /** Signed expiry time (unix seconds, Uint<64>). */
  expiresAt: bigint;
  /** LE 32-byte slot of expiresAt. */
  expiresAtSlot: Uint8Array;
  /** Signed policy version the credential references (Uint<8>). */
  policyVersion: bigint;
  /** LE 32-byte slot of policyVersion. */
  policyVersionSlot: Uint8Array;
  /** Schnorr signature nonce point R.x (LE). */
  rx: Uint8Array;
  /** Schnorr signature nonce point R.y (LE). */
  ry: Uint8Array;
  /** Schnorr signature response scalar s (LE). */
  s: Uint8Array;
};

/** Default minimum age used by the demo policy. */
export const DEFAULT_MIN_AGE = 18n;

export const DEFAULT_KYC_LEVEL = 2n;

export const DEFAULT_CREDENTIAL_VERSION = 1n;

export const DEFAULT_POLICY_VERSION = 1n;

/** Demo policy id (32-byte padded) used by the in-app "activate policy" action. */
export const DEFAULT_POLICY_ID = 'policy:proofgate:demo:v1';

/** Features a compliant user may request permits for. */
export const FEATURES = {
  rwaPurchase: 'rwa:purchase',
  defiLend: 'defi:lend',
} as const;

export const JURISDICTIONS = ['US', 'EU', 'UK'] as const;

/** Canonical test/development instance domain (matches the repo root SDK). */
export const DEFAULT_DOMAIN = pad32('ProofGate:canonical:test:v1');

/**
 * Deterministic demo issuer for local/headless tests: sk = 42.
 * The in-browser demo credential is signed with this key, and the "Register
 * demo issuer" owner action publishes its public key — so the CLI demo
 * (`npm run cli -- demo`), the headless tests and this page all interoperate.
 * NEVER use a fixed scalar in production; this is a demo convenience.
 */
export function demoIssuerSk(): bigint {
  return 42n;
}

/** Hex-encode a byte array (for displaying *public* data only). */
export function hex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the ZK witnesses for ProofGate from the session's in-memory private
 * state. All values are read from `ctx.privateState` (the wallet's private
 * store, seeded by `deployContract` / `findDeployedContract`), so the same
 * witness set serves every session. `permitSalt` is sampled fresh on every
 * `requestPermit` call so two permits for the same feature are unlinkable
 * (fresh permit id each time).
 */
export const createWitnesses = (): Witnesses<ProofGatePrivateState> => ({
  ownerSecret: (ctx) => [ctx.privateState, ctx.privateState.ownerSecret],
  subjectSk: (ctx) => [ctx.privateState, ctx.privateState.subjectSk],
  subjectPkX: (ctx) => [ctx.privateState, ctx.privateState.subjectPubX],
  subjectPkY: (ctx) => [ctx.privateState, ctx.privateState.subjectPubY],
  issuerPkX: (ctx) => [ctx.privateState, ctx.privateState.issuerPubX],
  issuerPkY: (ctx) => [ctx.privateState, ctx.privateState.issuerPubY],
  signedIssuerId: (ctx) => [ctx.privateState, ctx.privateState.signedIssuerId],
  subjectCommitment: (ctx) => [ctx.privateState, ctx.privateState.subjectCommitment],
  credentialId: (ctx) => [ctx.privateState, ctx.privateState.credentialId],
  credentialVersion: (ctx) => [ctx.privateState, ctx.privateState.credentialVersion],
  credentialVersionSlot: (ctx) => [ctx.privateState, ctx.privateState.credentialVersionSlot],
  age: (ctx) => [ctx.privateState, ctx.privateState.age],
  ageSlot: (ctx) => [ctx.privateState, ctx.privateState.ageSlot],
  jurisdiction: (ctx) => [ctx.privateState, ctx.privateState.jurisdiction],
  kycLevel: (ctx) => [ctx.privateState, ctx.privateState.kycLevel],
  kycLevelSlot: (ctx) => [ctx.privateState, ctx.privateState.kycLevelSlot],
  issuedAt: (ctx) => [ctx.privateState, ctx.privateState.issuedAt],
  issuedAtSlot: (ctx) => [ctx.privateState, ctx.privateState.issuedAtSlot],
  expiresAt: (ctx) => [ctx.privateState, ctx.privateState.expiresAt],
  expiresAtSlot: (ctx) => [ctx.privateState, ctx.privateState.expiresAtSlot],
  policyVersion: (ctx) => [ctx.privateState, ctx.privateState.policyVersion],
  policyVersionSlot: (ctx) => [ctx.privateState, ctx.privateState.policyVersionSlot],
  rx: (ctx) => [ctx.privateState, ctx.privateState.rx],
  ry: (ctx) => [ctx.privateState, ctx.privateState.ry],
  s: (ctx) => [ctx.privateState, ctx.privateState.s],
  permitSalt: (ctx) => [ctx.privateState, randomBytes32()],
});

/**
 * Demo credential used ONLY for this in-memory page session: a fresh random
 * subject keypair gets an issuer-signed credential (age 18, KYC 2, US) from
 * the deterministic demo issuer (sk = 42), bound to `contractDomain`.
 *
 * These values are never rendered, logged, or persisted — the UI only shows
 * that a proof of eligibility was generated. Replace with a real credential
 * acquisition flow for production.
 */
export function createDemoPrivateState(opts: { contractDomain?: Uint8Array } = {}): ProofGatePrivateState {
  const contractDomain = opts.contractDomain ?? DEFAULT_DOMAIN;
  const subject = keypair();
  const issuerPub = publicKey(demoIssuerSk());
  const signedIssuerId = issuerId(issuerPub.pubX, issuerPub.pubY);
  const subjectCommitment = subjectKey(contractDomain, subject.pubX, subject.pubY);
  const age = DEFAULT_MIN_AGE;
  const kycLevel = DEFAULT_KYC_LEVEL;
  const credentialVersion = DEFAULT_CREDENTIAL_VERSION;
  const policyVersion = DEFAULT_POLICY_VERSION;
  const issuedAt = 1_700_000_000n;
  const expiresAt = 2_000_000_000n;
  const credentialId = randomBytes32();
  const ageSlot = le32(age);
  const kycLevelSlot = le32(kycLevel);
  const credentialVersionSlot = le32(credentialVersion);
  const issuedAtSlot = le32(issuedAt);
  const expiresAtSlot = le32(expiresAt);
  const policyVersionSlot = le32(policyVersion);

  const message: CredentialMessage = {
    issuerId: signedIssuerId,
    subjectPkX: subject.pubX,
    subjectPkY: subject.pubY,
    subjectCommitment,
    credentialId,
    credentialVersionSlot,
    ageSlot,
    jurisdiction: pad32('US'),
    kycLevelSlot,
    issuedAtSlot,
    expiresAtSlot,
    policyVersionSlot,
    contractDomain,
  };
  const sig = signCredential(demoIssuerSk(), message);

  return {
    ownerSecret: randomBytes32(),
    subjectSk: le32(subject.sk),
    subjectPubX: subject.pubX,
    subjectPubY: subject.pubY,
    issuerPubX: issuerPub.pubX,
    issuerPubY: issuerPub.pubY,
    signedIssuerId,
    subjectCommitment,
    credentialId,
    credentialVersion,
    credentialVersionSlot,
    age,
    ageSlot,
    jurisdiction: pad32('US'),
    kycLevel,
    kycLevelSlot,
    issuedAt,
    issuedAtSlot,
    expiresAt,
    expiresAtSlot,
    policyVersion,
    policyVersionSlot,
    rx: sig.rx,
    ry: sig.ry,
    s: sig.s,
  };
}

/**
 * Fresh private state with NO credential and a random subject secret key.
 * The owner secret is random (the deployer becomes the owner via its
 * commitment in the constructor).
 */
export function freshPrivateState(): ProofGatePrivateState {
  const subject = keypair();
  return {
    ownerSecret: randomBytes32(),
    subjectSk: le32(subject.sk),
    subjectPubX: subject.pubX,
    subjectPubY: subject.pubY,
    issuerPubX: new Uint8Array(32),
    issuerPubY: new Uint8Array(32),
    signedIssuerId: new Uint8Array(32),
    subjectCommitment: new Uint8Array(32),
    credentialId: new Uint8Array(32),
    credentialVersion: 0n,
    credentialVersionSlot: new Uint8Array(32),
    age: 0n,
    ageSlot: new Uint8Array(32),
    jurisdiction: new Uint8Array(32),
    kycLevel: 0n,
    kycLevelSlot: new Uint8Array(32),
    issuedAt: 0n,
    issuedAtSlot: new Uint8Array(32),
    expiresAt: 0n,
    expiresAtSlot: new Uint8Array(32),
    policyVersion: 0n,
    policyVersionSlot: new Uint8Array(32),
    rx: new Uint8Array(32),
    ry: new Uint8Array(32),
    s: new Uint8Array(32),
  };
}

/**
 * Build the 8-slot jurisdiction list vector for the given jurisdiction codes
 * (zero-padded to 8 slots; the first entries are the real codes). Pass this
 * to `setPolicy` and `registerCredential`.
 */
export function jurisdictionSlots(codes: readonly string[]): Uint8Array[] {
  const slots: Uint8Array[] = [];
  for (let i = 0; i < 8; i++) {
    slots.push(i < codes.length ? pad32(codes[i]) : new Uint8Array(32));
  }
  return slots;
}

/**
 * Compute the jurisdiction commitment for a jurisdiction-list vector, exactly
 * as the contract does inside setPolicy (persistentHash of the 8 slots).
 */
export function jurisdictionCommitment(slots: Uint8Array[]): Uint8Array {
  if (slots.length !== 8) throw new Error('jurisdiction list must have exactly 8 slots');
  return persistentHash(new CompactTypeVector(8, new CompactTypeBytes(32)), slots);
}

/** Convenience: the three public identifiers for a wallet's private state. */
export function identifiers(
  ps: Pick<ProofGatePrivateState, 'subjectPubX' | 'subjectPubY' | 'issuerPubX' | 'issuerPubY' | 'credentialId'>,
  contractDomain: Uint8Array,
): { issuerId: Uint8Array; subjectPseudonym: Uint8Array; credentialId: Uint8Array } {
  return {
    issuerId: issuerId(ps.issuerPubX, ps.issuerPubY),
    subjectPseudonym: subjectKey(contractDomain, ps.subjectPubX, ps.subjectPubY),
    credentialId: ps.credentialId,
  };
}
