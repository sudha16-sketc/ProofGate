// Compiled ProofGate contract wiring for the browser (v3).
//
// The compiled artifacts (contract code + ZK keys + ZKIRs) come from the repo
// root's `managed/proofgate/` directory: the contract is imported directly and
// the ZK artifacts are synced into `public/` by `npm run sync:zk`.

import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import {
  findDeployedContract,
  type ContractProviders,
} from '@midnight-ntwrk/midnight-js-contracts';
import { asContractAddress } from '@midnight-ntwrk/midnight-js-types';
import type { Contract as ProofGateContract, Witnesses } from '../../../managed/proofgate/contract/index.js';
import * as ProofGateContractModule from '../../../managed/proofgate/contract/index.js';

import { createWitnesses, type ProofGatePrivateState } from './proofgate';
import type { ProofGateProviders } from './providers';

export const PRIVATE_STATE_ID = 'proofGatePrivateState';

/**
 * The ProofGate contract bound to this page session's witnesses.
 *
 * The witnesses read every value from the session's in-memory private state
 * (seeded by `deployContract` / `findDeployedContract`), so this single
 * compiled contract serves any wallet.
 *
 * The browser's `FetchZkConfigProvider` (built in `providers.ts`) resolves the
 * ZK artifacts relative to `window.location.origin` — it fetches
 * `<origin>/keys/<id>.prover` and `<origin>/zkir/<id>.bzkir`. Vite serves the
 * contents of `public/keys` and `public/zkir` (synced from `managed/proofgate/`
 * by `npm run sync:zk`) at the origin root, so the asset prefix is `'./'`.
 */
export const compiledProofGate = CompiledContract.make<ProofGateContract<ProofGatePrivateState>>(
  'proofgate',
  ProofGateContractModule.Contract,
).pipe(
  CompiledContract.withWitnesses(createWitnesses() as Witnesses<ProofGatePrivateState>),
  CompiledContract.withCompiledFileAssets('./'),
);

/**
 * Connect to an already-deployed ProofGate contract at `contractAddress`,
 * seeding the session's private state from `initialPrivateState`.
 *
 * The private state lives only in the in-memory provider and is consumed by
 * the witnesses during circuit execution; it is never persisted or logged.
 */
export function connectToDeployedProofGate(
  providers: ProofGateProviders,
  contractAddress: string,
  initialPrivateState: ProofGatePrivateState,
) {
  const contractProviders = providers as ContractProviders<ProofGateContract<ProofGatePrivateState>>;
  return findDeployedContract(contractProviders, {
    compiledContract: compiledProofGate,
    contractAddress: asContractAddress(contractAddress),
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState,
  });
}

/** The compiled contract's `ledger` view, used to render public state. */
export { ProofGateContractModule };

/** A zero-knowledge-proven handle on the deployed contract. */
export type ProofGateContractHandle = Awaited<ReturnType<typeof connectToDeployedProofGate>>;
