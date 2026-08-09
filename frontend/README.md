# ProofGate — Frontend

React + TypeScript + Vite web UI for ProofGate, the privacy-preserving compliance gateway demo (Midnight Preview).

## What it does

- Loads a `connected`, `unlocked` Midnight wallet via `@midnight-ntwrk/dapp-connector-api`
- Compiles the on-chain **PGM** contract (compiled Compact code + ZK artifacts live in `../managed`, repo root)
- Lets the user register with an **FIO-verifiable business identity** (`did:pgm` + X25519 keys)
- Displays the on-chain **ReputationLedger** (accrued attestations) and the **DisclosureProvider** (selective identity claims, one per FIO request)
- Sends transactions to the local node and queries the indexer to build the claim history

## Quick start

Prereqs: the repo root has already run `npm install` and the Midnight-managed build (`.mjs` wasm/bundle artifacts in `../managed`).

```sh
npm install
npm run dev        # sync:zk + vite dev server
```

Build for production:

```sh
npm run build      # sync:zk + tsc -b + vite build
npm run preview
```

## Notes

- `npm run dev` first runs `scripts/sync-zk.mjs`, which copies the compiled contract
  and ZK prover/verifier artifacts from the repo-root `managed/` directory into
  `public/zk` so the browser bundle can fetch them.
- `vite.config.ts` is wired for the Midnight stack: `vite-plugin-wasm`,
  `vite-plugin-top-level-await`, a single shared copy of the compact runtime
  (deduped via `resolve.dedupe`), and browser polyfills for Node-only imports.
