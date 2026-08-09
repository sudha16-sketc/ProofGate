// ProofGate shared contract-facing helpers (Node side).
//
// PRIVACY NOTE: everything in this file that is *private* lives only in the
// wallet's private state (ProofGatePrivateState) and is consumed by the ZK
// witnesses below. None of these values are ever written to the ledger, logged,
// or emitted. The only things that reach the chain are hash commitments
// (pseudonym, issuer id, credential id), policy parameters and permit records
// produced by the circuits.

import { createHash } from 'node:crypto';

import type { Witnesses } from '../managed/proofgate/contract/index.js';
import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash,
} from '@midnight-ntwrk/compact-runtime';
import {
  deployerId,
  ownerKey,
  issuerId,
  keypair,
  le32,
  pad32,
  publicKey,
  randomBytes32,
  signCredential,
  subjectKey,
  CURVE_ORDER,
  type CredentialMessage,
} from './schnorr.js';

export { pad32, randomBytes32, le32, deployerId, ownerKey, issuerId, subjectKey };
export {
  CURVE_ORDER,
  DOMAIN,
  randScalar,
  keypair,
  publicKey,
  verifyCredential,
  signCredential,
} from './schnorr.js';
export type { CredentialMessage, JubjubKeyPair, SchnorrSignature } from './schnorr.js';

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

/** Features a compliant user may request permits for. */
export const FEATURES = {
  rwaPurchase: 'rwa:purchase',
  defiLend: 'defi:lend',
} as const;

export const JURISDICTIONS = ['US', 'EU', 'UK'] as const;

/** Canonical test/development instance domain. */
export const DEFAULT_DOMAIN = pad32('ProofGate:canonical:test:v1');

/**
 * Deterministic demo issuer for local/headless tests: sk = 42.
 * NEVER use a fixed scalar in production; this is a demo convenience.
 */
export function demoIssuerSk(): bigint {
  return 42n;
}

/** Deterministic 32-byte secret derived from a wallet seed (domain-separated). */
export function deriveSecret(seed: string, label: string): Uint8Array {
  return Uint8Array.from(createHash('sha256').update(`${seed}:proofgate:${label}`).digest());
}

/** Deterministic scalar in [0, CURVE_ORDER) from a 32-byte secret. */
export function scalarFromBytes(bytes: Uint8Array): bigint {
  let x = 0n;
  for (const b of bytes) x = (x << 8n) | BigInt(b);
  return x % CURVE_ORDER;
}

/** Deterministic demo issuer keypair derived from a wallet seed. */
export function demoIssuer(seed: string): { sk: bigint; pubX: Uint8Array; pubY: Uint8Array } {
  const sk = scalarFromBytes(deriveSecret(seed, 'issuer-sk'));
  const pub = publicKey(sk);
  return { sk, pubX: pub.pubX, pubY: pub.pubY };
}

/**
 * Deterministic demo wallet identity: a subject keypair derived from a wallet
 * seed and an issuer-signed credential from the demo issuer. The demo issuer
 * must be registered with the contract before this credential can be used.
 */
export function demoPrivateState(seed: string, opts: Partial<DemoCredentialArgs> = {}): ProofGatePrivateState {
  return issueCredential({
    issuerSk: demoIssuerSk(),
    subjectSk: scalarFromBytes(deriveSecret(seed, 'subject-sk')),
    jurisdiction: 'US',
    ownerSecret: ownerSecretFromSeed(seed),
    ...opts,
  });
}

export interface DemoCredentialArgs {
  issuerSk?: bigint;
  subjectSk: bigint;
  contractDomain?: Uint8Array;
  age?: bigint;
  jurisdiction?: string;
  kycLevel?: bigint;
  issuedAt?: bigint;
  expiresAt?: bigint;
  credentialVersion?: bigint;
  policyVersion?: bigint;
  credentialId?: Uint8Array;
  /** Owner master secret. Defaults to random; pass the seed-derived value for the deployer/owner wallet. */
  ownerSecret?: Uint8Array;
}

/**
 * Build a full demo credential (claims + signature) and a private state
 * carrying it, from the given issuer scalar and subject scalar.
 */
export function issueCredential(args: DemoCredentialArgs): ProofGatePrivateState {
  const {
    issuerSk = demoIssuerSk(),
    subjectSk,
    contractDomain = DEFAULT_DOMAIN,
    age = DEFAULT_MIN_AGE,
    jurisdiction = JURISDICTIONS[0],
    kycLevel = DEFAULT_KYC_LEVEL,
    issuedAt = 1_700_000_000n,
    expiresAt = 2_000_000_000n,
    credentialVersion = DEFAULT_CREDENTIAL_VERSION,
    policyVersion = DEFAULT_POLICY_VERSION,
    credentialId = randomBytes32(),
    ownerSecret = randomBytes32(),
  } = args;

  const issuerPub = publicKey(issuerSk);
  const subjectPub = publicKey(subjectSk);
  const signedIssuerId = issuerId(issuerPub.pubX, issuerPub.pubY);
  const subjectCommitment = subjectKey(contractDomain, subjectPub.pubX, subjectPub.pubY);
  const ageSlot = le32(age);
  const kycLevelSlot = le32(kycLevel);
  const credentialVersionSlot = le32(credentialVersion);
  const issuedAtSlot = le32(issuedAt);
  const expiresAtSlot = le32(expiresAt);
  const policyVersionSlot = le32(policyVersion);

  const message: CredentialMessage = {
    issuerId: signedIssuerId,
    subjectPkX: subjectPub.pubX,
    subjectPkY: subjectPub.pubY,
    subjectCommitment,
    credentialId,
    credentialVersionSlot,
    ageSlot,
    jurisdiction: pad32(jurisdiction),
    kycLevelSlot,
    issuedAtSlot,
    expiresAtSlot,
    policyVersionSlot,
    contractDomain,
  };
  const sig = signCredential(issuerSk, message);

  return {
    ownerSecret,
    subjectSk: le32(subjectSk),
    subjectPubX: subjectPub.pubX,
    subjectPubY: subjectPub.pubY,
    issuerPubX: issuerPub.pubX,
    issuerPubY: issuerPub.pubY,
    signedIssuerId,
    subjectCommitment,
    credentialId,
    credentialVersion,
    credentialVersionSlot,
    age,
    ageSlot,
    jurisdiction: pad32(jurisdiction),
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
 * The owner secret is random (a fresh deployment binds its commitment as the
 * initial owner, so the deployer must seed it deterministically afterwards —
 * see `ownerSecretFromSeed`).
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
 * The owner secret for deploying a new contract: derived deterministically
 * from the deploy wallet seed. The corresponding commitment
 * (ownerKey(ownerSecret)) is the `owner` passed to the constructor; the secret
 * itself stays in the wallet's private state and is re-derived by the CLI for
 * every owner action — so the deployer *is* the initial owner and no random
 * secret is ever lost.
 */
export function ownerSecretFromSeed(seed: string): Uint8Array {
  return deriveSecret(seed, 'owner-sk');
}

/** A fresh random owner secret (e.g. the secret behind a new owner commitment). */
export function freshOwnerSecret(): Uint8Array {
  return randomBytes32();
}

/** Build the witness object the compiled contract expects from a private state. */
export function createWitnesses(ps: ProofGatePrivateState): Witnesses<ProofGatePrivateState> {
  return {
    ownerSecret: (ctx) => [ctx.privateState, ps.ownerSecret],
    subjectSk: (ctx) => [ctx.privateState, ps.subjectSk],
    subjectPkX: (ctx) => [ctx.privateState, ps.subjectPubX],
    subjectPkY: (ctx) => [ctx.privateState, ps.subjectPubY],
    issuerPkX: (ctx) => [ctx.privateState, ps.issuerPubX],
    issuerPkY: (ctx) => [ctx.privateState, ps.issuerPubY],
    signedIssuerId: (ctx) => [ctx.privateState, ps.signedIssuerId],
    subjectCommitment: (ctx) => [ctx.privateState, ps.subjectCommitment],
    credentialId: (ctx) => [ctx.privateState, ps.credentialId],
    credentialVersion: (ctx) => [ctx.privateState, ps.credentialVersion],
    credentialVersionSlot: (ctx) => [ctx.privateState, ps.credentialVersionSlot],
    age: (ctx) => [ctx.privateState, ps.age],
    ageSlot: (ctx) => [ctx.privateState, ps.ageSlot],
    jurisdiction: (ctx) => [ctx.privateState, ps.jurisdiction],
    kycLevel: (ctx) => [ctx.privateState, ps.kycLevel],
    kycLevelSlot: (ctx) => [ctx.privateState, ps.kycLevelSlot],
    issuedAt: (ctx) => [ctx.privateState, ps.issuedAt],
    issuedAtSlot: (ctx) => [ctx.privateState, ps.issuedAtSlot],
    expiresAt: (ctx) => [ctx.privateState, ps.expiresAt],
    expiresAtSlot: (ctx) => [ctx.privateState, ps.expiresAtSlot],
    policyVersion: (ctx) => [ctx.privateState, ps.policyVersion],
    policyVersionSlot: (ctx) => [ctx.privateState, ps.policyVersionSlot],
    rx: (ctx) => [ctx.privateState, ps.rx],
    ry: (ctx) => [ctx.privateState, ps.ry],
    s: (ctx) => [ctx.privateState, ps.s],
    permitSalt: (ctx) => [ctx.privateState, randomBytes32()],
  };
}

/**
 * Build the 8-slot jurisdiction list vector for the given jurisdiction codes
 * (zero-padded to 8 slots; the first entries are the real codes).
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
