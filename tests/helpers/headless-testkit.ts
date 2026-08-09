/**
 * Headless ProofGate test harness.
 *
 * Runs the compiled ProofGate circuits directly against the Compact runtime —
 * NO Docker, NO proof server, NO network. This is the same execution engine
 * that produces proof transcripts on a real network; we simply never hand the
 * transcripts to a proving service.
 *
 * PRIVACY: the harness intentionally keeps the private witnesses in memory and
 * exposes only the *public* ledger view (what an indexer would serve) plus the
 * raw transcripts, so tests can assert that private inputs never leak into
 * public outputs.
 */
import {
  createCircuitContext,
  dummyContractAddress,
  emptyZswapLocalState,
  type CircuitContext,
  type EncodedZswapLocalState,
} from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  ledger as contractLedger,
  pureCircuits,
  type Circuits,
  type Ledger,
} from '../../managed/proofgate/contract/index.js';
import {
  createWitnesses,
  type ProofGatePrivateState,
} from '../../src/proofgate.js';
import { publicKey } from '../../src/schnorr.js';

type CircuitName = keyof Circuits<any>;

/** Deterministic test deployer identity used by headless deployments. */
export const TEST_DEPLOYER_ID: Uint8Array = Uint8Array.from(
  Buffer.from('deadbeef'.padEnd(64, 'ab').slice(0, 64), 'hex'),
);

/** Typed slice of a circuit call result (the runtime also carries more data). */
export type CircuitResult = {
  result: unknown;
  context: CircuitContext;
  proofData: { input?: unknown; output?: unknown; publicTranscript?: unknown[] };
};

export interface HeadlessProofGate {
  /** Compiled contract bound to the harness's witnesses. */
  contract: Contract;
  /** The private state driving the ZK witnesses (never part of public data). */
  privateState: ProofGatePrivateState;
  /** Simulated ledger block time (unix seconds) used by `blockTimeLessThan`. */
  time: number;
  /** Current circuit context (evolved state + private state). */
  context: CircuitContext;
  /** Public ledger view — exactly what an on-chain observer/indexer sees. */
  ledger(): Ledger;
  /** Advance the simulated block time by `seconds`. */
  advanceTime(seconds: number): void;
  /** Run an impure circuit, returning its results (transcript, public + private). */
  call(name: CircuitName, ...args: unknown[]): CircuitResult;
  /** Pure-circuit helpers for identifiers. */
  pure(name: keyof typeof pureCircuits, ...args: unknown[]): unknown;
}

export function hex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex');
}

/**
 * Flatten every byte array that is part of a circuit call's *public* data:
 * inputs, outputs and public transcript. Private witness values must never
 * appear here.
 */
export function flattenPublicBytes(
  results: { result: unknown; proofData: { input?: unknown; output?: unknown; publicTranscript?: unknown[] } },
): Uint8Array[] {
  const out: Uint8Array[] = [];

  const collectValue = (v: unknown): void => {
    if (v instanceof Uint8Array) out.push(v);
  };

  const collectCell = (cell: unknown): void => {
    if (cell && typeof cell === 'object' && 'value' in (cell as Record<string, unknown>)) {
      collectValue((cell as { value: unknown }).value);
    }
  };

  collectCell((results.proofData as Record<string, unknown>).input);
  collectCell((results.proofData as Record<string, unknown>).output);

  for (const op of results.proofData.publicTranscript ?? []) {
    if (op && typeof op === 'object' && 'push' in (op as Record<string, unknown>)) {
      collectCell((op as { push: unknown }).push);
    }
  }

  return out;
}

/**
 * Build a fresh headless ProofGate "deployment" for the given wallet.
 *
 * @param contractDomain the ProofGate instance domain (constructor arg).
 * @param privateState   the subject's full issuer-signed credential + secrets.
 * @param opts.owner     override the owner commitment published at deploy time
 *                 (default: commitment of privateState.ownerSecret). Passing a
 *                 commitment of a *different* secret simulates a wallet that
 *                 does not know the deployer's owner secret.
 * @param opts.deployerId override the deployer identity (default: TEST_DEPLOYER_ID).
 */
export function deployProofGate(
  contractDomain: Uint8Array,
  privateState: ProofGatePrivateState,
  opts: { owner?: Uint8Array; deployerId?: Uint8Array } = {},
): HeadlessProofGate {
  const time = Math.floor(Date.now() / 1000);
  const contract = new Contract(createWitnesses(privateState));

  const owner = opts.owner ?? pureCircuits.ownerKey(privateState.ownerSecret);
  const deployerIdentity = opts.deployerId ?? TEST_DEPLOYER_ID;
  const zswapLocalState: EncodedZswapLocalState = emptyZswapLocalState({
    bytes: new Uint8Array(32).fill(0x01),
  });

  const init = contract.initialState(
    { initialPrivateState: privateState, initialZswapLocalState: zswapLocalState },
    contractDomain,
    owner,
    deployerIdentity,
  );

  return buildHarness(
    contract,
    privateState,
    init.currentContractState.data,
    init.currentPrivateState,
    zswapLocalState.coinPublicKey,
    time,
  );
}

/**
 * Resume the same deployed contract from a *different* wallet's private state.
 *
 * Keeps the current ledger state and block time but swaps the ZK witnesses to
 * those of `privateState` — exactly what happens when a different wallet signs
 * in to an already-deployed contract. Used to test ownership transfer and
 * owner-secret turnover without re-deploying.
 */
export function resumeProofGate(
  pg: HeadlessProofGate,
  privateState: ProofGatePrivateState,
): HeadlessProofGate {
  const contract = new Contract(createWitnesses(privateState));
  const zswapLocalState: EncodedZswapLocalState = emptyZswapLocalState({
    bytes: new Uint8Array(32).fill(0x01),
  });
  return buildHarness(
    contract,
    privateState,
    pg.context.currentQueryContext.state,
    privateState,
    zswapLocalState.coinPublicKey,
    pg.time,
  );
}

function buildHarness(
  contract: Contract,
  privateState: ProofGatePrivateState,
  initialStateData: Parameters<typeof createCircuitContext>[2],
  initialPrivateState: ProofGatePrivateState,
  coinPublicKey: Parameters<typeof createCircuitContext>[1],
  time: number,
): HeadlessProofGate {
  const context = createCircuitContext(
    dummyContractAddress(),
    coinPublicKey,
    initialStateData,
    initialPrivateState,
    undefined,
    undefined,
    time,
  );
  const harness: HeadlessProofGate = {
    contract,
    privateState,
    time,
    context,

    ledger(): Ledger {
      return contractLedger(harness.context.currentQueryContext.state);
    },

    advanceTime(seconds: number): void {
      harness.time += seconds;
      harness.context = createCircuitContext(
        dummyContractAddress(),
        coinPublicKey,
        harness.context.currentQueryContext.state,
        harness.context.currentPrivateState,
        undefined,
        undefined,
        harness.time,
      );
    },

    call(name: CircuitName, ...args: unknown[]): CircuitResult {
      const circuit = (contract.circuits as Record<string, unknown>)[name] as (
        ctx: CircuitContext,
        ...a: unknown[]
      ) => CircuitResult;
      const results = circuit(harness.context, ...args);
      harness.context = createCircuitContext(
        dummyContractAddress(),
        coinPublicKey,
        results.context.currentQueryContext.state,
        results.context.currentPrivateState,
        undefined,
        undefined,
        harness.time,
      );
      return results;
    },

    pure(name: keyof typeof pureCircuits, ...args: unknown[]): unknown {
      const fn = pureCircuits[name] as (...a: unknown[]) => unknown;
      return fn(...args);
    },
  };

  return harness;
}

/**
 * Register the demo issuer whose secret key signed the wallet's credential.
 * The public key coordinates come from the issuer secret key.
 */
export function registerDemoIssuer(pg: HeadlessProofGate, issuerSk: bigint): void {
  const pk = publicKey(issuerSk);
  pg.call('registerIssuer', pk.pubX, pk.pubY, new Uint8Array(32));
}

/**
 * Expect a circuit call to fail with an assertion error whose message matches
 * `messagePart`. Circuit-level `require()` failures raise CompactError.
 */
export function expectCallFails(
  harness: HeadlessProofGate,
  messagePart: string,
  fn: () => unknown,
): void {
  let thrown: unknown;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  if (thrown === undefined) {
    throw new Error(`Expected circuit call to fail with "${messagePart}" but it succeeded`);
  }
  const msg = (thrown as Error).message ?? String(thrown);
  if (!msg.includes(messagePart)) {
    throw new Error(`Expected failure message containing "${messagePart}" but got: ${msg}`);
  }
}
