/**
 * ProofGate CLI — drive the deployed ProofGate contract.
 *
 * Usage:
 *   npm run cli -- info                                  # read-only contract summary via indexer
 *   npm run cli -- set-policy <policyIdHex> [minAge]     # owner: activate a compliance policy
 *   npm run cli -- register-issuer <pkXHex> <pkYHex>     # owner: register a trusted KYC issuer
 *   npm run cli -- transfer-ownership <ownerHex>         # owner: transfer governance to a new owner
 *   npm run cli -- register-credential                   # user: register an issuer-signed credential (ZK)
 *   npm run cli -- request-permit <feature> [expiry]     # user: request a one-time permit
 *   npm run cli -- consume-permit <feature> <permitIdHex># user: spend the permit once
 *   npm run cli -- setup-dust                  # fund wallet + mint DUST for tx costs
 *   npm run cli -- demo                                  # full happy-path walkthrough
 *
 * The CLI wallet's owner secret is derived deterministically from the wallet
 * seed (label "owner-sk"), so the deploy wallet is the initial owner and can
 * execute every owner action above. Append `-- --network preview` to target a
 * public network.
 *
 * PRIVACY: the wallet's private inputs (subject secret key, the credential
 * signature, age, jurisdiction) are read from private state, used to build the
 * zero-knowledge proof, and are never printed, logged, or written to the
 * ledger. Only hash commitments and status flags reach the chain.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type { Contract as ProofGateContract } from '../managed/proofgate/contract/index.js';

import { createKeystore, Roles } from '@midnight-ntwrk/wallet-sdk';
import {
  resolveNetwork,
  getOrCreateWallet,
  getDeployment,
  isValidMnemonic,
  mnemonicToSeedHex,
  type NetworkConfig,
  type NetworkId,
} from './network';
import {
  configureNetworkId,
  createWallet,
  deriveKeys,
  unshieldedToken,
  type WalletContext,
} from './wallet';
import {
  DEFAULT_CREDENTIAL_VERSION,
  DEFAULT_KYC_LEVEL,
  DEFAULT_MIN_AGE,
  FEATURES,
  JURISDICTIONS,
  createWitnesses,
  demoIssuerSk,
  demoPrivateState,
  deriveSecret,
  jurisdictionCommitment,
  jurisdictionSlots,
  le32,
  ownerKey,
  pad32,
  publicKey,
  type ProofGatePrivateState,
} from './proofgate';

// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

const PRIVATE_STATE_ID = 'proofGatePrivateState';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zkConfigPath = path.resolve(__dirname, '..', 'managed', 'proofgate');
const contractPath = path.join(zkConfigPath, 'contract', 'index.js');

function hex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex');
}

function printPrivacyBanner(): void {
  console.log('  🔐 Proved without revealing your input (zero-knowledge).');
}

function isTransientRpcError(err: unknown): boolean {
  const cause = (err as { cause?: { message?: string; toString?: () => string } })?.cause;
  const causeMsg = cause?.message ?? cause?.toString?.() ?? '';
  const msg = err instanceof Error ? err.message : String(err);
  const rendered = typeof (err as { toString?: () => string })?.toString === 'function' ? String(err) : '';
  return /disconnect|SubmissionError|ECONNREFUSED|socket/i.test(`${msg} ${causeMsg} ${rendered}`);
}

// ─── transfer-ownership-wallet — fixed verification constraints ────────────
//
// Ownership transfers target a new owner *commitment* (not a wallet address),
// but this command derives that commitment from a target wallet seed and
// refuses to submit unless both the derived target wallet and the current
// signer match these pinned identities. Nothing secret is ever printed.

const TARGET_WALLET_ADDRESS =
  'mn_addr_preview1wx5ae8r2f3wadq5hjpk5ztuvp5n9zrzru60es9xfwjceqls3fxfqnuqsd6';
const CURRENT_SIGNER_ADDRESS =
  'mn_addr_preview16d3j27enrhsuywyumarkwl6f4q8647yt29wudp3w8kwuwkwgl4aqczc8mk';
const TARGET_CONTRACT_ADDRESS =
  '0f7b8eb912f4acc9e6c24d6463512534c4e03d0f04cb7b3aae0810f9d830a540';

// BIP-32 master seeds are 16-64 whole bytes → 32-128 hex chars in even steps
// (mirrors src/network.ts validation).
const SEED_HEX_RE = /^(?:[0-9a-fA-F]{2}){16,64}$/;

/** Derive the unshielded bech32 address for a seed via the existing wallet impl. */
function deriveUnshieldedAddress(seed: string, networkId: NetworkId): string {
  const keys = deriveKeys(seed);
  return createKeystore(keys[Roles.NightExternal], networkId).getBech32Address().toString();
}

/**
 * Read the target wallet seed from the environment. The seed itself is never
 * printed, logged, or persisted — only commitments and addresses are.
 */
function resolveTargetSeed(): string {
  const envSeed = process.env.MIDNIGHT_TARGET_WALLET_SEED?.trim();
  const envMnemonic = process.env.MIDNIGHT_TARGET_WALLET_MNEMONIC?.trim();
  if (envSeed && envMnemonic) {
    throw new Error(
      'Both MIDNIGHT_TARGET_WALLET_SEED and MIDNIGHT_TARGET_WALLET_MNEMONIC are set — unset one.',
    );
  }
  if (envSeed) {
    const hexSeed = envSeed.startsWith('0x') || envSeed.startsWith('0X') ? envSeed.slice(2) : envSeed;
    if (!SEED_HEX_RE.test(hexSeed)) {
      throw new Error(
        'MIDNIGHT_TARGET_WALLET_SEED must be 32-128 hex characters (16-64 whole bytes).',
      );
    }
    return hexSeed;
  }
  if (envMnemonic) {
    if (!isValidMnemonic(envMnemonic)) {
      throw new Error(
        'MIDNIGHT_TARGET_WALLET_MNEMONIC is not a valid BIP-39 recovery phrase.',
      );
    }
    return mnemonicToSeedHex(envMnemonic);
  }
  throw new Error(
    'Set MIDNIGHT_TARGET_WALLET_SEED (hex seed) or MIDNIGHT_TARGET_WALLET_MNEMONIC to select the target wallet.',
  );
}

/**
 * Derive the target owner commitment and verify both wallet addresses and the
 * contract before any transaction is submitted. Prints only safe information.
 */
function prepareTransferOwnershipWallet(
  network: NetworkId,
  contractAddress: string,
  currentSeed: string,
): { ownerCommitment: Uint8Array; ownerCommitmentHex: string } {
  const targetSeed = resolveTargetSeed();

  // Requirement: owner secret = deriveSecret(targetSeed, "owner-sk"); the
  // commitment = ownerKey(ownerSecret). Converted to 64-char hex below.
  const ownerSecret = deriveSecret(targetSeed, 'owner-sk');
  const ownerCommitment = ownerKey(ownerSecret);
  const ownerCommitmentHex = hex(ownerCommitment);
  if (ownerCommitmentHex.length !== 64) {
    throw new Error('internal: owner commitment must be 64 hex characters');
  }

  const derivedWallet = deriveUnshieldedAddress(targetSeed, network);
  const currentSignerAddress = deriveUnshieldedAddress(currentSeed, network);

  if (derivedWallet !== TARGET_WALLET_ADDRESS) {
    console.error('❌ Derived target wallet does not match the expected address. Aborting — no transaction submitted.');
    console.error(`   expected : ${TARGET_WALLET_ADDRESS}`);
    console.error(`   derived  : ${derivedWallet}`);
    process.exit(1);
  }
  if (currentSignerAddress !== CURRENT_SIGNER_ADDRESS) {
    console.error('❌ Current signer does not match the expected owner wallet. Aborting — no transaction submitted.');
    console.error(`   expected : ${CURRENT_SIGNER_ADDRESS}`);
    console.error(`   derived  : ${currentSignerAddress}`);
    process.exit(1);
  }
  if (contractAddress !== TARGET_CONTRACT_ADDRESS) {
    console.error('❌ Contract address does not match the expected deployment. Aborting — no transaction submitted.');
    console.error(`   expected : ${TARGET_CONTRACT_ADDRESS}`);
    console.error(`   found    : ${contractAddress}`);
    process.exit(1);
  }

  console.log('');
  console.log(`Target wallet: ${TARGET_WALLET_ADDRESS}`);
  console.log(`Derived wallet: ${derivedWallet}`);
  console.log(`Owner commitment: ${ownerCommitmentHex}`);
  console.log(`Current signer: ${currentSignerAddress}`);
  console.log(`Contract: ${contractAddress}`);
  console.log(`Network: ${network === 'preview' ? 'Preview' : network}`);
  console.log('');

  return { ownerCommitment, ownerCommitmentHex };
}

async function loadProofGate() {
  if (!fs.existsSync(contractPath)) {
    console.error('\n❌ Contract not compiled! Run: npm run compile\n');
    process.exit(1);
  }
  const ProofGate = await import(pathToFileURL(contractPath).href);
  return ProofGate;
}

async function createProviders(walletCtx: WalletContext, networkConfig: any) {
  const privateStatePassword =
    process.env.PRIVATE_STATE_PASSWORD?.trim() || 'Local-Devnet-Development-Placeholder-1';

  const walletProvider = {
    getCoinPublicKey: () => walletCtx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };

  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const accountId = walletCtx.unshieldedKeystore.getBech32Address().toString();

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'proofgate-state',
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

async function requireProofServer(networkConfig: any, walletCtx: WalletContext): Promise<void> {
  try {
    await fetch(networkConfig.proofServer, { method: 'GET', signal: AbortSignal.timeout(3000) });
  } catch {
    console.error(
      '\n❌ Proof server not responding. Proof generation requires one of:\n' +
        '     1. A local proof server (Docker):  docker compose up -d --wait proof-server\n' +
        '     2. The browser DApp Connector wallet (proves in-app) — see frontend/.\n',
    );
    await walletCtx.wallet.stop();
    process.exit(1);
  }
}

async function readCurrentLedger(networkConfig: any, contractAddress: string) {
  const provider = indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS);
  const state = await provider.queryContractState(contractAddress as any);
  if (!state) throw new Error('Contract state not found at address ' + contractAddress);
  const ProofGate = await loadProofGate();
  return ProofGate.ledger(state.data);
}

async function printInfo(network: any, networkConfig: any, contractAddress: string): Promise<void> {
  console.log(`\nProofGate on ${network}: ${contractAddress}`);
  try {
    const l = await readCurrentLedger(networkConfig, contractAddress);
    console.log(`  contractDomain         : ${hex(l.contractDomain)}`);
    console.log(`  owner                  : ${hex(l.owner)}`);
    console.log(`  deployerId             : ${hex(l.deployerId)}`);
    console.log(`  activePolicyId         : ${hex(l.activePolicyId)}`);
    console.log(`  activePolicyVersion    : ${l.activePolicyVersion.toString()}`);
    console.log(`  minimumAge             : ${l.minimumAge.toString()}`);
    console.log(`  requiredKycLevel       : ${l.requiredKycLevel.toString()}`);
    console.log(`  requiredCredentialVer. : ${l.requiredCredentialVersion.toString()}`);
    console.log(`  registered issuers     : ${l.issuers.size().toString()}`);
    console.log(`  subjects               : ${l.subjects.size().toString()}`);
    for (const [pk, s] of l.subjects) {
      console.log(
        `    - subject ${hex(pk)} status=${s.status} kycLevel=${s.kycLevel.toString()} expiresAt=${s.expiresAt.toString()}`,
      );
    }
    console.log(`  permits                : ${l.permits.size().toString()}`);
    for (const [id, p] of l.permits) {
      console.log(
        `    - permit ${hex(id)} feature=${new TextDecoder().decode(p.feature)} holder=${hex(p.holder)} status=${p.status} expiresAt=${p.expiresAt.toString()}`,
      );
    }
  } catch {
    console.log(
      '  ⚠️  Contract state is not readable with this build. The deployed contract is likely an\n' +
        '      older ProofGate version (pre owner/deployerId). Redeploy with `npm run deploy`.\n',
    );
  }
}

async function findContract(walletCtx: WalletContext, networkConfig: any, contractAddress: string, privateState: ProofGatePrivateState) {
  const ProofGate = await loadProofGate();
  const witnesses = createWitnesses(privateState);
  const providers = await createProviders(walletCtx, networkConfig);
  const compiledContract = CompiledContract.make<ProofGateContract<ProofGatePrivateState>>(
    'proofgate',
    ProofGate.Contract,
  ).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
  const found = await findDeployedContract(providers, {
    compiledContract: compiledContract as any,
    contractAddress: contractAddress as any,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: privateState,
  });
  return { providers, found };
}

async function findLatestPermitId(networkConfig: any, contractAddress: string, holder: Uint8Array, feature: Uint8Array): Promise<Uint8Array | null> {
  const l = await readCurrentLedger(networkConfig, contractAddress);
  let latest: { id: Uint8Array; issuedAt: bigint } | null = null;
  for (const [id, p] of l.permits) {
    if (hex(p.holder) === hex(holder) && hex(p.feature) === hex(feature)) {
      if (!latest || p.issuedAt > latest.issuedAt) latest = { id: id as Uint8Array, issuedAt: p.issuedAt };
    }
  }
  return latest ? latest.id : null;
}

async function subjectPseudonym(networkConfig: any, contractAddress: string, privateState: ProofGatePrivateState): Promise<Uint8Array> {
  const l = await readCurrentLedger(networkConfig, contractAddress);
  const ProofGate = await loadProofGate();
  return ProofGate.pureCircuits.subjectKey(l.contractDomain, privateState.subjectPubX, privateState.subjectPubY);
}

async function cmdDemo(network: any, networkConfig: any, contractAddress: string, seed: string) {
  const walletCtx = await createWallet({ network, networkConfig, seed });
  await walletCtx.wallet.waitForSyncedState();
  await requireProofServer(networkConfig, walletCtx);

  const privateState = demoPrivateState(seed);
  const { found } = await findContract(walletCtx, networkConfig, contractAddress, privateState);

  console.log('\n─── Demo walkthrough ─────────────────────────────────────────\n');
  // The demo credential in `demoPrivateState(seed)` is signed by the fixed
  // demo issuer (sk = 42), so that is the public key we must register — the
  // same key the browser app and the headless tests register.
  const issuer = publicKey(demoIssuerSk());
  const juris = jurisdictionSlots(JURISDICTIONS);

  console.log('1/6 — Admin activates a compliance policy (minAge ≥ 18, KYC ≥ 2)...');
  const tx0 = await found.callTx.setPolicy(
    pad32('policy:proofgate:demo:v1'),
    1n,
    DEFAULT_MIN_AGE,
    DEFAULT_KYC_LEVEL,
    DEFAULT_CREDENTIAL_VERSION,
    jurisdictionCommitment(juris),
    juris,
  );
  printPrivacyBanner();
  console.log(`    ✅ txId=${tx0.public.txId}\n`);

  console.log('2/6 — Admin registers a trusted KYC issuer (public: issuer id hash)...');
  const tx1 = await found.callTx.registerIssuer(issuer.pubX, issuer.pubY, new Uint8Array(32));
  printPrivacyBanner();
  console.log(`    ✅ txId=${tx1.public.txId}\n`);

  console.log('3/5 — User registers a credential (ZK: issuer signature, possession, binding, policy compliance)...');
  const tx2 = await found.callTx.registerCredential(juris);
  printPrivacyBanner();
  console.log(`    ✅ txId=${tx2.public.txId}\n`);

  console.log('4/5 — User requests a one-time permit for rwa:purchase...');
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const tx3 = await found.callTx.requestPermit(pad32(FEATURES.rwaPurchase), expiresAt, le32(expiresAt));
  printPrivacyBanner();
  const pseudonym = await subjectPseudonym(networkConfig, contractAddress, privateState);
  const permitId = await findLatestPermitId(networkConfig, contractAddress, pseudonym, pad32(FEATURES.rwaPurchase));
  console.log(`    ✅ txId=${tx3.public.txId} permitId=${permitId ? hex(permitId) : 'n/a'}\n`);
  if (!permitId) throw new Error('Permit not found in ledger after request');

  console.log('5/5 — User consumes the permit (one-time access to the regulated action)...');
  const tx4 = await found.callTx.consumePermit(pad32(FEATURES.rwaPurchase), permitId);
  printPrivacyBanner();
  console.log(`    ✅ txId=${tx4.public.txId}\n`);

  console.log('─── Final state ──────────────────────────────────────────────\n');
  await printInfo(network, networkConfig, contractAddress);

  await walletCtx.wallet.stop();
}

// ─── setup-dust — prepare a wallet to pay transaction costs ────────────────
//
// Midnight transactions must be paid for in DUST tokens, which are minted
// from a wallet's NIGHT UTXOs once they are registered for dust generation
// (this is NOT automatic). A fresh wallet (e.g. one that received an
// ownership transfer) therefore cannot submit any transaction — set-policy,
// register-issuer, register-credential, ... — until it has minted dust.
// This command mirrors the dust setup in src/deploy.ts, plus faucet funding
// if the wallet is empty.

async function cmdSetupDust(
  network: NetworkId,
  networkConfig: NetworkConfig,
  seed: string,
): Promise<void> {
  const walletCtx = await createWallet({ network, networkConfig, seed });
  await walletCtx.wallet.waitForSyncedState();

  const address = walletCtx.unshieldedKeystore.getBech32Address();
  let state = await Rx.firstValueFrom(walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  let tNight = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  console.log(`\n  Wallet Address: ${address}`);
  console.log(`  tNIGHT balance: ${tNight.toLocaleString()}`);

  if (tNight === 0n) {
    if (!networkConfig.faucet) {
      console.error('\n  ❌ Wallet is empty and no faucet is configured for this network.');
      await walletCtx.wallet.stop();
      process.exit(1);
    }
    console.log(`\n  Faucet: ${networkConfig.faucet}`);
    console.log('  Waiting for tNIGHT to arrive (fund the address above)...');
    const rawTimeout = Number(process.env.MIDNIGHT_FAUCET_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 600_000;
    const start = Date.now();
    while (true) {
      await new Promise((r) => setTimeout(r, 10_000));
      state = await Rx.firstValueFrom(walletCtx.wallet.state().pipe(Rx.filter((x) => x.isSynced)));
      tNight = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
      if (tNight > 0n) {
        console.log(`\n  Funded! tNIGHT balance: ${tNight.toLocaleString()}\n`);
        break;
      }
      if (Date.now() - start > timeoutMs) {
        console.log(`\n  ❌ Funding not received within ${Math.round(timeoutMs / 60_000)} min.`);
        console.log(`  Address: ${address}`);
        console.log(`  Faucet:  ${networkConfig.faucet}`);
        await walletCtx.wallet.stop();
        process.exit(1);
      }
      const elapsed = Math.round((Date.now() - start) / 1000);
      process.stdout.write(`\r  ...still waiting (${elapsed}s elapsed)`);
    }
  }

  const DUST_REGISTER_MAX_ATTEMPTS = 20;
  const DUST_REGISTER_RETRY_DELAY_MS = 5000;
  let dustState = state;
  for (let attempt = 1; attempt <= DUST_REGISTER_MAX_ATTEMPTS; attempt++) {
    dustState = await Rx.firstValueFrom(walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
    const unregisteredUtxos = dustState.unshielded.availableCoins.filter(
      (c: any) => !c.meta?.registeredForDustGeneration,
    );
    if (unregisteredUtxos.length === 0) break;

    if (attempt === 1) {
      console.log(`  Registering ${unregisteredUtxos.length} NIGHT UTXOs for DUST generation...`);
    } else {
      console.log(
        `  ⏳ Registering ${unregisteredUtxos.length} NIGHT UTXOs (attempt ${attempt}/${DUST_REGISTER_MAX_ATTEMPTS})...`,
      );
    }

    try {
      const recipe = await walletCtx.wallet.registerNightUtxosForDustGeneration(
        unregisteredUtxos,
        walletCtx.unshieldedKeystore.getPublicKey(),
        (payload) => walletCtx.unshieldedKeystore.signData(payload),
      );
      const finalized = await walletCtx.wallet.finalizeRecipe(recipe);
      await walletCtx.wallet.submitTransaction(finalized);
    } catch (err: any) {
      if (!isTransientRpcError(err) || attempt === DUST_REGISTER_MAX_ATTEMPTS) throw err;
      console.log(
        `  ⚠ Submission failed (${err?.message || err}); retrying in ${DUST_REGISTER_RETRY_DELAY_MS / 1000}s...`,
      );
      await new Promise((r) => setTimeout(r, DUST_REGISTER_RETRY_DELAY_MS));
    }
  }

  if (dustState.dust.balance(new Date()) === 0n) {
    console.log('  Waiting for DUST tokens...');
    await Rx.firstValueFrom(
      walletCtx.wallet.state().pipe(
        Rx.throttleTime(5000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.dust.balance(new Date()) > 0n),
      ),
    );
  }
  dustState = await Rx.firstValueFrom(walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  console.log(`\n  DUST balance: ${dustState.dust.balance(new Date()).toLocaleString()}`);
  console.log('  DUST tokens ready!\n');

  await walletCtx.wallet.stop();
}

async function main(): Promise<void> {
  const { network, config: networkConfig } = resolveNetwork();
  configureNetworkId(networkConfig.networkId);
  const dep = getDeployment(network);
  if (!dep) {
    console.error(
      `\nNo ProofGate deployment recorded for network "${network}".\n` +
        '  Deploy first:  npm run deploy -- --network ' + network + '\n',
    );
    process.exit(1);
  }
  const contractAddress = dep.address;
  const args = process.argv.slice(2);
  const cmd = args[0] ?? 'help';

  if (cmd === 'help' || cmd === '-h' || cmd === '--help') {
    console.log(`
ProofGate CLI — ${network} — ${contractAddress}

  info                          read-only contract summary via indexer
  set-policy <policyIdHex>      owner: activate a compliance policy (defaults: minAge 18, KYC 2)
  register-issuer <xHex> <yHex> owner: register a trusted KYC issuer (Jubjub pubkey coords)
  transfer-ownership <ownerHex> owner: transfer governance to a new owner commitment
  transfer-ownership-wallet     owner: transfer governance to a target wallet (seed via MIDNIGHT_TARGET_WALLET_SEED)
  register-credential           user: register an issuer-signed credential proving policy compliance (ZK)
  request-permit <feature> [t]  user: request a one-time permit (t = unix expiry, default now+1h)
  consume-permit <f> <idHex>    user: consume a permit exactly once
  setup-dust                    fund wallet + mint DUST tokens for transaction costs
  demo                          full happy-path walkthrough
`);
    return;
  }

  if (cmd === 'info') {
    await printInfo(network, networkConfig, contractAddress);
    return;
  }

  if (cmd === 'demo') {
    const seed = getOrCreateWallet(network).seed;
    await cmdDemo(network, networkConfig, contractAddress, seed);
    return;
  }

  if (cmd === 'setup-dust') {
    const seed = getOrCreateWallet(network).seed;
    await cmdSetupDust(network as NetworkId, networkConfig, seed);
    return;
  }

  const seed = getOrCreateWallet(network).seed;

  // transfer-ownership-wallet: resolve and verify the target *before* any heavy
  // work or transaction. Aborts here unless every wallet/contract check passes.
  let transferTarget: { ownerCommitment: Uint8Array; ownerCommitmentHex: string } | null = null;
  if (cmd === 'transfer-ownership-wallet') {
    transferTarget = prepareTransferOwnershipWallet(network, contractAddress, seed);
  }

  const walletCtx = await createWallet({ network, networkConfig, seed });
  await walletCtx.wallet.waitForSyncedState();
  await requireProofServer(networkConfig, walletCtx);
  const privateState = demoPrivateState(seed);
  const { found } = await findContract(walletCtx, networkConfig, contractAddress, privateState);
  const juris = jurisdictionSlots(JURISDICTIONS);

  switch (cmd) {
    case 'set-policy': {
      const policyIdHex = args[1];
      if (!policyIdHex) throw new Error('usage: set-policy <policyIdHex> [minAge] [kycLevel]');
      const minAge = args[2] ? BigInt(args[2]) : DEFAULT_MIN_AGE;
      const kycLevel = args[3] ? BigInt(args[3]) : DEFAULT_KYC_LEVEL;
      const tx = await found.callTx.setPolicy(
        Uint8Array.from(Buffer.from(policyIdHex, 'hex')),
        1n,
        minAge,
        kycLevel,
        DEFAULT_CREDENTIAL_VERSION,
        jurisdictionCommitment(juris),
        juris,
      );
      printPrivacyBanner();
      console.log(`✅ policy activated. txId=${tx.public.txId}`);
      break;
    }
    case 'register-issuer': {
      const pkXHex = args[1];
      const pkYHex = args[2];
      if (!pkXHex || !pkYHex) throw new Error('usage: register-issuer <issuerPkXHex> <issuerPkYHex>');
      const issuerPkX = Uint8Array.from(Buffer.from(pkXHex, 'hex'));
      const issuerPkY = Uint8Array.from(Buffer.from(pkYHex, 'hex'));
      const tx = await found.callTx.registerIssuer(issuerPkX, issuerPkY, new Uint8Array(32));
      printPrivacyBanner();
      console.log(`✅ issuer registered. txId=${tx.public.txId}`);
      break;
    }
    case 'transfer-ownership': {
      const ownerHex = args[1];
      if (!ownerHex) throw new Error('usage: transfer-ownership <newOwnerCommitmentHex>');
      const newOwner = Uint8Array.from(Buffer.from(ownerHex, 'hex'));
      if (newOwner.length !== 32) throw new Error('new owner commitment must be exactly 32 bytes');
      const tx = await found.callTx.transferOwnership(newOwner);
      printPrivacyBanner();
      console.log(`✅ ownership transferred to ${ownerHex}. txId=${tx.public.txId}`);
      break;
    }
    case 'transfer-ownership-wallet': {
      if (!transferTarget) throw new Error('internal: transfer target not prepared');
      const tx = await found.callTx.transferOwnership(transferTarget.ownerCommitment);
      printPrivacyBanner();
      console.log(`✅ ownership transferred. txId=${tx.public.txId}`);
      console.log(`   new owner commitment: ${transferTarget.ownerCommitmentHex}`);
      const l = await readCurrentLedger(networkConfig, contractAddress);
      if (hex(l.owner) === transferTarget.ownerCommitmentHex) {
        console.log(`   ✓ on-chain owner commitment confirmed: ${hex(l.owner)}`);
      } else {
        console.log(
          `   ⚠ on-chain owner is ${hex(l.owner)} (does not match yet — indexer may lag)`,
        );
      }
      break;
    }
    case 'register-credential': {
      const tx = await found.callTx.registerCredential(juris);
      printPrivacyBanner();
      console.log(`✅ credential registered. txId=${tx.public.txId}`);
      break;
    }
    case 'request-permit': {
      const feature = args[1];
      if (!feature) throw new Error('usage: request-permit <feature> [expiryUnix]');
      const expiresAt = args[2] ? BigInt(args[2]) : BigInt(Math.floor(Date.now() / 1000) + 3600);
      const tx = await found.callTx.requestPermit(pad32(feature), expiresAt, le32(expiresAt));
      printPrivacyBanner();
      const pseudonym = await subjectPseudonym(networkConfig, contractAddress, privateState);
      const permitId = await findLatestPermitId(networkConfig, contractAddress, pseudonym, pad32(feature));
      console.log(`✅ permit requested. txId=${tx.public.txId} permitId=${permitId ? hex(permitId) : 'n/a'}`);
      break;
    }
    case 'consume-permit': {
      const feature = args[1];
      const idHex = args[2];
      if (!feature || !idHex) throw new Error('usage: consume-permit <feature> <permitIdHex>');
      const permitId = Uint8Array.from(Buffer.from(idHex, 'hex'));
      const tx = await found.callTx.consumePermit(pad32(feature), permitId);
      printPrivacyBanner();
      console.log(`✅ permit consumed. txId=${tx.public.txId}`);
      break;
    }
    default:
      throw new Error(`Unknown command: ${cmd}. Run \`npm run cli -- help\``);
  }

  await walletCtx.wallet.stop();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
