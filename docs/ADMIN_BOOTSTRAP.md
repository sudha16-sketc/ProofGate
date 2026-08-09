# ProofGate — Admin Bootstrap Procedure (Preview)

> **Status: RESOLVED (2026-08-09).** The original admin bootstrap was **blocked**: the
> deployment's admin secret was generated as one-time random bytes in the deploy
> process's memory and is **NOT recoverable** (see §7). This has been fixed at the
> source by the **seed-derived owner + CLI execution model** (Option 1):
>
> - The contract now has an **owner** model: `export ledger owner` (commitment of an
>   owner secret), a `deployerId` recorded at deploy time, and
>   `transferOwnership(newOwner)` for governance handover.
> - On deploy, the owner secret is derived **deterministically from the deploy wallet
>   seed** (`ownerSecretFromSeed(seed)` = `deriveSecret(seed, 'owner-sk')`), so the
>   deployer is the initial owner and the secret can never be lost. The CLI re-derives
>   it from the same seed for every owner action.
> - `deployerId(address)` publishes a deterministic commitment of the deployer's
>   wallet address on-chain.
>
> The old `c1a42ae0` deployment (with the unrecoverable `adminPk`) is **incompatible
> with the new schema** — redeploy with `npm run deploy`. This document is retained as
> the forensic record of the failure and the diagnosis that drove the fix.

**Contract (legacy, deprecated):** `c1a42ae0c36cc5a2c420cc5c84d3b1a4147f3427fd4514c99835d5918e6d1f67`
**Deployed:** 2026-08-08T14:43:56Z by `mn_addr_preview1ee08n6m9hh4e36zk3ddpwul9fwjn9h38x2fr4upkpvud2ml03l9snf8q46`
**On-chain `adminPk` (legacy):** `ed6bacf3f2feaf0826e3c2a638a834d7ff0b84018cf9a439fb8ee61a69f65435`
**Status of this document:** **resolved** — superseded by the seed-derived owner model
(see banner above). The procedure below describes the legacy admin flow for historical
context; nothing in it mutates the chain today.

---

## Current implementation — the owner model (source of truth)

The sections below are the current, authoritative description. Everything in
§1–§7 is the retained forensic record of the legacy `adminPk` era and does not
match the current code (see the note after this section).

### Ownership model

- **The deployer becomes the contract owner.** At deploy time the owner secret
  is derived **deterministically from the deploy wallet seed**:
  `ownerSecretFromSeed(seed)` = `deriveSecret(seed, 'owner-sk')`
  (`src/proofgate.ts`). The constructor receives only its commitment:
  `owner = ownerKey(ownerSecret)` (`persistentHash("ProofGateOwner:v1" ∥
  ownerSecret)`), plus the deterministic deployer identity
  `deployerId(address)` (`persistentHash("ProofGateDeployer:v1" ∥ address
  slots)`, `src/schnorr.ts`).
- **Owner authorization is cryptographically enforced.** Every governance
  circuit asserts `ownerKey(ownerSecret()) == owner.read()` before mutating
  state (`contracts/proofgate.compact`). A non-owner cannot build a satisfiable
  proof, so non-owners cannot execute any governance operation.
- **Reproducible, never lost.** Because the secret is re-derived from the seed
  (kept in `.midnight-state.json`, mode 0600, and/or the BIP-39 mnemonic), the
  deployer *is* the initial owner and the secret is never a one-time in-memory
  value. It is never written to the chain — only the commitment is.
- **The browser recognises the owner through public data.** A browser session
  builds a fresh private state with a **random** owner secret, so it cannot
  reproduce the seed-derived secret. It *can* deterministically recognise the
  deployer/owner from public ledger data: `isDeployer` re-derives
  `deployerId(connectedAddress)` and `isOwner` compares
  `ownerKey(sessionSecret)` to the on-chain `owner` commitment
  (`frontend/src/lib/ledger.ts`). In the default deployer-as-owner setup
  `isOwner` is `false` in the browser, and owner actions are refused there
  (`runContractCall(..., { owner: true })` rejects before any transaction).
- **Owner-only transactions run through the deployment/CLI path.** The CLI
  re-derives the owner secret from the same seed for every owner action
  (`src/cli.ts`), so the deploy wallet executes governance; the browser cannot.
- **`transferOwnership(newOwner)` is owner-only.** The circuit requires
  `newOwner != owner` and `newOwner != pad(32, "")`. After the transfer the
  on-chain commitment changes: the previous owner's secret no longer matches it
  and the previous owner **loses all authority**; the new owner (holding the
  secret behind `newOwner`) becomes the sole owner and can transfer onward.

### Owner / governance operations (exact, implemented)

Contract circuits (`contracts/proofgate.compact`) — every one asserts
`ownerKey(ownerSecret()) == owner.read()`:

| Circuit | Effect |
|---|---|
| `setPolicy(policyId, version, minAge, kyc, credVersion, jurisdictionCommitment, jurisdictions)` | activates/replaces the policy; `version > 0`; the 8-slot jurisdiction list must hash to the disclosed commitment |
| `registerIssuer(pkX, pkY, metadataHash)` | registers an ACTIVE issuer (`issuers[issuerId] = { ACTIVE, pkX, pkY, metadataHash, … }`); issuer id must not already exist |
| `setIssuerStatus(pkX, pkY, status)` | ACTIVE/SUSPENDED/REVOKED an existing issuer |
| `revokeCredential(credId)` / `unrevokeCredential(credId)` | add/remove a credential id from the revocation set |
| `setSubjectStatus(subjectPk, status)` | ACTIVE/SUSPENDED/REVOKED an existing subject (by pseudonym) |
| `revokePermit(permitId)` | forfeit a VALID permit (→ REVOKED) |
| `transferOwnership(newOwner)` | hand governance to a new owner commitment |

CLI commands (`src/cli.ts`, seed-derived owner secret, executed by the deploy
wallet):

```bash
npm run cli -- info                                   # read-only: owner, deployerId, ledger
npm run cli -- set-policy <policyIdHex> [minAge] [kyc]      # owner: activate a policy (defaults minAge 18, KYC 2)
npm run cli -- register-issuer <pkXHex> <pkYHex>            # owner: register a KYC issuer (Jubjub coords)
npm run cli -- transfer-ownership <newOwnerHex>             # owner: transfer governance (32-byte commitment)
```

Browser UI: the Owner page (`frontend/src/components/pages/OwnerPage.tsx`,
`features/OwnerPanel.tsx`) exposes `activateDemoPolicy`, `registerDemoIssuer`,
`setPolicyAction`, `registerIssuerAction`, `setIssuerStatusAction`,
`revokeCredentialAction`, `unrevokeCredentialAction`, `setSubjectStatusAction`,
`revokePermitAction` and `transferOwnershipAction` (`frontend/src/store/session.ts`)
— all gated on `meta.isOwner`. For a seed-derived new deployment these are only
runnable by a session that holds the owner secret (the CLI/deploy path), or by
a browser session that received ownership (e.g. after an in-session
`transferOwnershipAction`).

### Proof flow (real, current)

```
connect wallet (browser / CLI)
  → owner initializes policy + issuer when required
      (owner-only; CLI re-derives ownerSecretFromSeed(seed))
  → user registers a credential          registerCredential(juris)   [ZK]
  → user proves eligibility              covered inside registerCredential
  → user requests a permit               requestPermit(feature, expiresAt, slot) [ZK]
  → user consumes the permit             consumePermit(feature, permitId) [ZK]
```

| Step | Who | Private (ZK witnesses) | Public on-chain |
|---|---|---|---|
| `setPolicy` | owner | `ownerSecret` | policy id/version, minAge, KYC, credVersion, jurisdiction commitment |
| `registerIssuer` | owner | `ownerSecret` | `issuerId`, issuer public key, metadata hash, status |
| `registerCredential` | user | subject secret, credential claims + Schnorr signature | pseudonym, credId, issuerId, kycLevel, policyVersion, expiresAt, status |
| `requestPermit` | user | subject secret, `permitSalt` | unlinkable `permitId`, holder pseudonym, feature, policyId, expiry, VALID |
| `consumePermit` | user | subject secret | permit → CONSUMED |

### New deployment flow (deployer-as-owner)

1. `docker compose up -d --wait proof-server` (CLI/deploy prove via the local
   proof server).
2. `npm run deploy -- --network preview` — creates/reuses a wallet (seed +
   BIP-39 mnemonic recorded in `.midnight-state.json`), funds it via the
   faucet, then deploys with constructor
   `(contractDomain, ownerKey(ownerSecretFromSeed(seed)), deployerId(address))`.
   The printed `owner` and `deployerId` are the contract's initial owner and
   deployer identity.
3. `npm run cli -- set-policy …` and `npm run cli -- register-issuer …` — the
   deploy wallet boots the policy and issuer registry (owner-only).
4. Point the browser at the new address (`VITE_CONTRACT_ADDRESS`); users
   register credentials and request/consume permits in the browser (ZK proofs
   via the local proof server — see §5).
5. Ownership can be transferred later:
   `npm run cli -- transfer-ownership <newOwnerCommitmentHex>`. The new owner
   must hold the secret behind that commitment; the old owner loses authority.

### Existing deployment (`c1a42ae0…`) — do NOT modify

- `c1a42ae0c36cc5a2c420cc5c84d3b1a4147f3427fd4514c99835d5918e6d1f67` is the
  **historical** deployment (2026-08-08). Its governance was keyed to a
  **one-time random `adminSecret`** generated in the deploy process's memory;
  that secret is **unrecoverable** (§7). No party — including the current
  browser wallet — can authorise any owner/governance transaction on it, and
  the user flow cannot run either (it needs an active policy + registered
  issuer, both owner-only).
- It **must NOT be modified or redeployed** as part of this task (or at all).
  The deployer-as-owner model applies to **NEW deployments only**. Do not imply
  `c1a42ae0…` can suddenly be administered by the current wallet — it is locked
  in pristine state forever. Its on-chain circuits (legacy `rotateAdmin` era)
  do not match the current compiled artifacts, so attaching the current
  frontend to it fails during session setup with a verifier-key mismatch, and
  the CLI `info` reports it as incompatible.

### Live deployment (owner model, current)

- **Contract address:**
  `c246ff86ef0e5177498c15f2f7fdf13b631aa3ae0ad4aebc905d3351882a5628`
  (deployed 2026-08-09 with the seed-derived owner model). Initial owner
  `2860db94…0c596c`, deployer identity `3c583294…8b384d`, deployer wallet
  `mn_addr_preview1ee08n6m9hh4e36zk3ddpwul9fwjn9h38x2fr4upkpvud2ml03l9snf8q46`.
- Policy `policy:proofgate:demo:v1` is active and the demo issuer is registered
  (owner bootstrap done via the CLI). `.midnight-state.json`
  (`deployments.preview`) and `frontend/.env.example` point at this instance,
  so `npm run cli` and the browser dApp both target it automatically.

---

## Legacy record — what §1–§7 describe

§1–§7 are the **historical record** of the original `c1a42ae0` admin bootstrap
failure. They describe the **pre-owner-model contract** that existed at deploy
time and has since been removed:

- Ledger `adminPk` and witness `adminSecret` are **gone**; the current contract
  uses `owner` (commitment of `ownerKey(ownerSecret())`) and `deployerId`.
- Circuits `adminKey` and `rotateAdmin` are **gone**; governance now uses
  `ownerKey(ownerSecret()) == owner` and `transferOwnership(newOwner)`.
- The constructor is now `(contractDomainParam, ownerParam, deployerIdParam)`
  (`contracts/proofgate.compact`), not `(contractDomainParam, adminPkParam)`.
- Any `proofgate.compact:NNN`, `src/…:NNN` and `AdminPanel`/`meta.isAdmin`
  references in §1–§4 refer to the **historical code state**, not the current
  files. See **"Current implementation — the owner model"** above for what
  exists today.

---

## 1. Which secret controls the deployed `adminPk`

The `adminPk` ledger field is the **one-way hash commitment** of a 32-byte admin master secret
(`adminSecret`), computed by the in-circuit `adminKey` circuit:

```
adminPk  = persistentHash([ pad(32, "ProofGateAdmin:v1"), adminSecret ])
```

- Contract circuit: `contracts/proofgate.compact:169` (`export circuit adminKey(sk)`).
- Constructor binds it at deploy time: `contracts/proofgate.compact:160` (`constructor(contractDomainParam, adminPkParam)`).
- Every governance circuit asserts `adminKey(adminSecret()) == adminPk.read()` before mutating
  state: `rotateAdmin` (:286), `setPolicy` (:305), `registerIssuer` (:325), `setIssuerStatus`
  (:340), `revokeCredential` (:364), `unrevokeCredential` (:370), `setSubjectStatus` (:380),
  `revokePermit` (:517).

**Consequence:** without the exact 32-byte `adminSecret`, no governance circuit can ever produce a
satisfiable proof — there is no adminless fallback and no time-lock recovery in the contract.

---

## 2. Where the admin secret was generated/stored during deployment

Deployment runs `src/deploy.ts`. The deploy-time private state is `demoPrivateState(SEED)`
(called at `src/deploy.ts:288`, defined in `src/proofgate.ts:159`), where `SEED` is the wallet seed resolved by `getOrCreateWallet('preview')`
(`src/network.ts:268`). The `adminSecret` field was filled from this call.

**Critical fact (verified against git history):** the deterministic seed derivation of
`adminSecret` **did not exist yet** when `c1a42ae0` was deployed.

| Commit | Time (UTC) | `demoPrivateState` adminSecret |
|---|---|---|
| `7c5185e` (checked out at deploy, 14:43) | 2026-08-08 14:12 | `adminSecret: randomBytes32()` — **fresh random per run** (`src/proofgate.ts:229`) |
| `7b29eb5` (first to add deterministic derivation) | 2026-08-08 16:54 | `adminSecret: deriveSecret(seed, 'admin-sk')` |

So the deployed `adminPk` at `c1a42ae0` came from a **one-time random secret generated in the
deploy process's memory**, with no code path that wrote it anywhere. The seed derivation that exists
today (`deriveSecret(SEED, 'admin-sk') = sha256(SEED + ":proofgate:admin-sk")`) was introduced
~2 hours after the deployment.

---

## 3. Recovery inventory — every source checked

| Source | Location | Contains adminSecret? | Finding |
|---|---|---|---|
| **Deployment artifacts** | `managed/proofgate/` (`contract/`, `keys/`, `zkir/`) | No | Compiled code + ZK keys only. `adminKey` is a one-way `persistentHash`; the secret cannot be inverted from `adminPk`. |
| **Wallet state file** | `.midnight-state.json` (mode 0600, gitignored) | No (seed only) | Holds `wallets.preview.seed` **and** the 24-word mnemonic. Verified: this seed **is** the deployer wallet (`deriveKeys(seed)` → bech32 = `mn_addr_preview1ee08n…`, exact match), **but** `adminKey(deriveSecret(seed,'admin-sk'))` = `ee24f601…` ≠ on-chain `ed6bacf3…`. The stored wallet is therefore the deployer wallet while the admin secret is *not* derivable from it. |
| **Environment variables** | `MIDNIGHT_WALLET_SEED`, `MIDNIGHT_WALLET_MNEMONIC`, `PRIVATE_STATE_PASSWORD` | No | None set in the current environment. Even an env-supplied seed would reproduce the deployer wallet but not a random admin secret. |
| **Wallet child state** | `.midnight-wallet-state/preview/{dust,shielded,unshielded}.json` | No | DUST / shielded / unshielded wallet keys only (restorable). |
| **Encrypted private-state DB** | `midnight-level-db/` (`levelPrivateStateProvider`, store `proofgate-state`) | Only for undeployed | Enumerated keys: entries exist only for the **undeployed** contract (`1e044895…`, account `b30698e0…`). **Zero entries** for the preview deployer or `c1a42ae0`. The preview private state (which would hold `adminSecret`) was never persisted. |
| **Deployment records** | `.midnight-state.json` → `deployments.preview` | No | Address + deployer + timestamp only. |
| **Shell / project files** | `.env`, `frontend/.env.local`, history | No | No tracked secrets; no `.env` present. |
| **Browser / Lace path** | in-memory page session | N/A | If the deploy had used the browser path, `createDemoPrivateState()` also uses `randomBytes32()` and the secret dies with the page. |

---

## 4. Bootstrap transaction sequence (exact, executable)

Assumes a wallet whose private state carries an `adminSecret` matching the on-chain `adminPk`
(e.g. a fresh deployment, or recovery of the secret). The CLI (Node, proof via local
`proof-server`) and the browser dApp both drive the same `handle.callTx` circuits.

All commands run from the repo root with the restored artifacts already in place
(`managed/proofgate/` compiled; `npm run compile` if needed) and `docker compose up -d --wait proof-server`
running:

```bash
# Target Preview (default; `.midnight-state.json` already selects preview).
npm run cli -- info                 # read-only: confirm ledger, adminPk, seq
```

### T1 — `setPolicy` (admin) — must be first
```bash
npm run cli -- set-policy 706f6c6963793a70726f6f66676174653a64656d6f3a76310000000000000000
```
- **Caller:** admin (witness `adminSecret` ⇒ `adminKey(adminSecret) == adminPk`).
- **Required state:** none (works from pristine contract). Any subsequent `setPolicy` is also valid (version bump).
- **Arguments:** `policyId` = `pad32("policy:proofgate:demo:v1")`, `version` = `1n`,
  `minimumAge` = `18n`, `requiredKycLevel` = `2n`, `requiredCredentialVersion` = `1n`,
  `jurisdictionCommitment` = `b5cfb78da2c404e1eb096e565b37ff242f07de0bbd1f5d027bf04c01c189bcbc`
  (persistentHash of slots `US, EU, UK`), jurisdiction slots = 8 × 32-byte pad (`US`,`EU`,`UK`,5×zero).
- **Circuit asserts (contracts/proofgate.compact:296):** admin; `version > 0`;
  `persistentHash(juris) == disclosed commitment`.
- **Resulting state:** `activePolicyId`, `activePolicyVersion=1`, `minimumAge=18`,
  `requiredKycLevel=2`, `requiredCredentialVersion=1`, `jurisdictionCommitment` all set; `seq +1`.
- **Failure mode if admin secret is wrong:** prover cannot satisfy the admin assert (invalid proof —
  the CLI run aborts during proving, nothing reaches the chain).

### T2 — `registerIssuer` (admin)
```bash
npm run cli -- register-issuer ff9b106df84acf1aed488ad66fd6b7e0ae62fbc17eb1889302495c037838862c \
    23cecb45b8d4dbdbbd6fc0c07bdd888d43bbd08032a56271117e68eb50e1a65d
```
- **Caller:** admin.
- **Required state:** none (independent of policy).
- **Arguments:** the issuer's Jubjub public key — above is the **demo issuer** (`sk = 42`,
  same key the CLI demo, the headless tests, and the browser dApp register); `metadataHash` = 32 zero bytes.
- **Circuit asserts (contracts/proofgate.compact:324):** admin; `issuerId = persistentHash(["ProofGateIssuer:v1", pkX, pkY])`
  not already registered.
- **Resulting state:** `issuers[issuerId] = Issuer{ ACTIVE, pkX, pkY, metadataHash, createdAt=seq, revokedAt=0 }`; `seq +1`.

### T3 — `registerCredential` (user — any wallet; **not** admin-gated)
```bash
npm run cli -- register-credential
```
- **Caller:** any wallet holding an issuer-signed credential **from a registered, ACTIVE issuer**;
  wallet must own the signed subject key.
- **Required state:** T1 done (active policy) and T2 done (issuer registered + ACTIVE).
  Fails with in-circuit asserts otherwise.
- **Arguments:** private witnesses = credential claims + Schnorr signature + subject secret;
  public arg = jurisdiction slots (the CLI passes `US, EU, UK` slots).
- **Circuit asserts (contracts/proofgate.compact:410):** issuer registered + ACTIVE;
  `checkSignature` (Schnorr over Jubjub); `checkPossession`; `checkCredential` (policy version == active,
  credential version == required, `age ≥ 18`, `kyc ≥ 2`, jurisdiction ∈ slots & == commitment);
  not future-issued, not expired; subject & credential not already registered/revoked.
- **Resulting state:** `subjects[pseudonym] = Subject{ ACTIVE, credId, issuerId, kycLevel, policyVersion, expiresAt, registeredAt=seq }`; `seq +1`.

### T4 — `requestPermit` (user)
```bash
npm run cli -- request-permit rwa:purchase
```
- **Caller:** the registered user.
- **Required state:** T3 done; subject ACTIVE, credential not revoked/expired, subject policy version == active.
- **Arguments:** `feature` = `pad32("rwa:purchase")` (or `defi:lend`), `expiresAt` = unix seconds
  (default `now + 1h`), `expiresAtSlot = le32(expiresAt)`.
- **Circuit asserts (contracts/proofgate.compact:441):** permit expiry in the future;
  permit id = `persistentHash(["ProofGatePermit:v1", domain, pk, feature, policyId, expiry, salt])`.
- **Resulting state:** `permits[permitId] = Permit{ holder, feature, policyId, policyVersion, credId, issuedAt=seq, expiresAt, VALID }`;
  `seq +1`; returns `permitId` (printed by the CLI).

### T5 — `consumePermit` (user, one-time)
```bash
npm run cli -- consume-permit rwa:purchase <permitIdHex>
```
- **Caller:** the permit holder.
- **Required state:** T4 done; permit VALID and unexpired, holder == caller pseudonym.
- **Arguments:** `feature` and the `permitId` from T4.
- **Circuit asserts (contracts/proofgate.compact:483).**
- **Resulting state:** `permits[permitId].status = CONSUMED`; `seq +1`.

### Optional admin actions (any order after T1/T2, all admin-gated)
- `rotateAdmin(newAdminPk)` — transfer governance (needs the old secret to authorize).
  **Legacy name — the current circuit is `transferOwnership(newOwner)`; the old owner's secret
  stops authorizing after the transfer.**
- `revokeCredential(credId)` / `unrevokeCredential(credId)` — revocation registry.
- `setIssuerStatus(pkX, pkY, status)` — suspend/revoke an issuer.
- `setSubjectStatus(subjectPk, status)` — suspend/revoke a subject.
- `revokePermit(permitId)` — forfeit a VALID permit.

> The browser dApp exposes the same actions (SetupCard / AdminPanel). The AdminPanel is gated by
> `meta.isAdmin` (frontend/src/lib/ledger.ts:214), which compares the session's `adminSecret`
> commitment to the on-chain `adminPk` — with a random per-session secret it is always `false`
> for `c1a42ae0`.
>
> **Current mapping:** AdminPanel → `features/OwnerPanel.tsx` (OwnerPage); `meta.isAdmin` →
> `meta.isOwner`/`isDeployer` computed in `deriveMeta` (`frontend/src/lib/ledger.ts`); gating is
> `sessionIsOwner()` (`frontend/src/store/session.ts`); SetupCard reflects session readiness, it is
> not the owner panel. For seed-derived deployments `isOwner` is `false` in the browser (the
> browser cannot reproduce `ownerSecretFromSeed(seed)`), and owner actions are refused there.

---

## 5. Wallet / network configuration required (Preview)

- **Network:** Preview. `resolveNetwork()` (src/network.ts:188) picks preview from
  `.midnight-state.json` (or the `-- --network preview` flag).
- **Endpoints** (src/network.ts:67): indexer `https://indexer.preview.midnight.network/api/v4/graphql`,
  indexer WS `wss://indexer.preview.midnight.network/api/v4/graphql/ws`, node `https://rpc.preview.midnight.network`.
  Overridable via `MIDNIGHT_INDEXER_URL`, `MIDNIGHT_INDEXER_WS_URL`, `MIDNIGHT_NODE_URL`,
  `MIDNIGHT_PROOF_SERVER_URL` (src/network.ts:171).
- **Proof generation:** every path requires the official proof server at
  `http://127.0.0.1:6300` (`docker compose up -d --wait proof-server`). The CLI/deploy
  proves via `httpClientProofProvider`; the browser dApp does the same via
  `VITE_PROOF_SERVER_URL` because the Lace wallet's own proving backend cannot prove
  ProofGate's custom circuits ("key not found: <circuit>"). The wallet signs,
  balances, and submits.
- **Wallet:** a funded wallet on Preview — needs `tNIGHT` (fees) and `tDUST` (token registration;
  auto-registered by the CLI). Resolved from `MIDNIGHT_WALLET_SEED` /
  `MIDNIGHT_WALLET_MNEMONIC` or `.midnight-state.json`.
- **Private-state encryption password:** `PRIVATE_STATE_PASSWORD`, defaulting to
  `Local-Devnet-Development-Placeholder-1` (src/deploy.ts:111, src/cli.ts:84). This only protects
  the LevelDB-encrypted private state; it does not help recover an admin secret that was never stored.

---

## 6. No chain mutation performed

Per instruction, **no transactions have been submitted.** All findings above were produced
read-only: indexer `queryContractState` calls, ledger decoding with the restored (deploy-time)
artifacts, `findDeployedContract`'s internal `verifyContractState` (which passed — the restored
verifier keys match `c1a42ae0`'s on-chain circuits), local file inspection, and local key/address
derivation. `c1a42ae0` remains untouched.

---

## 7. Recoverability verdict

**The original admin secret is NOT recoverable.** Evidence:

1. At deploy time the code generated `adminSecret = randomBytes32()` — a one-time, in-memory value
   (`src/proofgate.ts:229` at commit `7c5185e`).
2. `adminKey` is a one-way `persistentHash`, so `adminPk` cannot be inverted.
3. The local wallet seed/mnemonic reproduces the deployer wallet exactly but does **not** reproduce
   `adminPk` (verified: `ee24f601…` ≠ `ed6bacf3…`).
4. The encrypted private-state DB contains **no** entry for the preview wallet/contract — the private
   state (the only thing that ever held `adminSecret`) was never persisted.
5. No environment variable, deployment record, or project file carries it.

**Operational consequence for `c1a42ae0`:** all governance circuits are permanently unsatisfiable
for this instance, and the user flow cannot run either (it requires an active policy + registered
issuer, both owner-only). The address is effectively **locked in pristine state forever**.

**Resolution (implemented 2026-08-09):** rather than relying on a recoverable secret, the project
adopted the **seed-derived owner model** — the owner secret is now derived deterministically from
the deploy wallet seed at deploy time (`ownerSecretFromSeed`), so the deployer is always the
initial owner and the secret can never be lost. Governance handover is an explicit
`transferOwnership(newOwnerCommitment)` circuit, and a deterministic `deployerId(address)` records
the deployer on-chain. Deploying a fresh contract (`npm run deploy`) now yields a fully operable,
seed-controlled instance; `c1a42ae0` remains a locked legacy instance.
