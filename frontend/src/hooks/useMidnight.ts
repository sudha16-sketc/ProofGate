// Midnight wallet connection management.
//
// Discovers DApp Connector API v4 wallets injected at `window.midnight`,
// connects to the configured network, and validates the wallet's connected
// network. State is kept in a module-level store so every component (header,
// permit gate, ledger view) shares the same connection.

import { useSyncExternalStore } from 'react';

import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { NETWORK } from '../lib/env';

export type ConnectionState =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'connected'; walletName: string; address: string; networkId: string }
  | { status: 'error'; error: string };

/** The dApp supports DApp Connector API major version 4. */
const COMPATIBLE_API_MAJOR = 4;

function apiMajor(apiVersion: string): number {
  return Number.parseInt(apiVersion.split('.')[0] ?? '', 10);
}

function isCompatibleWallet(wallet: unknown): wallet is InitialAPI {
  return (
    typeof wallet === 'object' &&
    wallet !== null &&
    'connect' in wallet &&
    typeof (wallet as InitialAPI).connect === 'function' &&
    'apiVersion' in wallet &&
    typeof (wallet as InitialAPI).apiVersion === 'string' &&
    apiMajor((wallet as InitialAPI).apiVersion) === COMPATIBLE_API_MAJOR
  );
}

/** All wallet instances injected by Midnight wallets (Lace et al.). */
function discoverWallets(): InitialAPI[] {
  if (typeof window === 'undefined' || window.midnight === undefined) return [];
  return Object.values(window.midnight).filter(isCompatibleWallet);
}

// ─── Module-level store ───────────────────────────────────────────────────────

let connection: ConnectionState = { status: 'idle' };
let connectedApi: ConnectedAPI | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ConnectionState {
  return connection;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function connectWallet(): Promise<void> {
  if (connection.status === 'connecting' || connection.status === 'connected') return;
  connection = { status: 'connecting' };
  emit();

  try {
    const wallets = discoverWallets();
    if (wallets.length === 0) {
      connection = {
        status: 'error',
        error:
          'No Midnight wallet detected. Install the Midnight Lace extension, unlock it, and reload this page.',
      };
      emit();
      return;
    }

    const initialApi = wallets[0];
    const api = await initialApi.connect(NETWORK);

    const config = await api.getConfiguration();

    setNetworkId(config.networkId);

    if (config.networkId !== NETWORK) {
      connection = {
        status: 'error',
        error: `Network mismatch: your wallet is on "${config.networkId}" but this dApp requires "${NETWORK}". Switch the wallet's network and try again.`,
      };
      emit();
      return;
    }

    const { unshieldedAddress } = await api.getUnshieldedAddress();
    connectedApi = api;
    connection = {
      status: 'connected',
      walletName: initialApi.name,
      address: unshieldedAddress,
      networkId: config.networkId,
    };
    emit();
  } catch (err) {
    connectedApi = null;
    connection = {
      status: 'error',
      error: `Could not connect to the wallet: ${err instanceof Error ? err.message : String(err)}`,
    };
    emit();
  }
}

export function disconnectWallet(): void {
  connectedApi = null;
  connection = { status: 'idle' };
  emit();
}

export function clearConnectionError(): void {
  if (connection.status === 'error') {
    connection = { status: 'idle' };
    emit();
  }
}

/** The connected DApp Connector API, or null when not connected. */
export function getConnectedApi(): ConnectedAPI | null {
  return connectedApi;
}

/** Non-hook accessor for the module-level connection state. */
export function getConnectionState(): ConnectionState {
  return connection;
}

export function getWalletNetwork(): string {
  return NETWORK;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMidnight(): {
  state: ConnectionState;
  network: string;
  connect: () => void;
  disconnect: () => void;
  clearError: () => void;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot);
  return {
    state,
    network: NETWORK,
    connect: connectWallet,
    disconnect: disconnectWallet,
    clearError: clearConnectionError,
  };
}
