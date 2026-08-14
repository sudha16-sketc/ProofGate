// PermitGate — the core ProofGate user flow (v3).
//
// Every action here is a zero-knowledge proof that the wallet builds in-app
// against the configured, already-deployed ProofGate contract:
//   - "Activate demo policy"      → owner action; publishes the compliance
//                                   policy (min age, KYC level, jurisdictions).
//   - "Register demo issuer"      → owner action; publishes a trusted issuer key.
//   - "Register credential"       → proves ownership of a valid issuer-signed
//                                   credential satisfying the active policy,
//                                   WITHOUT revealing age, jurisdiction, or the
//                                   signature.
//   - "Request permit"            → proves ownership of an ACTIVE credential.
//   - "Consume permit"            → proves ownership of a VALID, unexpired permit.
//
// PRIVACY: the user's private inputs (secret, age, jurisdiction, signature)
// are never rendered, logged, or persisted — they live in the in-memory
// private state and are consumed by the ZK witnesses during circuit execution.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useMidnight, getConnectedApi } from '../hooks/useMidnight';
import { CONTRACT_ADDRESS } from '../lib/env';
import { friendlyError } from '../lib/errors';
import {
  DEFAULT_CREDENTIAL_VERSION,
  DEFAULT_KYC_LEVEL,
  DEFAULT_MIN_AGE,
  DEFAULT_POLICY_ID,
  DEFAULT_POLICY_VERSION,
  FEATURES,
  JURISDICTIONS,
  createDemoPrivateState,
  demoIssuerSk,
  hex,
  jurisdictionCommitment,
  jurisdictionSlots,
  le32,
  pad32,
  publicKey,
  sleep,
  type ProofGatePrivateState,
} from '../lib/proofgate';
import { buildProofGateProviders, type ProofGateProviders } from '../lib/providers';
import {
  connectToDeployedProofGate,
  type ProofGateContractHandle,
} from '../lib/contract';
import * as ProofGateContractModule from '../../../managed/proofgate/contract/index.js';

export type LedgerView = {
  contractDomain: string;
  owner: string;
  deployerId: string;
  minimumAge: bigint;
  requiredKycLevel: bigint;
  activePolicyId: string;
  activePolicyVersion: bigint;
  jurisdictionCommitment: string;
  issuers: { id: string; status: number; pkX: string; pkY: string }[];
  subjects: {
    pk: string;
    status: number;
    credId: string;
    issuerId: string;
    kycLevel: bigint;
    policyVersion: bigint;
    expiresAt: bigint;
    registeredAt: bigint;
  }[];
  permits: {
    id: string;
    holder: string;
    feature: string;
    policyId: string;
    policyVersion: bigint;
    credId: string;
    issuedAt: bigint;
    expiresAt: bigint;
    status: number;
  }[];
};

function decodeFeature(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  const nul = text.indexOf('\0');
  return nul === -1 ? text : text.slice(0, nul);
}

function toBytes32(hexStr: string): Uint8Array {
  const out = new Uint8Array(32);
  const bytes = hexStr.match(/[0-9a-fA-F]{2}/g) ?? [];
  for (let i = 0; i < Math.min(bytes.length, 32); i++) out[i] = Number.parseInt(bytes[i] ?? '00', 16);
  return out;
}

async function fetchLedgerView(providers: ProofGateProviders, address: string): Promise<LedgerView> {
  const state = await providers.publicDataProvider.queryContractState(address as never);
  if (!state) throw new Error(`No contract state found at ${address}.`);
  const l = ProofGateContractModule.ledger(state.data);
  return {
    contractDomain: hex(l.contractDomain),
    owner: hex(l.owner),
    deployerId: hex(l.deployerId),
    minimumAge: l.minimumAge,
    requiredKycLevel: l.requiredKycLevel,
    activePolicyId: hex(l.activePolicyId),
    activePolicyVersion: l.activePolicyVersion,
    jurisdictionCommitment: hex(l.jurisdictionCommitment),
    issuers: [...l.issuers].map(([id, i]) => ({
      id: hex(id as Uint8Array),
      status: i.status,
      pkX: hex(i.pkX),
      pkY: hex(i.pkY),
    })),
    subjects: [...l.subjects].map(([pk, s]) => ({
      pk: hex(pk as Uint8Array),
      status: s.status,
      credId: hex(s.credId),
      issuerId: hex(s.issuerId),
      kycLevel: s.kycLevel,
      policyVersion: s.policyVersion,
      expiresAt: s.expiresAt,
      registeredAt: s.registeredAt,
    })),
    permits: [...l.permits].map(([id, p]) => ({
      id: hex(id as Uint8Array),
      holder: hex(p.holder),
      feature: decodeFeature(p.feature),
      policyId: hex(p.policyId),
      policyVersion: p.policyVersion,
      credId: hex(p.credId),
      issuedAt: p.issuedAt,
      expiresAt: p.expiresAt,
      status: p.status,
    })),
  };
}

async function findPermitId(
  providers: ProofGateProviders,
  address: string,
  pseudonym: Uint8Array,
  feature: Uint8Array,
): Promise<string | null> {
  const pseudonymHex = hex(pseudonym);
  const featureHex = hex(feature);
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const view = await fetchLedgerView(providers, address);
      let newest: { id: string; issuedAt: bigint } | null = null;
      for (const p of view.permits) {
        // The contract stores feature strings zero-padded to 32 bytes; re-encode
        // the decoded string so it matches what the ledger contains.
        if (p.holder === pseudonymHex && hex(pad32(p.feature)) === featureHex) {
          if (!newest || p.issuedAt > newest.issuedAt) newest = { id: p.id, issuedAt: p.issuedAt };
        }
      }
      if (newest) return newest.id;
    } catch {
      // indexer may lag — keep polling
    }
    await sleep(3000);
  }
  return null;
}

type Message = { kind: 'ok' | 'error'; text: string };

type Props = {
  onContractAddressChange: (address: string | null) => void;
};

export function PermitGate({ onContractAddressChange }: Props) {
  const { state } = useMidnight();
  const connected = state.status === 'connected';

  const providersRef = useRef<ProofGateProviders | null>(null);
  const handleRef = useRef<ProofGateContractHandle | null>(null);
  const privateStateRef = useRef<ProofGatePrivateState | null>(null);

  const [booted, setBooted] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [permitId, setPermitId] = useState<string | null>(null);
  const [feature, setFeature] = useState<string>(FEATURES.rwaPurchase);

  const refreshLedger = useCallback(async (addr: string) => {
    const providers = providersRef.current;
    if (!providers) return;
    try {
      setLedger(await fetchLedgerView(providers, addr));
    } catch (err) {
      setMessage({ kind: 'error', text: friendlyError(err) });
    }
  }, []);

  // Boot the session once the wallet is connected.
  useEffect(() => {
    if (!connected || booted) return;
    let cancelled = false;
    (async () => {
      setBusy('Initializing session…');
      try {
        const api = getConnectedApi();
        if (!api) throw new Error('Wallet not connected.');
        const providers = await buildProofGateProviders(api);
        providersRef.current = providers;
        privateStateRef.current = createDemoPrivateState();

        if (CONTRACT_ADDRESS) {
          const handle = await connectToDeployedProofGate(
            providers,
            CONTRACT_ADDRESS,
            privateStateRef.current,
          );
          handleRef.current = handle;
          if (!cancelled) {
            setAddress(CONTRACT_ADDRESS);
            onContractAddressChange(CONTRACT_ADDRESS);
          }
        }
        if (!cancelled) setBooted(true);
      } catch (err) {
        if (!cancelled) {
          setMessage({ kind: 'error', text: `Session init failed: ${friendlyError(err)}` });
          setBooted(true);
        }
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, booted, onContractAddressChange]);

  // Refresh the ledger when the address changes.
  useEffect(() => {
    if (address) void refreshLedger(address);
  }, [address, refreshLedger]);

  const run = useCallback(
    async (label: string, action: (providers: ProofGateProviders, handle: ProofGateContractHandle) => Promise<void>) => {
      const providers = providersRef.current;
      const handle = handleRef.current;
      const addr = address ?? CONTRACT_ADDRESS;
      if (!providers || !handle || !addr) {
        setMessage({ kind: 'error', text: 'Contract session is not ready.' });
        return;
      }
      setBusy(label);
      setMessage(null);
      try {
        await action(providers, handle);
        await refreshLedger(addr);
      } catch (err) {
        setMessage({ kind: 'error', text: `${label} failed: ${friendlyError(err)}` });
      } finally {
        setBusy(null);
      }
    },
    [address, refreshLedger],
  );

  const handleActivatePolicy = useCallback(() => {
    const juris = jurisdictionSlots(JURISDICTIONS);
    void run('Activating demo policy', async (_p, handle) => {
      const tx = await handle.callTx.setPolicy(
        pad32(DEFAULT_POLICY_ID),
        DEFAULT_POLICY_VERSION,
        DEFAULT_MIN_AGE,
        DEFAULT_KYC_LEVEL,
        DEFAULT_CREDENTIAL_VERSION,
        jurisdictionCommitment(juris),
        juris,
      );
      setMessage({
        kind: 'ok',
        text: `Policy activated: ${DEFAULT_POLICY_ID} (minAge ${DEFAULT_MIN_AGE}, KYC ${DEFAULT_KYC_LEVEL}, jurisdictions ${JURISDICTIONS.join(', ')}). txId ${tx.public.txId}`,
      });
    });
  }, [run]);

  const handleRegisterIssuer = useCallback(() => {
    const pub = publicKey(demoIssuerSk());
    void run('Registering demo issuer', async (_p, handle) => {
      const tx = await handle.callTx.registerIssuer(pub.pubX, pub.pubY, new Uint8Array(32));
      setMessage({ kind: 'ok', text: `Demo issuer registered (public: issuer id hash). txId ${tx.public.txId}` });
    });
  }, [run]);

  const handleRegisterCredential = useCallback(() => {
    const juris = jurisdictionSlots(JURISDICTIONS);
    void run('Registering credential', async (_p, handle) => {
      const tx = await handle.callTx.registerCredential(juris);
      setMessage({
        kind: 'ok',
        text: `Credential registered (ZK: issuer-signed, bound to subject, policy-compliant). txId ${tx.public.txId}`,
      });
    });
  }, [run]);

  const handleRequestPermit = useCallback(() => {
    const privateState = privateStateRef.current;
    void run('Requesting permit', async (p, handle) => {
      const addr = address ?? CONTRACT_ADDRESS;
      const view = await fetchLedgerView(p, addr);
      const pseudonym = ProofGateContractModule.pureCircuits.subjectKey(
        toBytes32(view.contractDomain),
        privateState!.subjectPubX,
        privateState!.subjectPubY,
      );
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const tx = await handle.callTx.requestPermit(pad32(feature), expiresAt, le32(expiresAt));
      const id = await findPermitId(p, addr, pseudonym, pad32(feature));
      setPermitId(id);
      setMessage({ kind: 'ok', text: `Permit requested for "${feature}" (1h). txId ${tx.public.txId}${id ? ` · permitId ${id}` : ' · awaiting indexer…'}` });
    });
  }, [run, feature, address]);

  const handleConsumePermit = useCallback(
    (permitIdHex: string) => {
      void run('Consuming permit', async (_p, handle) => {
        const tx = await handle.callTx.consumePermit(pad32(feature), toBytes32(permitIdHex));
        setMessage({ kind: 'ok', text: `Permit consumed (one-time access granted). txId ${tx.public.txId}` });
      });
    },
    [run, feature],
  );

  if (!connected) {
    return (
      <section className="card">
        <h2>Permit Gate</h2>
        <p>Connect a Midnight wallet above to register your credential and request one-time compliance permits.</p>
        <p className="privacy-note">🔐 Every action proves eligibility in zero-knowledge — your age, jurisdiction, and identity are never revealed.</p>
      </section>
    );
  }

  if (busy) {
    return (
      <section className="card">
        <h2>Permit Gate</h2>
        <p className="busy">⏳ {busy}</p>
        <p className="privacy-note">🔐 Building and verifying the zero-knowledge proof in your wallet…</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Permit Gate</h2>

      {!address && !CONTRACT_ADDRESS && (
        <div className="action-group">
          <p>
            No contract is configured (<code>VITE_CONTRACT_ADDRESS</code>). The app connects only to an existing
            deployed ProofGate contract — set <code>VITE_CONTRACT_ADDRESS</code> to the deployed address and reload.
          </p>
        </div>
      )}

      {address && (
        <>
          <p className="mono address">contract: {address}</p>

          {ledger && (
            <p>
              policy {ledger.activePolicyId === '0000000000000000000000000000000000000000000000000000000000000000' ? '—' : ledger.activePolicyId.slice(0, 16) + '…'} ·
              minAge <strong>{ledger.minimumAge.toString()}</strong> · KYC ≥ <strong>{ledger.requiredKycLevel.toString()}</strong> · issuers{' '}
              <strong>{ledger.issuers.length}</strong> · subjects <strong>{ledger.subjects.length}</strong> · permits{' '}
              <strong>{ledger.permits.length}</strong>
            </p>
          )}

          <div className="action-group">
            <h3>Owner (demo)</h3>
            <button onClick={handleActivatePolicy}>Activate demo policy</button>
            <button onClick={handleRegisterIssuer}>Register demo issuer</button>
          </div>

          <div className="action-group">
            <h3>User flow</h3>
            <button onClick={handleRegisterCredential}>Register credential</button>
          </div>

          <div className="action-group">
            <h3>Request a one-time permit</h3>
            <label>
              Feature
              <select value={feature} onChange={(e) => setFeature(e.target.value)}>
                {Object.values(FEATURES).map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>
            <button onClick={handleRequestPermit}>Request permit</button>
          </div>

          <div className="action-group">
            <h3>Consume a permit</h3>
            {permitId && (
              <button onClick={() => handleConsumePermit(permitId)}>
                Consume last permit ({permitId.slice(0, 12)}…)
              </button>
            )}
            {ledger && ledger.permits.filter((p) => p.status === 0).length > 0 && (
              <ul className="permit-list">
                {ledger.permits
                  .filter((p) => p.status === 0)
                  .map((p) => (
                    <li key={p.id}>
                      <span className="mono">{p.feature}</span>{' '}
                      <span className="mono dim">{p.id.slice(0, 12)}…</span>
                      <button onClick={() => handleConsumePermit(p.id)}>Consume</button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </>
      )}

      {message && <p className={message.kind === 'ok' ? 'ok' : 'error'}>{message.text}</p>}
      <p className="privacy-note">🔐 Proved without revealing your input (zero-knowledge).</p>
    </section>
  );
}
