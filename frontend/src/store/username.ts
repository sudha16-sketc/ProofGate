// Username store — the display name a wallet chose for itself, persisted
// locally and keyed by wallet address.
//
// This is the "set once per wallet" source of truth the connect flow reads to
// decide whether to show the required username popup. The canonical mapping
// lives on the analytics server (/api/users/username); localStorage is only a
// cache so returning users skip the form.

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'proofgate.usernames';

type UsernameMap = Record<string, string>;

const listeners = new Set<() => void>();
let cache: UsernameMap | null = null;

function load(): UsernameMap {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as UsernameMap) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(load()));
  } catch {
    // Best-effort: the mapping still lives on the server.
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): UsernameMap {
  return load();
}

/** The stored username for a wallet address, or null when not set yet. */
export function getStoredUsername(address: string): string | null {
  return load()[address] ?? null;
}

/** Cache a wallet→username mapping locally. */
export function setStoredUsername(address: string, username: string): void {
  cache = { ...load(), [address]: username };
  persist();
  emit();
}

export function useUsername(address: string): string | null {
  return useSyncExternalStore(subscribe, getSnapshot)[address] ?? null;
}
