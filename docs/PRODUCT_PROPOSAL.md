# ProofGate — Product Proposal

> **Submission status: DRAFT — external approval not yet obtained.**
> The idea-list entry used for this submission must be confirmed by the team
> before the hackathon portal submission. See
> [Idea-list entry](#idea-list-entry) below — it is **not** pre-filled.

## Project name

**ProofGate** — a privacy-preserving compliance gateway on the Midnight blockchain.

## Idea-list entry

> Idea-list category/title: **[MANUAL CONFIRMATION REQUIRED]**
>
> The provided idea list is not present in this repository, so we cannot
> auto-fill the exact approved idea title. Before submission, replace the
> placeholder above with the matching entry from the official idea list
> (e.g. "privacy-preserving identity / compliance gateway" or the exact title
> the organizer assigned), and record the approval reference below.

- **Approved idea (to confirm):** _[MANUAL CONFIRMATION REQUIRED — fill from official idea list]_
- **Approval reference (to confirm):** _[MANUAL CONFIRMATION REQUIRED — e.g. approval email/ID]_
- **Submitted via hackathon portal:** _[MANUAL ACTION REQUIRED — submit and paste the submission URL here]_

> We do not claim organizer approval. The remaining step is a manual
> submission; this document describes exactly what to submit.

## Problem

Regulated services (financial products, token-gated communities, restricted
online services) must verify that users satisfy compliance requirements —
minimum age, KYC/AML clearance, jurisdiction, accreditation. Today this means
the user hands over identity documents and sensitive attributes to every
service. Each disclosure increases the attack surface: databases leak,
processors mishandle data, and users lose control of their personal
information.

The core conflict: **services need to know whether you are eligible, without
needing to know who you are.**

## Target users

- **Users** who want to access regulated services without repeatedly
  disclosing identity documents or exact personal attributes.
- **Regulated dApps / services** (DeFi lending, RWA token sales, restricted
  communities) that must enforce eligibility without storing or handling
  PII.
- **Credential issuers** (KYC/AML providers, government identity providers,
  universities) that want to issue reusable, verifiable credentials without
  becoming a data honeypot.

## Proposed solution

ProofGate is a compliance gateway: an issuer (KYC provider) signs a private
credential — claims about the user such as age, jurisdiction, and KYC level.
The user keeps that signed credential privately in their Midnight wallet and,
whenever a service asks, generates a **zero-knowledge proof** that the signed
claims satisfy the service's currently active compliance policy. The on-chain
contract verifies the proof and issues a **one-time permit** authorizing the
regulated action.

The user proves:

- the credential was issued by a registered, active issuer (signature verified
  **in-circuit**),
- they own the subject key the issuer signed (possession),
- the credential is currently valid (not expired, not revoked),
- the claims satisfy the active policy: `age ≥ minimumAge`,
  `kycLevel ≥ requiredKycLevel`, jurisdiction in the allowed set,
- without revealing **any** of: exact age, jurisdiction, KYC evidence, the
  signature, or identity.

## Why Midnight

Midnight is the privacy layer of the Cardano ecosystem: a **data-protecting
smart-contract platform** where program state can be **shielded** and
transactions are settled with **zero-knowledge proofs** (based on PLONK/UltraPLONK
circuits). ProofGate is a natural fit because compliance is fundamentally a
*verification* problem, not a *storage* problem:

- **Private by protocol, not by policy.** The Compact language treats private
  values as first-class witnesses; the ledger only ever sees what the contract
  explicitly discloses (`disclose`). There is no "don't display the PII in the
  UI" accident waiting to happen — the data physically cannot appear on-chain.
- **On-chain enforcement.** Eligibility is enforced by the contract itself
  (not by a trusted server), so permits are cryptographically bound to the
  eligibility proof and consumed atomically.
- **Unlinkability.** Domain-separated commitments give every ProofGate instance
  a different pseudonym for the same user; fresh salts make every permit
  unlinkable.

## Privacy model

**Private (never leaves the wallet):**
- exact age,
- jurisdiction code,
- KYC evidence / identity documents,
- the issuer's signature over the credential (`R`, `s`),
- the subject secret key and private attribute slots.

**Public (on the ledger, by explicit `disclose`):**
- domain-separated pseudonyms (commitments), issuer id, credential id,
- policy parameters (minimum age, required KYC level, allowed jurisdictions as
  a commitment),
- status flags (subject/issuer/permit status, expiry times, KYC level tier),
- one-time permit records (holder pseudonym, feature, policy id, status).

**What an observer learns:** that a contract interaction occurred, its timing,
the public policy, and that *some* credential was registered/attested/permitted.
**What an observer cannot learn:** identity, exact age, jurisdiction, or the
credential's private contents. See the README's *Midnight Privacy Model* for
the full threat model and the honest limits of metadata privacy.

## User journey

1. Open ProofGate, connect the Midnight (Lace) wallet on Preview.
2. (Demo) the wallet holds a demo credential signed by the demo issuer;
   production would fetch one from a real KYC issuer.
3. Admin activates the demo policy; the issuer is registered.
4. User **registers the credential** — ZK proof of signature + possession +
   validity; the ledger stores only a commitment.
5. User **attests compliance** — ZK proof that the *enrolled* claims satisfy
   the active policy, revealing none of them.
6. User **requests a one-time permit** for a feature (e.g. `rwa:purchase`).
7. The service **consumes the permit**; it is marked `CONSUMED` and cannot be
   replayed.

## Technical architecture

```
User (browser) ── Lace wallet (proving in-app)
        │  private credential + subject secret
        ▼
Midnight Preview network ── ProofGate contract (Compact, compiled 0.31.1)
        │  ZK proofs: registerCredential · attestCompliance · requestPermit · consumePermit
        ▼
Public ledger: pseudonyms · policy · statuses · one-time permits
```

- **Contract:** `contracts/proofgate.compact` (Compact 0.23.0, language_version).
  12 provable circuits + pure commitment helpers (adminKey, issuerId, subjectKey)
  and in-circuit Schnorr-over-Jubjub signature verification.
- **SDK:** Midnight.js 4.1.1 (`midnight-js-*`), Wallet SDK 1.2.0, compact-runtime
  0.16.0, onchain-runtime-v3 3.0.0 (single-copy enforced).
- **Frontend:** React + Vite (TypeScript), Preview-first, in-wallet proving via
  Lace's DApp Connector API.
- **CLI/deploy:** `src/cli.ts`, `src/deploy.ts` (prove via a local official
  proof server for scripting; the browser path needs none).
- **Tests:** vitest headless harness (`tests/proofgate.test.ts`) running the
  compiled contract against the Compact runtime — no Docker, no network.

## Smart contract functionality

| Circuit | Purpose | Proves (ZK) |
|---|---|---|
| `registerCredential` | identity enrollment | issuer signature, key possession, field binding, validity, non-revocation |
| `attestCompliance` | selective disclosure | enrolled claims satisfy the active policy (age, KYC, jurisdiction, versions) |
| `requestPermit` | access control | compliant + authorized subject; returns unlinkable permit id |
| `consumePermit` | one-time action | holder owns a valid, unexpired permit for the feature |
| `setPolicy` / `registerIssuer` / `setIssuerStatus` / `revokeCredential` / `setSubjectStatus` / `rotateAdmin` / `revokePermit` | governance | admin authorization |

## ZK / private computation

- **In-circuit Schnorr over Jubjub:** the issuer's signature is verified inside
  the circuit (`s·G == R + e·P_I`) over a domain-separated 18-slot message that
  covers every signed field and the ProofGate instance domain (cross-contract
  replay protection).
- **Private witnesses:** `age`, `jurisdiction`, `kycLevel`, `subjectSk`,
  `issuerPk`, signature `(rx, ry, s)`, slots, `permitSalt`.
- **Public disclosure is explicit:** only `disclose(...)`ed values (pseudonyms,
  policy parameters, statuses) reach the ledger. No private value is ever a
  public circuit input/output.
- **Permit unlinkability:** `permitId = hash(domain, holder, feature, policy,
  expiry, freshSalt)`.

## Expected impact

ProofGate demonstrates that regulatory compliance can be enforced on-chain
**without turning a blockchain into a database of personal data** — shrinking
the privacy cost of regulated DeFi/Web3 from "share your ID with every dApp"
to "prove eligibility once, per policy, in zero knowledge."

## Demo plan

See `docs/DEMO_SCRIPT.md`. The 60-second demo walks the full path on Midnight
Preview: connect wallet → private credential → generate proof → contract
verifies → one-time permit, while showing that the sensitive input is never
exposed. The headless test suite (52 passing tests) proves eligibility,
rejection, and non-exposure of private inputs.

## Future roadmap

- Real issuer onboarding flow (credential issuance via a production KYC
  provider).
- Multi-policy / multi-feature permit design.
- Permit delegation and encrypted off-chain metadata references.
- Mainnet deployment after Midnight mainnet availability.
- Audit the circuit code with an external ZK/crypto auditor.
