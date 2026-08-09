// Schnorr-over-Jubjub credential SDK (off-chain signing & verification).
//
// Browser-side copy of the repo root `src/schnorr.ts` (imports only
// `@midnight-ntwrk/compact-runtime` + Web Crypto, so it bundles for the Vite
// app unchanged). Keep the two files in sync.
//
// This module is the exact off-chain mirror of the in-circuit Schnorr scheme in
// `contracts/proofgate.compact`. The encoding conventions here MUST match the
// circuit witness-by-witness, otherwise proofs will fail:
//
// ENCODING CONVENTION (documented, must match the circuit exactly):
//   * Point coordinates and scalars are 32-byte LITTLE-ENDIAN field elements.
//     In-circuit `as Field` compiles to convertBytesToField = LE_int, the exact
//     inverse of `le32`, so any coordinate < the base-field modulus p round-trips
//     losslessly (no 2^248 truncation).
//   * The challenge is a domain-separated persistentHash over the full message
//     vector (see `challengeVector`). Field ordering is fixed and documented;
//     it MUST match `schnorrChallenge` in the contract.
//   * The challenge scalar e = degradeToTransient(persistentHash(...)) is always
//     < 2^248, hence a valid embedded-field scalar (2^248 < curve order r) with
//     no modular-reduction ambiguity.
//   * s = (k + e * sk) mod r, where r is the order of the embedded curve
//     (Jubjub over BLS12-381 Fr) and k is a fresh uniform scalar.
//   * Verification: s*G == R + e*P. This is performed both off-chain here
//     (`verifyCredential`) and in-circuit (`checkSignature`).
//
// SIGNED MESSAGE FIELDS (in order — this IS the credential document):
//   0. domain tag             pad32("ProofGateSchnorr:v1")
//   1. R.x                    signature nonce point x (LE)
//   2. R.y                    signature nonce point y (LE)
//   3. issuerPkX              issuer public key x (LE)
//   4. issuerPkY              issuer public key y (LE)
//   5. issuerId               persistentHash("ProofGateIssuer:v1" || pkX || pkY)
//   6. subjectPkX             subject public key x (LE)
//   7. subjectPkY             subject public key y (LE)
//   8. subjectCommitment      persistentHash("ProofGateSubject:v1" || domain || pkX || pkY)
//   9. credentialId           32 fresh random bytes chosen by the issuer (revocation id)
//  10. credentialVersion      LE Uint<8>
//  11. ageClaim               LE Uint<8> (raw age, never revealed on-chain)
//  12. jurisdictionClaim      pad32(code) (never revealed on-chain)
//  13. kycLevelClaim          LE Uint<8>
//  14. issuedAt               LE Uint<64> (unix seconds)
//  15. expiresAt              LE Uint<64> (unix seconds)
//  16. policyVersion          LE Uint<8>
//  17. contractDomain         the ProofGate instance domain the credential is bound to
//
// The signature therefore covers every security-critical field: claims, expiry,
// issuer identity, subject binding, policy reference and instance domain.

import {
  CompactTypeBytes,
  CompactTypeVector,
  constructJubjubPoint,
  degradeToTransient,
  ecAdd,
  ecMul,
  ecMulGenerator,
  jubjubPointX,
  jubjubPointY,
  persistentHash,
} from '@midnight-ntwrk/compact-runtime';

/** Order of the embedded curve's prime subgroup (252-bit). */
export const CURVE_ORDER = 0x0e7db4ea6533afa906673b0101343b00a6682093ccc81082d0970e5ed6f72cb7n;

/** Domain-separation tags. Each MUST match the constant used in the contract. */
export const DOMAIN = {
  schnorr: 'ProofGateSchnorr:v1',
  cred: 'ProofGateCredential:v1',
  subject: 'ProofGateSubject:v1',
  issuer: 'ProofGateIssuer:v1',
  owner: 'ProofGateOwner:v1',
  deployer: 'ProofGateDeployer:v1',
  permit: 'ProofGatePermit:v1',
} as const;

/** Right-pad UTF-8 text to 32 bytes (matches Compact `pad(32, "...")`). */
export function pad32(text: string): Uint8Array {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(text), 0);
  return out;
}

/** 32-byte little-endian encoding of a non-negative integer < 2^256. */
export function le32(x: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/** Decode a 32-byte little-endian field element to a bigint. */
export function le32ToBigInt(bytes: Uint8Array): bigint {
  let x = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) x = (x << 8n) | BigInt(bytes[i]);
  return x;
}

/** Uniform scalar in [0, CURVE_ORDER). */
export function randScalar(): bigint {
  const buf = new Uint8Array(40);
  crypto.getRandomValues(buf);
  let x = 0n;
  for (const b of buf) x = (x << 8n) | BigInt(b);
  return x % CURVE_ORDER;
}

/** 32 bytes of fresh randomness (Web Crypto — works in Node and the browser). */
export function randomBytes32(): Uint8Array {
  const out = new Uint8Array(32);
  crypto.getRandomValues(out);
  return out;
}

export interface JubjubKeyPair {
  /** Secret key, a scalar in [0, CURVE_ORDER). */
  sk: bigint;
  /** Public key X coordinate (32-byte LE field element). */
  pubX: Uint8Array;
  /** Public key Y coordinate (32-byte LE field element). */
  pubY: Uint8Array;
}

/** Generate an issuer or subject keypair. */
export function keypair(): JubjubKeyPair {
  const sk = randScalar();
  return { sk, ...publicKey(sk) };
}

/** Derive the public key coordinates from a secret key. */
export function publicKey(sk: bigint): { pubX: Uint8Array; pubY: Uint8Array } {
  const P = ecMulGenerator(sk);
  return { pubX: le32(jubjubPointX(P)), pubY: le32(jubjubPointY(P)) };
}

/**
 * The full 18-slot Schnorr challenge vector — byte-for-byte identical to the
 * circuit's `schnorrChallenge`. `message` carries the signed credential fields
 * (excluding the domain tag and R, which are added here).
 */
export function challengeVector(params: {
  rx: Uint8Array;
  ry: Uint8Array;
  issuerPkX: Uint8Array;
  issuerPkY: Uint8Array;
  issuerId: Uint8Array;
  subjectPkX: Uint8Array;
  subjectPkY: Uint8Array;
  subjectCommitment: Uint8Array;
  credentialId: Uint8Array;
  credentialVersionSlot: Uint8Array;
  ageSlot: Uint8Array;
  jurisdiction: Uint8Array;
  kycLevelSlot: Uint8Array;
  issuedAtSlot: Uint8Array;
  expiresAtSlot: Uint8Array;
  policyVersionSlot: Uint8Array;
  contractDomain: Uint8Array;
}): Uint8Array[] {
  return [
    pad32(DOMAIN.schnorr),
    params.rx,
    params.ry,
    params.issuerPkX,
    params.issuerPkY,
    params.issuerId,
    params.subjectPkX,
    params.subjectPkY,
    params.subjectCommitment,
    params.credentialId,
    params.credentialVersionSlot,
    params.ageSlot,
    params.jurisdiction,
    params.kycLevelSlot,
    params.issuedAtSlot,
    params.expiresAtSlot,
    params.policyVersionSlot,
    params.contractDomain,
  ];
}

/** Challenge scalar e = degradeToTransient(persistentHash(challengeVector)). */
export function challenge(params: Parameters<typeof challengeVector>[0]): bigint {
  return degradeToTransient(
    persistentHash(new CompactTypeVector(18, new CompactTypeBytes(32)), challengeVector(params)),
  );
}

export interface SchnorrSignature {
  rx: Uint8Array;
  ry: Uint8Array;
  s: Uint8Array;
}

export type CredentialMessage = Omit<
  Parameters<typeof challengeVector>[0],
  'rx' | 'ry' | 'issuerPkX' | 'issuerPkY'
>;

/**
 * Issue a Schnorr credential over the given attributes with the issuer's
 * secret key. `issuerPkX/Y` are the issuer's own public key coordinates (the
 * verifier binds them into the challenge), `message` is the credential fields
 * the issuer attests to, and `contractDomain` is the ProofGate instance domain
 * the credential is bound to.
 */
export function signCredential(
  issuerSk: bigint,
  message: CredentialMessage,
  k: bigint = randScalar(),
): SchnorrSignature {
  const pub = publicKey(issuerSk);
  const R = ecMulGenerator(k);
  const rx = le32(jubjubPointX(R));
  const ry = le32(jubjubPointY(R));
  const e = challenge({ rx, ry, issuerPkX: pub.pubX, issuerPkY: pub.pubY, ...message });
  const s = (k + e * issuerSk) % CURVE_ORDER;
  return { rx, ry, s: le32(s) };
}

/**
 * Verify a Schnorr credential signature against the issuer public key.
 *
 * This performs the REAL group-equality check s*G == R + e*P using the same
 * embedded-curve primitives the circuit uses. It returns false for:
 *   - tampered signatures (R or s),
 *   - a different issuer public key,
 *   - any modified credential field,
 *   - a non-canonical s >= r.
 */
export function verifyCredential(
  issuerPubX: Uint8Array,
  issuerPubY: Uint8Array,
  sig: SchnorrSignature,
  message: CredentialMessage,
): boolean {
  const sv = le32ToBigInt(sig.s);
  if (sv >= CURVE_ORDER) return false;
  const e = challenge({ rx: sig.rx, ry: sig.ry, issuerPkX: issuerPubX, issuerPkY: issuerPubY, ...message });
  const lhs = ecMulGenerator(sv);
  const rhs = ecAdd(
    constructFrom(sig.rx, sig.ry),
    ecMul(constructFrom(issuerPubX, issuerPubY), e),
  );
  return jubjubPointX(lhs) === jubjubPointX(rhs) && jubjubPointY(lhs) === jubjubPointY(rhs);
}

function constructFrom(x: Uint8Array, y: Uint8Array) {
  // Points are reconstructed from their full-precision coordinates using the
  // LE interpretation of the 32 bytes — identical to `as Field` in Compact.
  return constructJubjubPoint(le32ToBigInt(x), le32ToBigInt(y));
}

/** Issuer id: persistentHash("ProofGateIssuer:v1" + issuerPk). */
export function issuerId(pubX: Uint8Array, pubY: Uint8Array): Uint8Array {
  return persistentHash(new CompactTypeVector(3, new CompactTypeBytes(32)), [
    pad32(DOMAIN.issuer),
    pubX,
    pubY,
  ]);
}

/**
 * Subject pseudonym: persistentHash("ProofGateSubject:v1" + contractDomain +
 * subjectPk). Binding the contract domain into the commitment gives the same
 * user different pseudonyms on different ProofGate instances (cross-app
 * unlinkability) while staying stable within one instance.
 */
export function subjectKey(contractDomain: Uint8Array, subjectPubX: Uint8Array, subjectPubY: Uint8Array): Uint8Array {
  return persistentHash(new CompactTypeVector(4, new CompactTypeBytes(32)), [
    pad32(DOMAIN.subject),
    contractDomain,
    subjectPubX,
    subjectPubY,
  ]);
}

/** Owner commitment: persistentHash("ProofGateOwner:v1" + ownerSecret). */
export function ownerKey(ownerSecret: Uint8Array): Uint8Array {
  return persistentHash(new CompactTypeVector(2, new CompactTypeBytes(32)), [
    pad32(DOMAIN.owner),
    ownerSecret,
  ]);
}

/**
 * Deployer identity: persistentHash("ProofGateDeployer:v1" + address slots).
 * The bech32 address is split into 32-byte slots so the same synchronous
 * helper works in Node and the browser (no Web Crypto needed). Deterministic
 * for a given wallet address, so the deployer can be recognised everywhere.
 */
export function deployerId(address: string): Uint8Array {
  const raw = new TextEncoder().encode(address);
  const slots: Uint8Array[] = [];
  for (let i = 0; i < raw.length; i += 32) {
    const slot = new Uint8Array(32);
    slot.set(raw.subarray(i, i + 32));
    slots.push(slot);
  }
  if (slots.length === 0) slots.push(new Uint8Array(32));
  return persistentHash(new CompactTypeVector(1 + slots.length, new CompactTypeBytes(32)), [
    pad32(DOMAIN.deployer),
    ...slots,
  ]);
}
