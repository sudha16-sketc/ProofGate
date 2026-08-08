// Environment configuration, loaded once at startup.
//
// The wallet's own service configuration (via `getConfiguration()`) is
// preferred for every on-chain action; the values below are the network-level
// defaults for the read-only ledger view and the wallet connection hint.
// No secrets (mnemonics, private keys, admin secrets) are ever read through
// VITE_* variables — these are all public, non-sensitive network settings.

export type ProofGateNetwork = 'undeployed' | 'preview' | 'preprod';

export const NETWORK: ProofGateNetwork = (import.meta.env.VITE_NETWORK ?? 'preview').trim() as ProofGateNetwork;
export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS ?? '').trim();

/** Default indexer URL per network (overridable via VITE_INDEXER_URL). */
export const DEFAULT_INDEXER_URLS: Record<ProofGateNetwork, string> = {
  undeployed: 'http://127.0.0.1:8088/api/v4/graphql',
  preview: 'https://indexer.preview.midnight.network/api/v4/graphql',
  preprod: 'https://indexer.preprod.midnight.network/api/v4/graphql',
};

export const INDEXER_URL =
  import.meta.env.VITE_INDEXER_URL?.trim() || (DEFAULT_INDEXER_URLS[NETWORK] ?? DEFAULT_INDEXER_URLS.preview);

/** Derive the indexer's GraphQL WebSocket URL from its HTTP URL. */
export function indexerWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, 'ws').replace(/\/graphql$/, '/graphql/ws');
}
