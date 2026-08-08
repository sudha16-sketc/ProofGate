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
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { createProofProvider } from '@midnight-ntwrk/midnight-js-types';
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import type { ZKConfigProvider } from '@midnight-ntwrk/midnight-js-types';
import type { PrivateStateId } from '@midnight-ntwrk/midnight-js-types';

import { inMemoryPrivateStateProvider } from './in-memory-private-state-provider';
import type { ProofGatePrivateState } from './proofgate';

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

  const zkConfigProvider = new FetchZkConfigProvider(zkArtifactsBaseUrl, fetch.bind(window));
  const provingProvider = await connectedApi.getProvingProvider(zkConfigProvider);
  const proofProvider = createProofProvider(provingProvider);

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
