// Builds the full set of Midnight providers for ProofGate from a connected
// wallet (DApp Connector API v4).
//
// Every on-chain action is performed *through the wallet*:
//   - proving is delegated to the wallet via `getProvingProvider` (the wallet's
//     proving adapter — "proves in-app"),
//   - balancing is delegated via `balanceUnsealedTransaction`,
//   - submission is delegated via `submitTransaction`,
//   - the indexer/public-data service is taken from the wallet's own
//     `getConfiguration()` rather than hardcoded.

import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-utils';
import {
  Binding,
  Proof,
  SignatureEnabled,
  Transaction,
  type FinalizedTransaction,
  type TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { createProofProvider } from '@midnight-ntwrk/midnight-js-types';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import type { ZKConfigProvider } from '@midnight-ntwrk/midnight-js-types';
import type { PrivateStateId } from '@midnight-ntwrk/midnight-js-types';

import { inMemoryPrivateStateProvider } from './in-memory-private-state-provider';
import type { ProofGatePrivateState } from './proofgate';
import { NETWORK, PROOF_SERVER_URL } from './env';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

export type ProofGateProviders = {
  readonly privateStateProvider: ReturnType<
    typeof inMemoryPrivateStateProvider<PrivateStateId, ProofGatePrivateState>
  >;
  readonly publicDataProvider: ReturnType<typeof indexerPublicDataProvider>;
  readonly zkConfigProvider: ZKConfigProvider<string>;
  readonly proofProvider: ReturnType<typeof createProofProvider>;
  readonly walletProvider: {
    balanceTx(tx: UnboundTransaction, ttl?: Date): Promise<FinalizedTransaction>;
    getCoinPublicKey(): string;
    getEncryptionPublicKey(): string;
  };
  readonly midnightProvider: {
    submitTx(tx: FinalizedTransaction): Promise<TransactionId>;
  };
};

/**
 * Build the ProofGate providers from a connected wallet.
 *
 * @param connectedApi A connected DApp Connector API (v4).
 * @param zkArtifactsBaseUrl Base URL the browser should serve ZK artifacts
 *        (prover/verifier keys + ZKIRs) from — `window.location.origin` in
 *        practice, with `keys/` and `zkir/` synced by `npm run sync:zk`.
 */
export async function buildProofGateProviders(
  connectedApi: ConnectedAPI,
  zkArtifactsBaseUrl = window.location.origin,
): Promise<ProofGateProviders> {
  const config = await connectedApi.getConfiguration();
  const shielded = await connectedApi.getShieldedAddresses();

  // Guard: the wallet's network must match the network this build targets, and
  // the global network ID must already be set (main.tsx calls setNetworkId
  // before any provider exists). This guarantees every transaction path uses
  // exactly one network — Preview by default.
  const configuredNetworkId = getNetworkId();
  if (config.networkId !== NETWORK) {
    throw new Error(
      `Network mismatch: your wallet is on "${config.networkId}" but this dApp requires "${NETWORK}". ` +
        'Switch the wallet to Midnight Preview (or set VITE_NETWORK_ID to match the wallet) and reconnect.',
    );
  }
  if (configuredNetworkId !== NETWORK) {
    throw new Error(
      `Network ID is misconfigured: global "${configuredNetworkId}" vs dApp "${NETWORK}". Reload the page.`,
    );
  }

  const zkConfigProvider = new FetchZkConfigProvider(zkArtifactsBaseUrl, fetch.bind(window));

  // Proving is in-wallet by default (Preview-first, no proof server, no Docker).
  // When VITE_PROOF_SERVER_URL is set explicitly, prove via that endpoint
  // (e.g. a locally-run official `midnightntwrk/proof-server` instance).
  const proofProvider = PROOF_SERVER_URL
    ? httpClientProofProvider(PROOF_SERVER_URL, zkConfigProvider)
    : createProofProvider(await connectedApi.getProvingProvider(zkConfigProvider));

  return {
    privateStateProvider: inMemoryPrivateStateProvider<PrivateStateId, ProofGatePrivateState>(),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    zkConfigProvider,
    proofProvider,
    walletProvider: {
      getCoinPublicKey: () => shielded.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => shielded.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const { tx: raw } = await connectedApi.balanceUnsealedTransaction(toHex(tx.serialize()));
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>(
          'signature',
          'proof',
          'binding',
          fromHex(raw),
        );
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await connectedApi.submitTransaction(toHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  };
}
