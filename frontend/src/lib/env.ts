// Environment configuration, loaded once at startup. This is the SINGLE source
// of truth for the frontend's Midnight network wiring.
//
// The wallet's own service configuration (via `getConfiguration()`) is
// preferred for every on-chain action; the presets below are the network-level
// defaults used for the read-only ledger view and the wallet connection hint.
//
// DEFAULT: the app is PREVIEW-FIRST. `preview` is used whenever no network env
// var is set, so the app never silently falls back to a local devnet. The
// `undeployed` preset (local Docker devnet) is reachable ONLY by explicitly
// setting VITE_NETWORK or VITE_NETWORK_ID — it is never a default.
//
// No secrets (mnemonics, private keys, admin secrets) are ever read through
// VITE_* variables — these are all public, non-sensitive network settings.

export type ProofGateNetwork = 'preview' | 'preprod' | 'undeployed';

/** Networks the app is allowed to target. Anything else fails loudly. */
export const SUPPORTED_NETWORKS: readonly ProofGateNetwork[] = ['preview', 'preprod', 'undeployed'];

/**
 * Per-network service endpoints.
 *
 *   indexer / indexerWs  — official Midnight indexer (or the local devnet one
 *                          for the explicitly selected `undeployed` preset).
 *   node                 — RPC/WS endpoint used by the CLI wallet sync; the
 *                          browser wallet brings its own node via Lace.
 *   proofServer          — proof endpoint. Empty for the browser path: proofs
 *                          are generated IN-WALLET by the connected Lace
 *                          wallet, so no server is required for normal usage.
 *                          Set VITE_PROOF_SERVER_URL to point the CLI's
 *                          `httpClientProofProvider` at a locally-run official
 *                          `midnightntwrk/proof-server` instance instead.
 *   faucet               — funding endpoint for public networks.
 */
export const NETWORK_PRESETS: Record<ProofGateNetwork, {
  readonly indexer: string;
  readonly indexerWs: string;
  readonly node: string;
  readonly proofServer: string;
  readonly faucet: string | null;
}> = {
  preview: {
    indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWs: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preview.midnight.network',
    proofServer: '',
    faucet: 'https://faucet.preview.midnight.network',
  },
  preprod: {
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWs: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
    proofServer: '',
    faucet: 'https://faucet.preprod.midnight.network',
  },
  // Local devnet — OPTIONAL and only reachable by explicit opt-in. Requires the
  // `docker compose up -d` stack (node :9944, indexer :8088, proof-server :6300).
  // Never used as a default; the app is Preview-first.
  undeployed: {
    indexer: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWs: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
    node: 'ws://127.0.0.1:9944',
    proofServer: 'http://127.0.0.1:6300',
    faucet: null,
  },
};

function resolveNetworkValue(): ProofGateNetwork {
  // VITE_NETWORK_ID is the documented canonical name; VITE_NETWORK is kept as
  // the legacy alias established by this project. Preview wins when unset.
  const raw = (import.meta.env.VITE_NETWORK_ID ?? import.meta.env.VITE_NETWORK ?? 'preview').trim();
  if (!SUPPORTED_NETWORKS.includes(raw as ProofGateNetwork)) {
    throw new Error(
      `Unsupported network "${raw}". Supported: ${SUPPORTED_NETWORKS.join(', ')}. ` +
        'The app is Preview-first — unset VITE_NETWORK/VITE_NETWORK_ID to use Midnight Preview.',
    );
  }
  return raw as ProofGateNetwork;
}

export const NETWORK: ProofGateNetwork = resolveNetworkValue();

/**
 * The live ProofGate deployment on Midnight Preview (deployed 2026-08-09,
 * owner-model; recorded in `.midnight-state.json`). Used as the default contract
 * address so the app always targets the real deployment instead of silently
 * creating an ephemeral "demo instance" whenever `VITE_CONTRACT_ADDRESS` is
 * unset. The historical `c1a42ae0…` instance is locked and incompatible.
 *
 * Override per-deployment via `VITE_CONTRACT_ADDRESS` in `.env.local`.
 */
export const PREVIEW_CONTRACT_ADDRESS =
  'c246ff86ef0e5177498c15f2f7fdf13b631aa3ae0ad4aebc905d3351882a5628';

export const CONTRACT_ADDRESS = (
  import.meta.env.VITE_CONTRACT_ADDRESS ??
  (NETWORK === 'preview' ? PREVIEW_CONTRACT_ADDRESS : '')
).trim();

const PRESET = NETWORK_PRESETS[NETWORK];

/**
 * Indexer used by the read-only public ledger view. Overridable via
 * VITE_INDEXER_URL; defaults to the official indexer for the selected network.
 * Never silently falls back to a local endpoint.
 */
export const INDEXER_URL = import.meta.env.VITE_INDEXER_URL?.trim() || PRESET.indexer;

/**
 * Proof-server endpoint used by `httpClientProofProvider`.
 *
 * Defaults to the SAME ORIGIN: in the single-server deployment the Express
 * backend relays /check and /prove to the Midnight proof-server sidecar, and
 * in dev the Vite proxy forwards them to the local `midnightntwrk/proof-server`
 * (http://127.0.0.1:6300). Override with VITE_PROOF_SERVER_URL to use any other
 * compatible endpoint instead.
 */
export const PROOF_SERVER_URL =
  import.meta.env.VITE_PROOF_SERVER_URL?.trim() ||
  PRESET.proofServer ||
  (typeof window !== 'undefined' ? window.location.origin : '');

/**
 * Per-proof HTTP timeout (ms) when proving through a remote proof server.
 *
 * The `midnight-js-http-client-proof-provider` default is 300_000 (5 min).
 * Cold-started Midnight proof servers download SRS params + proving keys on
 * first boot, and CPU-heavy circuits (e.g. registerCredential) take minutes —
 * both routinely exceed 5 min and the browser aborts the fetch ("Failed to
 * fetch"). Default to 20 minutes; tune via VITE_PROOF_SERVER_TIMEOUT_MS.
 */
export const PROOF_SERVER_TIMEOUT_MS = (() => {
  const raw = import.meta.env.VITE_PROOF_SERVER_TIMEOUT_MS?.trim();
  if (!raw) return 20 * 60_000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20 * 60_000;
})();

/** Derive the indexer's GraphQL WebSocket URL from its HTTP URL. */
export function indexerWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, 'ws').replace(/\/graphql$/, '/graphql/ws');
}

export const INDEXER_WS_URL = import.meta.env.VITE_INDEXER_WS_URL?.trim() || PRESET.indexerWs;

/** Convenience export: does the selected network require a local devnet? */
export const IS_LOCAL_DEVNET = NETWORK === 'undeployed';
