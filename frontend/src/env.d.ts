/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK?: string;
  readonly VITE_NETWORK_ID?: string;
  readonly VITE_CONTRACT_ADDRESS?: string;
  readonly VITE_INDEXER_URL?: string;
  readonly VITE_INDEXER_WS_URL?: string;
  readonly VITE_PROOF_SERVER_URL?: string;
  readonly VITE_PROOF_SERVER_TIMEOUT_MS?: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
