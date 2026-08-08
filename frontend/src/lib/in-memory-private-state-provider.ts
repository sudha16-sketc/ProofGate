// Session-only private state provider for the browser.
//
// PRIVACY NOTE: ProofGate's private inputs (subject secret, age, jurisdiction)
// are held in memory for the current page session only. They are never written
// to disk, localStorage, IndexedDB, or the ledger. Consequently export/import
// of private states and signing keys is intentionally unsupported and throws.

import type { ContractAddress, SigningKey } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type {
  PrivateStateId,
  PrivateStateProvider,
  PrivateStateExport,
  ImportPrivateStatesResult,
  SigningKeyExport,
  ImportSigningKeysResult,
} from '@midnight-ntwrk/midnight-js-types';

const STATE_NS = 'proofgate';
const SIGNING_KEY_NS = 'proofgate-signing-key';

/**
 * Create a PrivateStateProvider that keeps everything in a JavaScript Map
 * scoped to the contract address set via `setContractAddress`.
 */
export function inMemoryPrivateStateProvider<PSI extends PrivateStateId, PS>(): PrivateStateProvider<PSI, PS> {
  const states = new Map<string, PS>();
  const signingKeys = new Map<string, SigningKey>();
  let contractAddress: ContractAddress | undefined;

  const scoped = (ns: string, id: string): string => {
    if (contractAddress === undefined) {
      throw new Error('setContractAddress must be called before using the private state provider');
    }
    return `${ns}:${contractAddress}:${id}`;
  };

  return {
    setContractAddress(address: ContractAddress): void {
      contractAddress = address;
    },

    async set(privateStateId: PSI, state: PS): Promise<void> {
      states.set(scoped(STATE_NS, privateStateId), state);
    },

    async get(privateStateId: PSI): Promise<PS | null> {
      return states.get(scoped(STATE_NS, privateStateId)) ?? null;
    },

    async remove(privateStateId: PSI): Promise<void> {
      states.delete(scoped(STATE_NS, privateStateId));
    },

    async clear(): Promise<void> {
      states.clear();
    },

    async setSigningKey(address: ContractAddress, signingKey: SigningKey): Promise<void> {
      signingKeys.set(`${SIGNING_KEY_NS}:${address}`, signingKey);
    },

    async getSigningKey(address: ContractAddress): Promise<SigningKey | null> {
      return signingKeys.get(`${SIGNING_KEY_NS}:${address}`) ?? null;
    },

    async removeSigningKey(address: ContractAddress): Promise<void> {
      signingKeys.delete(`${SIGNING_KEY_NS}:${address}`);
    },

    async clearSigningKeys(): Promise<void> {
      signingKeys.clear();
    },

    async exportPrivateStates(): Promise<PrivateStateExport> {
      throw new Error(
        'Private state export is intentionally disabled: ProofGate private inputs are session-only.',
      );
    },

    async importPrivateStates(): Promise<ImportPrivateStatesResult> {
      throw new Error(
        'Private state import is intentionally disabled: ProofGate private inputs are session-only.',
      );
    },

    async exportSigningKeys(): Promise<SigningKeyExport> {
      throw new Error('Signing key export is intentionally disabled.');
    },

    async importSigningKeys(): Promise<ImportSigningKeysResult> {
      throw new Error('Signing key import is intentionally disabled.');
    },
  };
}
