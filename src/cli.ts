/**
 * ProofGate CLI — drive the deployed ProofGate contract.
 *
 * Usage:
 *   npm run cli -- info                                  # read-only contract summary via indexer
 *   npm run cli -- set-policy <policyIdHex> [minAge]     # admin: activate a compliance policy
 *   npm run cli -- register-issuer <pkXHex> <pkYHex>     # admin: register a trusted KYC issuer
 *   npm run cli -- register-credential                   # user: register an issuer-signed credential (ZK)
 *   npm run cli -- request-permit <feature> [expiry]     # user: request a one-time permit
 *   npm run cli -- consume-permit <feature> <permitIdHex># user: spend the permit once
 *   npm run cli -- demo                                  # full happy-path walkthrough
 *
 * Append `-- --network preview` to target a public network.
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

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type { Contract as ProofGateContract } from '../managed/proofgate/contract/index.js';

import { resolveNetwork, getOrCreateWallet, getDeployment } from './network';
import { configureNetworkId, createWallet, type WalletContext } from './wallet';
import {
  DEFAULT_CREDENTIAL_VERSION,
  DEFAULT_KYC_LEVEL,
  DEFAULT_MIN_AGE,
  FEATURES,
  JURISDICTIONS,
  createWitnesses,
  demoIssuerSk,
  demoPrivateState,
  jurisdictionCommitment,
  jurisdictionSlots,
  le32,
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
  const l = await readCurrentLedger(networkConfig, contractAddress);
  console.log(`\nProofGate on ${network}: ${contractAddress}`);
  console.log(`  contractDomain         : ${hex(l.contractDomain)}`);
  console.log(`  adminPk                : ${hex(l.adminPk)}`);
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
  set-policy <policyIdHex>      admin: activate a compliance policy (defaults: minAge 18, KYC 2)
  register-issuer <xHex> <yHex> admin: register a trusted KYC issuer (Jubjub pubkey coords)
  register-credential           user: register an issuer-signed credential proving policy compliance (ZK)
  request-permit <feature> [t]  user: request a one-time permit (t = unix expiry, default now+1h)
  consume-permit <f> <idHex>    user: consume a permit exactly once
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

  const seed = getOrCreateWallet(network).seed;
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
