/**
 * ProofGate — headless contract tests.
 *
 * Runs against the Compiled contract via the Compact runtime directly, without
 * Docker, a proof server, or a network. Three families of tests:
 *
 *   1. Circuit logic — pure commitment circuits (determinism, domain separation,
 *      one-wayness) plus in-circuit Schnorr verification.
 *   2. State transitions — the full admin/user lifecycle over the impure
 *      circuits, including every meaningful rejection path (bad signature,
 *      unregistered issuer, under-age, revoked credential, possession).
 *   3. Privacy — private witnesses (subject secret key, signature, age,
 *      jurisdiction) never appear in the public ledger view or in any public
 *      proof data; they only ever appear in the private transcript that feeds
 *      the ZK proof.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import {
  Contract,
  pureCircuits,
  SubjectStatus,
  IssuerStatus,
  PermitStatus,
  type Issuer,
  type Subject,
  type Permit,
  type Ledger,
} from '../managed/proofgate/contract/index.js';
import {
  DEFAULT_CREDENTIAL_VERSION,
  DEFAULT_DOMAIN,
  DEFAULT_KYC_LEVEL,
  DEFAULT_MIN_AGE,
  DEFAULT_POLICY_VERSION,
  FEATURES,
  JURISDICTIONS,
  demoIssuerSk,
  freshAdminSecret,
  identifiers,
  issueCredential,
  jurisdictionCommitment,
  jurisdictionSlots,
  pad32,
  type ProofGatePrivateState,
} from '../src/proofgate.js';
import { CURVE_ORDER, le32, publicKey, randScalar } from '../src/schnorr.js';
import {
  deployProofGate,
  expectCallFails,
  flattenPublicBytes,
  hex,
  registerDemoIssuer,
  type HeadlessProofGate,
} from './helpers/headless-testkit.js';

const FEATURE = FEATURES.rwaPurchase;
const now = (): bigint => BigInt(Math.floor(Date.now() / 1000));

/** Default issuer secret used across the suite (see demoIssuerSk). */
const ISSUER_SK = demoIssuerSk();

/** All 32-byte values (keys + public fields) the public ledger currently holds. */
function allLedgerBytes(l: Ledger): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const [k, s] of l.subjects) {
    out.push(k as Uint8Array, s.credId, s.issuerId);
  }
  for (const [id, p] of l.permits) {
    out.push(id as Uint8Array, p.holder, p.feature, p.policyId, p.credId);
  }
  for (const [id, is] of l.issuers) {
    out.push(id as Uint8Array, is.pkX, is.pkY, is.metadataHash);
  }
  for (const cr of l.revoked) out.push(cr as Uint8Array);
  out.push(l.contractDomain, l.adminPk, l.activePolicyId, l.jurisdictionCommitment);
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Activate the demo policy (version 1) with the default claims. */
function setDefaultPolicy(pg: HeadlessProofGate, version: bigint = DEFAULT_POLICY_VERSION): void {
  const slots = jurisdictionSlots(JURISDICTIONS);
  pg.call(
    'setPolicy',
    pad32('policy:proofgate:rwa:v1'),
    version,
    DEFAULT_MIN_AGE,
    DEFAULT_KYC_LEVEL,
    DEFAULT_CREDENTIAL_VERSION,
    jurisdictionCommitment(slots),
    slots,
  );
}

/** Register the wallet's credential against the active policy. */
function registerCred(pg: HeadlessProofGate): unknown {
  return pg.call('registerCredential', jurisdictionSlots(JURISDICTIONS));
}

/** Request a permit for the default feature expiring `ttl` seconds from now. */
function requestPermit(pg: HeadlessProofGate, ttl = 3600n): Uint8Array {
  const expiry = now() + ttl;
  const r = pg.call('requestPermit', pad32(FEATURE), expiry, le32(expiry));
  return r.result as Uint8Array;
}

/** Deploy a fresh harness with a demo identity + issuer + active policy. */
function freshDeployed(): { pg: HeadlessProofGate; issuerSk: bigint; privateState: ProofGatePrivateState } {
  const privateState = issueCredential({
    issuerSk: ISSUER_SK,
    subjectSk: randScalar(),
    jurisdiction: 'US',
  });
  const pg = deployProofGate(DEFAULT_DOMAIN, privateState);
  registerDemoIssuer(pg, ISSUER_SK);
  setDefaultPolicy(pg);
  return { pg, issuerSk: ISSUER_SK, privateState };
}

// ─── 1. Circuit logic (pure circuits) ────────────────────────────────────────

describe('pure circuits — commitment logic', () => {
  it('adminKey, subjectKey and issuerId are deterministic and domain-separated', () => {
    const skA = freshAdminSecret();
    const skB = freshAdminSecret();

    const adminA = pureCircuits.adminKey(skA);
    const adminA2 = pureCircuits.adminKey(skA);
    const adminB = pureCircuits.adminKey(skB);
    expect(hex(adminA)).toBe(hex(adminA2)); // deterministic
    expect(hex(adminA)).not.toBe(hex(adminB)); // differs across secrets

    const { privateState } = freshDeployed();
    const domain = DEFAULT_DOMAIN;
    const subj = pureCircuits.subjectKey(domain, privateState.subjectPubX, privateState.subjectPubY);
    expect(subj.length).toBe(32);
    // Binding the domain prevents cross-instance pseudonym correlation.
    expect(hex(subj)).not.toBe(
      hex(pureCircuits.subjectKey(pad32('other-instance'), privateState.subjectPubX, privateState.subjectPubY)),
    );

    const iid = pureCircuits.issuerId(privateState.issuerPubX, privateState.issuerPubY);
    expect(iid.length).toBe(32);
    expect(hex(iid)).not.toBe(hex(subj)); // domain-separated
    expect(hex(adminA)).not.toBe(hex(iid)); // domain-separated
  });

  it('commitments are one-way: the public pseudonym is not any secret', () => {
    const { privateState } = freshDeployed();
    const commitment = pureCircuits.subjectKey(
      DEFAULT_DOMAIN,
      privateState.subjectPubX,
      privateState.subjectPubY,
    );
    expect(bytesEqual(commitment, privateState.subjectSk)).toBe(false);
    expect(bytesEqual(commitment, privateState.subjectPubX)).toBe(false);
    expect(bytesEqual(commitment, privateState.subjectPubY)).toBe(false);
  });

  it('the pseudonym registered on-chain equals the pure-circuit commitment', () => {
    const { pg } = freshDeployed();
    registerCred(pg);
    const expected = pureCircuits.subjectKey(
      DEFAULT_DOMAIN,
      pg.privateState.subjectPubX,
      pg.privateState.subjectPubY,
    );
    let found: Uint8Array | null = null;
    for (const [pk] of pg.ledger().subjects) {
      if (hex(pk as Uint8Array) === hex(expected)) found = pk as Uint8Array;
    }
    expect(found).not.toBeNull();
  });
});

// ─── 2. State transitions (impure circuits, headless) ────────────────────────

describe('state transitions — the ProofGate lifecycle', () => {
  let pg: HeadlessProofGate;

  beforeEach(() => {
    pg = freshDeployed().pg;
  });

  it('constructor publishes the domain and admin commitment (public data)', () => {
    const privateState = issueCredential({ issuerSk: ISSUER_SK, subjectSk: randScalar() });
    const pg0 = deployProofGate(DEFAULT_DOMAIN, privateState);
    const l = pg0.ledger();
    expect(hex(l.contractDomain)).toBe(hex(DEFAULT_DOMAIN));
    expect(hex(l.adminPk)).toBe(hex(pureCircuits.adminKey(privateState.adminSecret)));
    expect(l.issuers.isEmpty()).toBe(true);
    expect(l.subjects.isEmpty()).toBe(true);
    expect(l.permits.isEmpty()).toBe(true);
    expect(l.revoked.isEmpty()).toBe(true);
  });

  it('admin activates a policy (published on-chain, governs all credentials)', () => {
    const l = pg.ledger();
    expect(hex(l.activePolicyId)).toBe(hex(pad32('policy:proofgate:rwa:v1')));
    expect(l.activePolicyVersion).toBe(DEFAULT_POLICY_VERSION);
    expect(l.minimumAge).toBe(DEFAULT_MIN_AGE);
    expect(l.requiredKycLevel).toBe(DEFAULT_KYC_LEVEL);
    expect(l.requiredCredentialVersion).toBe(DEFAULT_CREDENTIAL_VERSION);
    expect(hex(l.jurisdictionCommitment)).toBe(hex(jurisdictionCommitment(jurisdictionSlots(JURISDICTIONS))));
  });

  it('non-admin cannot activate a policy', () => {
    const privateState = issueCredential({ issuerSk: ISSUER_SK, subjectSk: randScalar() });
    const stranger = deployProofGate(DEFAULT_DOMAIN, privateState, {
      adminPk: pureCircuits.adminKey(freshAdminSecret()),
    });
    const slots = jurisdictionSlots(JURISDICTIONS);
    expectCallFails(stranger, 'caller is not the admin', () =>
      stranger.call(
        'setPolicy',
        pad32('x'),
        1n,
        DEFAULT_MIN_AGE,
        DEFAULT_KYC_LEVEL,
        DEFAULT_CREDENTIAL_VERSION,
        jurisdictionCommitment(slots),
        slots,
      ),
    );
    expect(hex(stranger.ledger().activePolicyId)).toBe(hex(new Uint8Array(32)));
  });

  it('admin registers an issuer (metadata hash disclosed, identity-free)', () => {
    const privateState = issueCredential({ issuerSk: ISSUER_SK, subjectSk: randScalar() });
    const pg0 = deployProofGate(DEFAULT_DOMAIN, privateState);
    const r = pg0.call('registerIssuer', privateState.issuerPubX, privateState.issuerPubY, new Uint8Array(32));
    expect(r.result).toEqual([]);
    const l = pg0.ledger();
    const id = pureCircuits.issuerId(privateState.issuerPubX, privateState.issuerPubY);
    expect(l.issuers.member(id)).toBe(true);
    expect(l.issuers.size()).toBe(1n);
    const issuer = l.issuers.lookup(id) as Issuer;
    expect(issuer.status).toBe(IssuerStatus.ACTIVE);
    expect(hex(issuer.metadataHash)).toBe(hex(new Uint8Array(32)));
    expect(l.subjects.isEmpty()).toBe(true);
  });

  it('cannot register the same issuer twice', () => {
    const privateState = issueCredential({ issuerSk: ISSUER_SK, subjectSk: randScalar() });
    const pg0 = deployProofGate(DEFAULT_DOMAIN, privateState);
    pg0.call('registerIssuer', privateState.issuerPubX, privateState.issuerPubY, new Uint8Array(32));
    expectCallFails(pg0, 'issuer already registered', () =>
      pg0.call('registerIssuer', privateState.issuerPubX, privateState.issuerPubY, new Uint8Array(32)),
    );
  });

  it('non-admin caller cannot register an issuer', () => {
    const privateState = issueCredential({ issuerSk: ISSUER_SK, subjectSk: randScalar() });
    const stranger = deployProofGate(DEFAULT_DOMAIN, privateState, {
      adminPk: pureCircuits.adminKey(freshAdminSecret()),
    });
    expectCallFails(stranger, 'caller is not the admin', () =>
      stranger.call('registerIssuer', stranger.privateState.issuerPubX, stranger.privateState.issuerPubY, new Uint8Array(32)),
    );
    expect(stranger.ledger().issuers.isEmpty()).toBe(true);
  });

  it('admin can suspend and re-activate an issuer; suspended issuers cannot back credentials', () => {
    const id = pureCircuits.issuerId(pg.privateState.issuerPubX, pg.privateState.issuerPubY);
    pg.call('setIssuerStatus', pg.privateState.issuerPubX, pg.privateState.issuerPubY, IssuerStatus.SUSPENDED);
    expect((pg.ledger().issuers.lookup(id) as Issuer).status).toBe(IssuerStatus.SUSPENDED);
    expectCallFails(pg, 'credential issuer not active', () => registerCred(pg));

    pg.call('setIssuerStatus', pg.privateState.issuerPubX, pg.privateState.issuerPubY, IssuerStatus.ACTIVE);
    registerCred(pg);
    expect(pg.ledger().subjects.size()).toBe(1n);
  });

  it('only registered active issuers can back a credential', () => {
    const privateState = issueCredential({ issuerSk: randScalar(), subjectSk: randScalar() });
    const pg2 = deployProofGate(DEFAULT_DOMAIN, privateState);
    setDefaultPolicy(pg2);
    // No issuer registered at all.
    expectCallFails(pg2, 'credential issuer not registered', () =>
      pg2.call('registerCredential', jurisdictionSlots(JURISDICTIONS)),
    );
  });

  it('rejects a credential whose signature is invalid (tampered s)', () => {
    const tampered: ProofGatePrivateState = { ...pg.privateState, s: pad32('tampered-signature') };
    const pgT = deployProofGate(DEFAULT_DOMAIN, tampered);
    registerDemoIssuer(pgT, ISSUER_SK);
    setDefaultPolicy(pgT);
    expectCallFails(pgT, 'signature x mismatch', () => pgT.call('registerCredential', jurisdictionSlots(JURISDICTIONS)));
    expect(pgT.ledger().subjects.isEmpty()).toBe(true);
  });

  it('rejects a credential signed for a different subject key (possession)', () => {
    // A wallet with a different secret key tries to register a credential that
    // was issued to someone else's subject public key.
    const victim = issueCredential({
      issuerSk: ISSUER_SK,
      subjectSk: randScalar(),
      age: 30n,
      jurisdiction: 'EU',
    });
    const attacker = deployProofGate(DEFAULT_DOMAIN, {
      ...victim,
      subjectSk: le32(randScalar()),
    });
    registerDemoIssuer(attacker, ISSUER_SK);
    setDefaultPolicy(attacker);
    expectCallFails(attacker, 'subject key mismatch', () => attacker.call('registerCredential', jurisdictionSlots(JURISDICTIONS)));
    expect(attacker.ledger().subjects.isEmpty()).toBe(true);
  });

  it('rejects a credential issued by an unregistered (other) issuer key', () => {
    const evil = issueCredential({ issuerSk: randScalar(), subjectSk: randScalar(), age: 30n, jurisdiction: 'EU' });
    const pgEvil = deployProofGate(DEFAULT_DOMAIN, evil);
    setDefaultPolicy(pgEvil);
    // Register a *different* issuer (the demo one) than the one that signed.
    const demoPub = publicKey(ISSUER_SK);
    pgEvil.call('registerIssuer', demoPub.pubX, demoPub.pubY, new Uint8Array(32));
    expectCallFails(pgEvil, 'credential issuer not registered', () =>
      pgEvil.call('registerCredential', jurisdictionSlots(JURISDICTIONS)),
    );
  });

  it('rejects an under-age credential (age < minimumAge, signed)', () => {
    const minor = issueCredential({
      issuerSk: ISSUER_SK,
      subjectSk: randScalar(),
      age: DEFAULT_MIN_AGE - 1n,
      jurisdiction: 'US',
    });
    const pgMinor = deployProofGate(DEFAULT_DOMAIN, minor);
    registerDemoIssuer(pgMinor, ISSUER_SK);
    setDefaultPolicy(pgMinor);
    expectCallFails(pgMinor, 'below minimum age', () => pgMinor.call('registerCredential', jurisdictionSlots(JURISDICTIONS)));
    expect(pgMinor.ledger().subjects.isEmpty()).toBe(true);
  });

  it('rejects a credential with insufficient KYC level (signed)', () => {
    const low = issueCredential({
      issuerSk: ISSUER_SK,
      subjectSk: randScalar(),
      age: 30n,
      kycLevel: DEFAULT_KYC_LEVEL - 1n,
      jurisdiction: 'US',
    });
    const pgLow = deployProofGate(DEFAULT_DOMAIN, low);
    registerDemoIssuer(pgLow, ISSUER_SK);
    setDefaultPolicy(pgLow);
    expectCallFails(pgLow, 'insufficient kyc level', () => pgLow.call('registerCredential', jurisdictionSlots(JURISDICTIONS)));
  });

  it('rejects a credential of an unsupported schema version (signed)', () => {
    const oldSchema = issueCredential({
      issuerSk: ISSUER_SK,
      subjectSk: randScalar(),
      age: 30n,
      credentialVersion: 0n,
      jurisdiction: 'US',
    });
    const pgOld = deployProofGate(DEFAULT_DOMAIN, oldSchema);
    registerDemoIssuer(pgOld, ISSUER_SK);
    setDefaultPolicy(pgOld);
    expectCallFails(pgOld, 'credential version not accepted', () => pgOld.call('registerCredential', jurisdictionSlots(JURISDICTIONS)));
  });

  it('rejects a credential whose policy version is not the active one', () => {
    const stale = issueCredential({
      issuerSk: ISSUER_SK,
      subjectSk: randScalar(),
      age: 30n,
      policyVersion: 99n,
      jurisdiction: 'US',
    });
    const pgStale = deployProofGate(DEFAULT_DOMAIN, stale);
    registerDemoIssuer(pgStale, ISSUER_SK);
    setDefaultPolicy(pgStale);
    expectCallFails(pgStale, 'policy version mismatch', () => pgStale.call('registerCredential', jurisdictionSlots(JURISDICTIONS)));
  });

  it('rejects a credential for a jurisdiction outside the policy list', () => {
    const rogue = issueCredential({
      issuerSk: ISSUER_SK,
      subjectSk: randScalar(),
      age: 30n,
      jurisdiction: 'XX',
    });
    const pgRogue = deployProofGate(DEFAULT_DOMAIN, rogue);
    registerDemoIssuer(pgRogue, ISSUER_SK);
    setDefaultPolicy(pgRogue);
    expectCallFails(pgRogue, 'jurisdiction not allowed', () => pgRogue.call('registerCredential', jurisdictionSlots(JURISDICTIONS)));
  });

  it('rejects a credential whose supplied jurisdiction list does not match the policy', () => {
    const pgBad = freshDeployed().pg;
    expectCallFails(pgBad, 'jurisdiction commitment mismatch', () =>
      pgBad.call('registerCredential', jurisdictionSlots(['US'])),
    );
  });

  it('rejects registration while no policy is active', () => {
    const privateState = issueCredential({ issuerSk: ISSUER_SK, subjectSk: randScalar() });
    const pgNoPolicy = deployProofGate(DEFAULT_DOMAIN, privateState);
    registerDemoIssuer(pgNoPolicy, ISSUER_SK);
    expectCallFails(pgNoPolicy, 'no active policy', () => pgNoPolicy.call('registerCredential', jurisdictionSlots(JURISDICTIONS)));
  });

  it('rejects a credential that is not yet valid (issued in the future)', () => {
    const future = issueCredential({
      issuerSk: ISSUER_SK,
      subjectSk: randScalar(),
      age: 30n,
      issuedAt: now() + 3600n,
      jurisdiction: 'US',
    });
    const pgF = deployProofGate(DEFAULT_DOMAIN, future);
    registerDemoIssuer(pgF, ISSUER_SK);
    setDefaultPolicy(pgF);
    expectCallFails(pgF, 'credential not yet valid', () => pgF.call('registerCredential', jurisdictionSlots(JURISDICTIONS)));
  });

  it('rejects a revoked credential at registration', () => {
    const privateState = issueCredential({ issuerSk: ISSUER_SK, subjectSk: randScalar() });
    const pg2 = deployProofGate(DEFAULT_DOMAIN, privateState);
    registerDemoIssuer(pg2, ISSUER_SK);
    setDefaultPolicy(pg2);
    const credId = identifiers(privateState, DEFAULT_DOMAIN).credentialId;
    pg2.call('revokeCredential', credId);
    expect(pg2.ledger().revoked.member(credId)).toBe(true);
    expectCallFails(pg2, 'credential revoked', () => pg2.call('registerCredential', jurisdictionSlots(JURISDICTIONS)));
    expect(pg2.ledger().subjects.isEmpty()).toBe(true);
  });

  it('full happy path: signed credential → permit → one-time consume', () => {
    registerCred(pg);

    const pseudonym = pureCircuits.subjectKey(
      DEFAULT_DOMAIN,
      pg.privateState.subjectPubX,
      pg.privateState.subjectPubY,
    );
    const expectedCredId = identifiers(pg.privateState, DEFAULT_DOMAIN).credentialId;
    let subject: Subject | null = null;
    for (const [pk, s] of pg.ledger().subjects) {
      if (hex(pk as Uint8Array) === hex(pseudonym)) subject = s as Subject;
    }
    expect(subject).not.toBeNull();
    expect(subject!.status).toBe(SubjectStatus.ACTIVE);
    expect(hex(subject!.credId)).toBe(hex(expectedCredId));
    expect(hex(subject!.issuerId)).toBe(hex(pg.privateState.signedIssuerId));
    expect(subject!.kycLevel).toBe(DEFAULT_KYC_LEVEL);
    expect(subject!.policyVersion).toBe(DEFAULT_POLICY_VERSION);

    const permitId = requestPermit(pg);

    let permit: Permit | null = null;
    for (const [id, p] of pg.ledger().permits) {
      if (hex(id as Uint8Array) === hex(permitId)) permit = p as Permit;
    }
    expect(permit).not.toBeNull();
    expect(permit!.holder).toEqual(pseudonym); // holder is the commitment
    expect(permit!.feature).toEqual(pad32(FEATURE));
    expect(permit!.policyId).toEqual(pad32('policy:proofgate:rwa:v1'));
    expect(permit!.status).toBe(PermitStatus.VALID);

    pg.call('consumePermit', pad32(FEATURE), permitId);
    for (const [, p] of pg.ledger().permits) {
      expect((p as Permit).status).toBe(PermitStatus.CONSUMED);
    }
  });

  it('an admin-revoked permit cannot be consumed', () => {
    registerCred(pg);
    const permitId = requestPermit(pg);
    pg.call('revokePermit', permitId);
    for (const [, p] of pg.ledger().permits) {
      expect((p as Permit).status).toBe(PermitStatus.REVOKED);
    }
    expectCallFails(pg, 'permit not valid', () => pg.call('consumePermit', pad32(FEATURE), permitId));
  });

  it('a revoked credential blocks permit issuance for a registered subject', () => {
    registerCred(pg);
    const credId = identifiers(pg.privateState, DEFAULT_DOMAIN).credentialId;
    pg.call('revokeCredential', credId);
    expectCallFails(pg, 'credential revoked', () => requestPermit(pg));
  });

  it('unrevoking a credential restores permit issuance', () => {
    registerCred(pg);
    const credId = identifiers(pg.privateState, DEFAULT_DOMAIN).credentialId;
    pg.call('revokeCredential', credId);
    pg.call('unrevokeCredential', credId);
    const permitId = requestPermit(pg);
    expect(permitId.length).toBe(32);
  });

  it('a permit cannot be consumed twice', () => {
    registerCred(pg);
    const permitId = requestPermit(pg);
    pg.call('consumePermit', pad32(FEATURE), permitId);
    expectCallFails(pg, 'permit not valid', () => pg.call('consumePermit', pad32(FEATURE), permitId));
  });

  it('a permit cannot be consumed for the wrong feature', () => {
    registerCred(pg);
    const permitId = requestPermit(pg);
    expectCallFails(pg, 'feature mismatch', () =>
      pg.call('consumePermit', pad32(FEATURES.defiLend), permitId),
    );
  });

  it('an expired permit cannot be consumed', () => {
    registerCred(pg);
    const expiry = now() + 600n;
    const permitId = pg.call('requestPermit', pad32(FEATURE), expiry, le32(expiry)).result as Uint8Array;
    pg.advanceTime(1200); // block time now exceeds the expiry
    expectCallFails(pg, 'permit expired', () => pg.call('consumePermit', pad32(FEATURE), permitId));
  });

  it('an expired credential blocks consumption after the subject record expires', () => {
    const privateState = issueCredential({
      issuerSk: ISSUER_SK,
      subjectSk: randScalar(),
      age: 30n,
      issuedAt: now() - 10_000n,
      expiresAt: now() + 600n,
      jurisdiction: 'US',
    });
    const pgS = deployProofGate(DEFAULT_DOMAIN, privateState);
    registerDemoIssuer(pgS, ISSUER_SK);
    setDefaultPolicy(pgS);
    pgS.call('registerCredential', jurisdictionSlots(JURISDICTIONS));
    const permitId = pgS.call('requestPermit', pad32(FEATURE), now() + 300n, le32(now() + 300n)).result as Uint8Array;
    pgS.advanceTime(900); // past subject expiry, still inside permit expiry
    expectCallFails(pgS, 'credential expired', () => pgS.call('consumePermit', pad32(FEATURE), permitId));
  });

  it('a user without a credential cannot request a permit', () => {
    expectCallFails(pg, 'credential not registered', () => requestPermit(pg));
  });

  it('each permit gets a fresh unlinkable id (fresh salt per request)', () => {
    registerCred(pg);
    const idA = requestPermit(pg, 3600n);
    const idB = requestPermit(pg, 7200n);
    expect(hex(idA)).not.toBe(hex(idB)); // fresh permitSalt → unlinkable permits
    expect(pg.ledger().permits.size()).toBe(2n);
  });

  it('registering the same credential twice is rejected', () => {
    registerCred(pg);
    expectCallFails(pg, 'already registered', () => registerCred(pg));
  });

  it('admin can rotate the admin key; the old admin loses authority', () => {
    const newAdminSecret = freshAdminSecret();
    const newAdminPk = pureCircuits.adminKey(newAdminSecret);
    pg.call('rotateAdmin', newAdminPk);
    expect(hex(pg.ledger().adminPk)).toBe(hex(newAdminPk));

    // The old wallet is no longer admin.
    expectCallFails(pg, 'caller is not the admin', () =>
      pg.call('registerIssuer', pg.privateState.issuerPubX, pg.privateState.issuerPubY, new Uint8Array(32)),
    );

    // The new admin (same credential, new admin secret) is in charge: a fresh
    // deployment bound to the new secret can register issuers.
    const newAdminPg = deployProofGate(DEFAULT_DOMAIN, { ...pg.privateState, adminSecret: newAdminSecret });
    newAdminPg.call('registerIssuer', newAdminPg.privateState.issuerPubX, newAdminPg.privateState.issuerPubY, new Uint8Array(32));
    expect(newAdminPg.ledger().issuers.size()).toBe(1n);
  });
});

// ─── 3. Privacy: private inputs are never exposed ────────────────────────────

describe('privacy — private inputs are never exposed', () => {
  it('the public ledger schema cannot even represent identity data', () => {
    const { pg } = freshDeployed();
    registerCred(pg);
    requestPermit(pg);

    const l = pg.ledger();
    for (const [, s] of l.subjects) {
      expect(Object.keys(s as Subject).sort()).toEqual([
        'credId',
        'expiresAt',
        'issuerId',
        'kycLevel',
        'policyVersion',
        'registeredAt',
        'status',
      ]);
      expect((s as Subject).status).toBe(SubjectStatus.ACTIVE);
    }
    for (const [, p] of l.permits) {
      expect(Object.keys(p as Permit).sort()).toEqual([
        'credId',
        'expiresAt',
        'feature',
        'holder',
        'issuedAt',
        'policyId',
        'policyVersion',
        'status',
      ]);
    }
  });

  it('secret key, signature and private attributes never appear in the public ledger values', () => {
    const privateState = issueCredential({ issuerSk: ISSUER_SK, subjectSk: randScalar(), age: 30n, jurisdiction: 'EU' });
    const pg = deployProofGate(DEFAULT_DOMAIN, privateState);
    registerDemoIssuer(pg, ISSUER_SK);
    setDefaultPolicy(pg);
    pg.call('registerCredential', jurisdictionSlots(JURISDICTIONS));
    requestPermit(pg);

    const secrets = [
      privateState.subjectSk,
      privateState.subjectPubX,
      privateState.subjectPubY,
      privateState.rx,
      privateState.ry,
      privateState.s,
      privateState.ageSlot,
      privateState.jurisdiction,
      privateState.kycLevelSlot,
      privateState.issuedAtSlot,
      privateState.expiresAtSlot,
      privateState.policyVersionSlot,
      privateState.credentialVersionSlot,
    ];

    for (const b of allLedgerBytes(pg.ledger())) {
      for (const secret of secrets) {
        expect(bytesEqual(b, secret)).toBe(false);
      }
    }
  });

  it('circuit transcripts keep private witnesses out of all public data', () => {
    const privateState = issueCredential({ issuerSk: ISSUER_SK, subjectSk: randScalar(), age: 30n, jurisdiction: 'EU' });
    const pg = deployProofGate(DEFAULT_DOMAIN, privateState);
    registerDemoIssuer(pg, ISSUER_SK);
    setDefaultPolicy(pg);
    const r = pg.call('registerCredential', jurisdictionSlots(JURISDICTIONS));

    const publicBytes = flattenPublicBytes(r as never);
    const secrets = [
      privateState.subjectSk,
      privateState.subjectPubX,
      privateState.subjectPubY,
      privateState.issuerPubX,
      privateState.issuerPubY,
      privateState.rx,
      privateState.ry,
      privateState.s,
      privateState.ageSlot,
      privateState.jurisdiction,
      privateState.kycLevelSlot,
      privateState.issuedAtSlot,
      privateState.expiresAtSlot,
      privateState.policyVersionSlot,
      privateState.credentialVersionSlot,
    ];
    for (const b of publicBytes) {
      for (const secret of secrets) {
        expect(bytesEqual(b, secret)).toBe(false);
      }
    }
  });

  it('permit holder on-chain is a pseudonym, not an identity', () => {
    const { pg } = freshDeployed();
    registerCred(pg);
    const permitId = requestPermit(pg);

    const pseudonym = pureCircuits.subjectKey(
      DEFAULT_DOMAIN,
      pg.privateState.subjectPubX,
      pg.privateState.subjectPubY,
    );
    for (const [, p] of pg.ledger().permits) {
      expect(hex((p as Permit).holder)).toBe(hex(pseudonym));
      expect(bytesEqual((p as Permit).holder, pg.privateState.subjectSk)).toBe(false);
    }
    expect(permitId.length).toBe(32);
  });

  it('the constructor disclosed values are limited to public policy fields', () => {
    const privateState = issueCredential({ issuerSk: ISSUER_SK, subjectSk: randScalar() });
    const pg = deployProofGate(DEFAULT_DOMAIN, privateState);
    const l = pg.ledger();
    expect(hex(l.contractDomain)).toBe(hex(DEFAULT_DOMAIN));
    expect(l.adminPk.length).toBe(32);
    expect(l.subjects.isEmpty()).toBe(true);
    expect(l.permits.isEmpty()).toBe(true);
    expect(hex(l.adminPk)).toBe(hex(pureCircuits.adminKey(privateState.adminSecret)));
  });

  it('compiled contract binds witnesses to the supplied private state', () => {
    expect(() => new Contract({} as never)).toThrow(/adminSecret|subjectSk/);
  });

  it('schnorr scalar math lives in the embedded-field domain (s < r)', () => {
    const { pg } = freshDeployed();
    let s = 0n;
    for (let i = pg.privateState.s.length - 1; i >= 0; i--) {
      s = (s << 8n) | BigInt(pg.privateState.s[i]);
    }
    expect(s).toBeGreaterThanOrEqual(0n);
    expect(s).toBeLessThan(CURVE_ORDER);
  });
});
