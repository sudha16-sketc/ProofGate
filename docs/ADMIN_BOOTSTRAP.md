# ProofGate — Admin Bootstrap Procedure (Preview)

**Contract:** `c1a42ae0c36cc5a2c420cc5c84d3b1a4147f3427fd4514c99835d5918e6d1f67`
**Deployed:** 2026-08-08T14:43:56Z by `mn_addr_preview1ee08n6m9hh4e36zk3ddpwul9fwjn9h38x2fr4upkpvud2ml03l9snf8q46`
**On-chain `adminPk`:** `ed6bacf3f2feaf0826e3c2a638a834d7ff0b84018cf9a439fb8ee61a69f65435`
**Status of this document:** **blocked.** The original admin secret is **NOT recoverable**
(see §8). The full bootstrap procedure is documented below so it is executable the moment a
valid admin secret is available, but against `c1a42ae0` today **step 0 cannot be satisfied** and
no transaction can be authorized. Nothing in this document mutates the chain.

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
(`src/deploy.ts:286`), where `SEED` is the wallet seed resolved by `getOrCreateWallet('preview')`
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
- `revokeCredential(credId)` / `unrevokeCredential(credId)` — revocation registry.
- `setIssuerStatus(pkX, pkY, status)` — suspend/revoke an issuer.
- `setSubjectStatus(subjectPk, status)` — suspend/revoke a subject.
- `revokePermit(permitId)` — forfeit a VALID permit.

> The browser dApp exposes the same actions (SetupCard / AdminPanel). The AdminPanel is gated by
> `meta.isAdmin` (frontend/src/lib/ledger.ts:214), which compares the session's `adminSecret`
> commitment to the on-chain `adminPk` — with a random per-session secret it is always `false`
> for `c1a42ae0`.

---

## 5. Wallet / network configuration required (Preview)

- **Network:** Preview. `resolveNetwork()` (src/network.ts:188) picks preview from
  `.midnight-state.json` (or the `-- --network preview` flag).
- **Endpoints** (src/network.ts:67): indexer `https://indexer.preview.midnight.network/api/v4/graphql`,
  indexer WS `wss://indexer.preview.midnight.network/api/v4/graphql/ws`, node `https://rpc.preview.midnight.network`.
  Overridable via `MIDNIGHT_INDEXER_URL`, `MIDNIGHT_INDEXER_WS_URL`, `MIDNIGHT_NODE_URL`,
  `MIDNIGHT_PROOF_SERVER_URL` (src/network.ts:171).
- **Proof generation:** CLI/deploy path requires the official proof server at
  `http://127.0.0.1:6300` (`docker compose up -d --wait proof-server`). The browser path proves
  in-wallet via the Lace dApp Connector (no server).
- **Wallet:** a funded wallet on Preview — needs `tNIGHT` (fees) and `tDUST` (token registration;
  auto-registered by the CLI). Resolved from `MIDNIGHT_WALLET_SEED` /
  `MIDNIGHT_WALLET_MNEMONIC` or `.midnight-state.json`.
- **Private-state encryption password:** `PRIVATE_STATE_PASSWORD`, defaulting to
  `Local-Devnet-Development-Placeholder-1` (src/deploy.ts:108, src/cli.ts:79). This only protects
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
issuer, both admin-only). The address is effectively **locked in pristine state forever**. The only
realistic paths forward are: (a) recover the secret from some source external to this machine
(e.g. the person who ran the deploy), or (b) treat `c1a42ae0` as a locked read-only instance and
deploy a fresh contract with a seed-derived (or otherwise known) admin secret. Per the standing
constraints, neither redeployment nor chain mutation was performed here.
