// ProofGate session store — module-level contract session shared by every view.
//
// This is a thin, non-visual layer over the existing Midnight wiring:
//   - builds providers from the wallet's own configuration,
//   - seeds the in-memory demo private state,
//   - connects to the configured (pre-deployed) contract address,
//   - polls the public ledger (10 s) and derives public session metadata,
//   - records this session's transaction activity.
//
// PRIVACY: the session's private inputs (subject secret, age, jurisdiction,
// signature) live only in the in-memory provider and are consumed by the ZK
// witnesses during circuit execution. Nothing private is rendered, logged, or
// stored here — the activity feed stores only txIds, circuits and statuses.

import { useSyncExternalStore } from 'react';

import { getConnectedApi, getConnectionState } from '../hooks/useMidnight';
import { CONTRACT_ADDRESS } from '../lib/env';
import { classifyError, friendlyError } from '../lib/errors';
import {
  DEFAULT_CREDENTIAL_VERSION,
  DEFAULT_KYC_LEVEL,
  DEFAULT_MIN_AGE,
  DEFAULT_POLICY_ID,
  DEFAULT_POLICY_VERSION,
  JURISDICTIONS,
  createDemoPrivateState,
  demoIssuerSk,
  hex,
  jurisdictionCommitment,
  jurisdictionSlots,
  le32,
  ownerKey,
  pad32,
  publicKey,
  type ProofGatePrivateState,
} from '../lib/proofgate';
import { buildProofGateProviders, type ProofGateProviders } from '../lib/providers';
import {
  connectToDeployedProofGate,
  PRIVATE_STATE_ID,
  type ProofGateContractHandle,
} from '../lib/contract';
import {
  deriveMeta,
  fetchLedgerView,
  findPermitId,
  toBytes32,
  type LedgerView,
  type SessionMeta,
} from '../lib/ledger';

export type SessionStatus = 'idle' | 'booting' | 'ready' | 'no-contract' | 'error';

export type SessionMessage = {
  kind: 'ok' | 'error';
  text: string;
  /** Raw detail (safe to render — never contains private witnesses). */
  detail?: string;
};

export type ActivityStatus = 'pending' | 'confirmed' | 'failed';

export type ActivityItem = {
  id: number;
  at: number;
  circuit: string;
  action: string;
  status: ActivityStatus;
  txId?: string;
  permitId?: string;
  feature?: string;
  detail?: string;
};

export type TxResult = {
  txId?: string;
  permitId?: string;
  extra?: string;
};

// ─── Module state ────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();

let _status: SessionStatus = 'idle';
let _address: string | null = null;
let _ledger: LedgerView | null = null;
let _busy: string | null = null;
let _message: SessionMessage | null = null;
let _activity: ActivityItem[] = [];
let _error: string | null = null;
let _meta: SessionMeta | null = null;
let _metaSource = -1; // cache key: ledger poll counter

let providersRef: ProofGateProviders | null = null;
let handleRef: ProofGateContractHandle | null = null;
let privateStateRef: ProofGatePrivateState | null = null;
let pollTimer: number | null = null;
let ledgerVersion = 0;
let activitySeq = 0;

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function computeMeta(): SessionMeta | null {
  if (!_ledger || !privateStateRef) return null;
  if (_metaSource !== ledgerVersion) {
    const conn = getConnectionState();
    _meta = deriveMeta(_ledger, privateStateRef, conn.status === 'connected' ? conn.address : null);
    _metaSource = ledgerVersion;
  }
  return _meta;
}

// ─── Granular snapshots (cached so only the changed pieces re-render) ────────

function getStatus(): SessionStatus {
  return _status;
}

function getAddress(): string | null {
  return _address;
}

function getLedger(): LedgerView | null {
  return _ledger;
}

function getBusy(): string | null {
  return _busy;
}

function getMessage(): SessionMessage | null {
  return _message;
}

function getActivity(): ActivityItem[] {
  return _activity;
}

function getError(): string | null {
  return _error;
}

function getMeta(): SessionMeta | null {
  return computeMeta();
}

export function useSessionStatus(): SessionStatus {
  return useSyncExternalStore(subscribe, getStatus);
}

export function useSessionAddress(): string | null {
  return useSyncExternalStore(subscribe, getAddress);
}

export function useSessionLedger(): LedgerView | null {
  return useSyncExternalStore(subscribe, getLedger);
}

export function useSessionBusy(): string | null {
  return useSyncExternalStore(subscribe, getBusy);
}

export function useSessionMessage(): SessionMessage | null {
  return useSyncExternalStore(subscribe, getMessage);
}

export function useSessionActivity(): ActivityItem[] {
  return useSyncExternalStore(subscribe, getActivity);
}

export function useSessionError(): string | null {
  return useSyncExternalStore(subscribe, getError);
}

export function useSessionMeta(): SessionMeta | null {
  return useSyncExternalStore(subscribe, getMeta);
}

export function useSession(): {
  status: SessionStatus;
  address: string | null;
  ledger: LedgerView | null;
  meta: SessionMeta | null;
  busy: string | null;
  message: SessionMessage | null;
  activity: ActivityItem[];
  error: string | null;
} {
  const status = useSessionStatus();
  const address = useSessionAddress();
  const ledger = useSessionLedger();
  const meta = useSessionMeta();
  const busy = useSessionBusy();
  const message = useSessionMessage();
  const activity = useSessionActivity();
  const error = useSessionError();
  return { status, address, ledger, meta, busy, message, activity, error };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function setMessage(message: SessionMessage | null): void {
  _message = message;
  emit();
}

export function clearMessage(): void {
  if (_message) {
    _message = null;
    emit();
  }
}

/** Show a transient banner/toast message (ok or error). */
export function notify(kind: 'ok' | 'error', text: string, detail?: string): void {
  setMessage({ kind, text, detail });
}

function setBusy(label: string | null): void {
  if (_busy === label) return;
  _busy = label;
  emit();
}

function logActivity(item: Omit<ActivityItem, 'id' | 'at'>): ActivityItem {
  const entry: ActivityItem = { id: ++activitySeq, at: Date.now(), ...item };
  _activity = [entry, ..._activity].slice(0, 100);
  emit();
  return entry;
}

function patchActivity(id: number, patch: Partial<ActivityItem>): void {
  _activity = _activity.map((a) => (a.id === id ? { ...a, ...patch } : a));
  emit();
}

export async function refreshLedger(): Promise<boolean> {
  const providers = providersRef;
  const addr = _address;
  if (!providers || !addr) return false;
  try {
    const view = await fetchLedgerView(providers, addr);
    ledgerVersion += 1;
    _ledger = view;
    emit();
    return true;
  } catch (err) {
    setMessage({ kind: 'error', text: `Public ledger refresh failed: ${friendlyError(err)}` });
    return false;
  }
}

async function refreshLedgerQuiet(): Promise<void> {
  const providers = providersRef;
  const addr = _address;
  if (!providers || !addr) return;
  try {
    const view = await fetchLedgerView(providers, addr);
    ledgerVersion += 1;
    _ledger = view;
    emit();
  } catch {
    // silent — polling failures surface in the ledger page state instead
  }
}

function startPolling(): void {
  if (pollTimer !== null) return;
  pollTimer = window.setInterval(() => void refreshLedgerQuiet(), 10_000);
}

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * Boot the session once the wallet is connected. Idempotent. Preserves the
 * existing boot semantics: providers are built from the wallet, a demo private
 * state is created in memory, and the configured contract (or a demo deploy)
 * is connected.
 */
export async function bootSession(): Promise<void> {
  if (_status === 'booting' || _status === 'ready') return;
  if (getConnectionState().status !== 'connected') return;

  _status = 'booting';
  _error = null;
  emit();

  try {
    const api = getConnectedApi();
    if (!api) throw new Error('Wallet not connected.');
    const providers = await buildProofGateProviders(api);
    providersRef = providers;
    privateStateRef = createDemoPrivateState();

    if (CONTRACT_ADDRESS) {
      const handle = await connectToDeployedProofGate(providers, CONTRACT_ADDRESS, privateStateRef);
      handleRef = handle;
      _address = CONTRACT_ADDRESS;
      await refreshLedger();
      _status = 'ready';
      startPolling();
    } else {
      _status = 'no-contract';
    }
  } catch (err) {
    _error = friendlyError(err);
    _status = 'error';
  } finally {
    setBusy(null);
    emit();
  }
}

/** Reset the session (used on wallet disconnect). */
export function resetSession(): void {
  stopPolling();
  providersRef = null;
  handleRef = null;
  privateStateRef = null;
  _status = 'idle';
  _address = null;
  _ledger = null;
  _busy = null;
  _message = null;
  _activity = [];
  _error = null;
  _meta = null;
  _metaSource = -1;
  emit();
}

/** Accessors for imperative action handlers. */
export function getSessionHandle(): ProofGateContractHandle | null {
  return handleRef;
}

export function getSessionProviders(): ProofGateProviders | null {
  return providersRef;
}

export function getSessionPrivateState(): ProofGatePrivateState | null {
  return privateStateRef;
}

/** Replace the session's in-memory private state (used by ownership transfer). */
export function setSessionPrivateState(next: ProofGatePrivateState): void {
  privateStateRef = next;
  void providersRef?.privateStateProvider.set(PRIVATE_STATE_ID, next);
  computeMeta();
  emit();
}

export function getDemoIssuerPublicKey(): { pubX: Uint8Array; pubY: Uint8Array } {
  return publicKey(demoIssuerSk());
}

// ─── Contract action wrapper ─────────────────────────────────────────────────

type RunOptions = {
  circuit: string;
  label: string;
  feature?: string;
  /** Require this session to be the deployed contract's owner before attempting. */
  owner?: boolean;
};

/** True when this session holds the deployed contract's owner secret. */
function sessionIsOwner(): boolean {
  return computeMeta()?.isOwner === true;
}

/** Clear explanation for a wallet that is not the deployed contract's owner. */
function ownerUnavailableMessage(addr: string): string {
  return `This wallet is not the owner of ${addr}. Owner actions are restricted to the wallet that holds the deployment's owner secret — no transaction was submitted.`;
}

/**
 * Run a contract call through the session: records activity, sets busy state,
 * maps errors through `classifyError`, refreshes the ledger, and returns a
 * `TxResult` (or null on failure). No private witness data is ever stored.
 *
 * When `opts.owner` is set and the session is known not to be the deployed
 * contract's owner, the call is rejected up front (logged as failed) and the
 * transaction is never attempted.
 */
export async function runContractCall(
  opts: RunOptions,
  fn: (providers: ProofGateProviders, handle: ProofGateContractHandle) => Promise<TxResult>,
): Promise<TxResult | null> {
  const providers = providersRef;
  const handle = handleRef;
  const addr = _address;
  if (!providers || !handle || !addr) {
    setMessage({ kind: 'error', text: 'Contract session is not ready. Connect your wallet first.' });
    return null;
  }

  if (opts.owner && !sessionIsOwner()) {
    const detail = ownerUnavailableMessage(addr);
    logActivity({ circuit: opts.circuit, action: opts.label, status: 'failed', detail });
    setMessage({ kind: 'error', text: `${opts.label}: unavailable — ${detail}`, detail });
    return null;
  }

  const entry = logActivity({ circuit: opts.circuit, action: opts.label, status: 'pending', feature: opts.feature });
  setBusy(opts.label);
  clearMessage();

  try {
    const result = await fn(providers, handle);
    patchActivity(entry.id, { status: 'confirmed', txId: result.txId, permitId: result.permitId });
    await refreshLedger();
    return result;
  } catch (err) {
    const { detail } = classifyError(err);
    patchActivity(entry.id, { status: 'failed', detail: detail || undefined });
    setMessage({ kind: 'error', text: `${opts.label}: ${friendlyError(err)}`, detail: detail || undefined });
    return null;
  } finally {
    setBusy(null);
    emit();
  }
}

// ─── Prebuilt actions (kept in sync with the original PermitGate semantics) ──

export async function activateDemoPolicy(): Promise<TxResult | null> {
  const juris = jurisdictionSlots(JURISDICTIONS);
  return runContractCall({ circuit: 'setPolicy', label: 'Activate demo policy', owner: true }, async (_p, handle) => {
    const tx = await handle.callTx.setPolicy(
      pad32(DEFAULT_POLICY_ID),
      DEFAULT_POLICY_VERSION,
      DEFAULT_MIN_AGE,
      DEFAULT_KYC_LEVEL,
      DEFAULT_CREDENTIAL_VERSION,
      jurisdictionCommitment(juris),
      juris,
    );
    return {
      txId: tx.public.txId,
      extra: `${DEFAULT_POLICY_ID} · minAge ${DEFAULT_MIN_AGE.toString()} · KYC ${DEFAULT_KYC_LEVEL.toString()} · ${JURISDICTIONS.join(', ')}`,
    };
  });
}

export async function registerDemoIssuer(): Promise<TxResult | null> {
  const pub = publicKey(demoIssuerSk());
  return runContractCall({ circuit: 'registerIssuer', label: 'Register demo issuer', owner: true }, async (_p, handle) => {
    const tx = await handle.callTx.registerIssuer(pub.pubX, pub.pubY, new Uint8Array(32));
    return { txId: tx.public.txId };
  });
}

export async function runDemoSetup(): Promise<boolean> {
  const policy = await activateDemoPolicy();
  if (!policy) return false;
  const issuer = await registerDemoIssuer();
  return issuer !== null;
}

export async function registerCredential(): Promise<TxResult | null> {
  const juris = jurisdictionSlots(JURISDICTIONS);
  return runContractCall({ circuit: 'registerCredential', label: 'Register credential' }, async (_p, handle) => {
    const tx = await handle.callTx.registerCredential(juris);
    return { txId: tx.public.txId };
  });
}

export async function requestPermit(feature: string): Promise<TxResult | null> {
  const privateState = privateStateRef;
  return runContractCall({ circuit: 'requestPermit', label: 'Request permit', feature }, async (p, handle) => {
    const addr = _address;
    if (!addr || !privateState) throw new Error('Session is not ready.');
    const view = await fetchLedgerView(p, addr);
    const pseudonym = deriveMeta(view, privateState)?.myPseudonym ?? null;
    if (!pseudonym) throw new Error('Credential not registered — register it first.');
    const expiresAt = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
    const tx = await handle.callTx.requestPermit(pad32(feature), expiresAt, le32(expiresAt));
    const id = await findPermitId(p, addr, toBytes32(pseudonym), pad32(feature));
    return { txId: tx.public.txId, permitId: id ?? undefined, extra: id ? undefined : 'awaiting indexer…' };
  });
}

export async function consumePermit(feature: string, permitIdHex: string): Promise<TxResult | null> {
  return runContractCall(
    { circuit: 'consumePermit', label: 'Consume permit', feature },
    async (_p, handle) => {
      const tx = await handle.callTx.consumePermit(pad32(feature), toBytes32(permitIdHex));
      return { txId: tx.public.txId };
    },
  );
}

export async function setPolicyAction(params: {
  policyId: string;
  version: bigint;
  minAge: bigint;
  kycLevel: bigint;
  credVersion: bigint;
  jurisdictions: string[];
}): Promise<TxResult | null> {
  const juris = jurisdictionSlots(params.jurisdictions);
  return runContractCall({ circuit: 'setPolicy', label: 'Update policy', owner: true }, async (_p, handle) => {
    const tx = await handle.callTx.setPolicy(
      pad32(params.policyId),
      params.version,
      params.minAge,
      params.kycLevel,
      params.credVersion,
      jurisdictionCommitment(juris),
      juris,
    );
    return { txId: tx.public.txId };
  });
}

export async function registerIssuerAction(metadataHash?: Uint8Array): Promise<TxResult | null> {
  const pub = publicKey(demoIssuerSk());
  return runContractCall({ circuit: 'registerIssuer', label: 'Register demo issuer', owner: true }, async (_p, handle) => {
    const tx = await handle.callTx.registerIssuer(pub.pubX, pub.pubY, metadataHash ?? new Uint8Array(32));
    return { txId: tx.public.txId };
  });
}

export async function setIssuerStatusAction(pkXHex: string, pkYHex: string, status: number): Promise<TxResult | null> {
  return runContractCall(
    { circuit: 'setIssuerStatus', label: `Set issuer status (${status})`, owner: true },
    async (_p, handle) => {
      const tx = await handle.callTx.setIssuerStatus(toBytes32(pkXHex), toBytes32(pkYHex), status as never);
      return { txId: tx.public.txId };
    },
  );
}

export async function revokeCredentialAction(credIdHex: string): Promise<TxResult | null> {
  return runContractCall({ circuit: 'revokeCredential', label: 'Revoke credential', owner: true }, async (_p, handle) => {
    const tx = await handle.callTx.revokeCredential(toBytes32(credIdHex));
    return { txId: tx.public.txId };
  });
}

export async function unrevokeCredentialAction(credIdHex: string): Promise<TxResult | null> {
  return runContractCall({ circuit: 'unrevokeCredential', label: 'Un-revoke credential', owner: true }, async (_p, handle) => {
    const tx = await handle.callTx.unrevokeCredential(toBytes32(credIdHex));
    return { txId: tx.public.txId };
  });
}

export async function setSubjectStatusAction(subjectPkHex: string, status: number): Promise<TxResult | null> {
  return runContractCall(
    { circuit: 'setSubjectStatus', label: `Set subject status (${status})`, owner: true },
    async (_p, handle) => {
      const tx = await handle.callTx.setSubjectStatus(toBytes32(subjectPkHex), status as never);
      return { txId: tx.public.txId };
    },
  );
}

export async function revokePermitAction(permitIdHex: string): Promise<TxResult | null> {
  return runContractCall({ circuit: 'revokePermit', label: 'Revoke permit', owner: true }, async (_p, handle) => {
    const tx = await handle.callTx.revokePermit(toBytes32(permitIdHex));
    return { txId: tx.public.txId };
  });
}

export async function transferOwnershipAction(): Promise<TxResult | null> {
  const current = privateStateRef;
  if (!current) return null;
  const newSecret = new Uint8Array(32);
  crypto.getRandomValues(newSecret);
  const newCommitment = ownerKey(newSecret);
  const result = await runContractCall({ circuit: 'transferOwnership', label: 'Transfer ownership', owner: true }, async (_p, handle) => {
    const tx = await handle.callTx.transferOwnership(newCommitment);
    return { txId: tx.public.txId };
  });
  if (result) {
    setSessionPrivateState({ ...current, ownerSecret: newSecret });
  }
  return result;
}

export { hex };
