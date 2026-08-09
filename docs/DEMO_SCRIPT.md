# ProofGate — 60-Second Demo Script

> **Status:** script ready. The video itself **must be recorded manually**
> (screen recording of a browser + Midnight Lace wallet on Preview). The final
> URL will be added to the README once uploaded. This document is the exact
> narration and action plan.

## Setup for the recording

1. Chrome/Edge with the **Lace wallet** extension installed and switched to
   **Midnight Preview** (funded with tNIGHT + tDUST).
2. A **live owner-model deployment is already in place and bootstrapped**:
   contract `c246ff86ef0e5177498c15f2f7fdf13b631aa3ae0ad4aebc905d3351882a5628`
   on preview, with policy `policy:proofgate:demo:v1` active and the demo
   issuer registered (the historical `c1a42ae0…` instance is locked — its
   random owner/admin secret is unrecoverable and it cannot be administered).
   The CLI/deploy path uses this instance automatically (recorded in
   `.midnight-state.json`); if it is ever replaced, redeploy with
   `docker compose up -d --wait proof-server && npm run deploy -- --network preview`.
3. Point the dApp at the live contract and run it:
   `cp frontend/.env.example frontend/.env.local` (already pins the live
   address), then `npm run frontend:dev` (Preview-first; connects to the
   deployed contract).
4. The owner bootstrap (policy + issuer) is **already done**. If it is ever
   re-run on a fresh deployment, it must happen **before recording** — these
   steps are owner-only and the browser cannot reproduce the seed-derived owner
   secret: `npm run cli -- set-policy 706f6c6963793a70726f6f66676174653a64656d6f3a76310000000000000000`
   and `npm run cli -- register-issuer ff9b106df84acf1aed488ad66fd6b7e0ae62fbc17eb1889302495c037838862c 23cecb45b8d4dbdbbd6fc0c07bdd888d43bbd08032a56271117e68eb50e1a65d`.
5. A fresh browser profile (or incognito) so the demo starts clean.
6. OBS Studio / macOS QuickTime / Loom — 1080p, 60 s target.

> Privacy during recording: the UI never displays private values (age,
> jurisdiction, signature). Do **not** show the wallet's recovery phrase or any
> secret during the demo.

## Timeline

### 0:00–0:10 — Problem + intro

**Action:** On the ProofGate landing hero ("Prove eligibility. Not identity.").

**Narration:**
> "Regulated services need to know whether you're eligible — 18+, KYC-complete,
> in an allowed jurisdiction. Today that means handing your ID to every service.
> ProofGate changes that: it proves you're eligible, in zero knowledge, without
> ever revealing who you are or your exact details."

### 0:10–0:20 — Connect wallet

**Action:** Click **Connect wallet** → choose **Lace** → approve in the wallet.
The session boots and the overview shows "Connected" with the policy
metrics (minimum age 18, KYC ≥ 2).

**Narration:**
> "I connect my Midnight wallet on Preview. ProofGate immediately connects to
> the deployed contract — no local node, no proof server, everything runs
> against the official Midnight Preview network."

### 0:20–0:35 — Private compliance credential

**Action:** Navigate to the **Credential** page. Point at the "What this
credential proves" list and the **Private / Public** privacy boundary.

**Narration:**
> "My wallet holds a private compliance credential signed by a registered
> issuer. On the left, what stays private — identity, exact age, jurisdiction,
> the signature. On the right, what the ledger sees — only commitments and
> statuses. The contract verifies the signature in-circuit; the values never
> leave my wallet."

### 0:35–0:45 — Generate proof

**Action:** Go to **Prove eligibility**, pick a feature (e.g. "RWA token
purchase"), click **Start proof**. Show the pipeline: Register credential →
Request permit → Consume permit, with the proof visualizer animating.

**Narration:**
> "I prove eligibility for a regulated purchase. The wallet builds real
> zero-knowledge proofs — signature verification, possession, and the
> compliance predicates — locally, inside the wallet. The public ledger sees
> only the result."

### 0:45–0:52 — Contract verifies

**Action:** Show the "Permit issued" state and the activity feed (confirmed
txIds). Open the **Ledger** page to show the public state (policy, issuer,
subject, permit records) containing no personal data.

**Narration:**
> "The ProofGate contract on Midnight verifies every proof and issues a
> one-time permit. On the public ledger there's no name, no age, no
> jurisdiction — just a pseudonym, a policy, and a permit."

### 0:52–1:00 — "Eligible" + privacy payoff

**Action:** Open the **Permits** page showing the valid one-time permit, then
**Consume** it to show it is spent exactly once.

**Narration:**
> "Result: **Eligible.** One-time permit issued and consumed. I proved I meet
> the compliance policy — while my exact age, jurisdiction, and identity stayed
> private. That's Midnight's privacy model, working end to end."

## Recording checklist

- [ ] Lace on **Midnight Preview**, funded with tNIGHT + tDUST.
- [ ] dApp loads against the deployed Preview contract.
- [ ] All private values stay off screen (they never render anyway).
- [ ] Full happy path completes: policy → issuer → credential → permit → consume.
- [ ] Length ≤ 60 s; captions or narration clear.
- [ ] Upload to a public URL and paste it into the README's **Demo video** section.

## Post-recording

1. Upload the video (YouTube unlisted, or Loom) and set the share URL.
2. Update the README: replace the "demo video placeholder" with the real link.
