// Frontend analytics client.
//
// Reports anonymous operation events to the ProofGate analytics server and
// reads the aggregate metrics snapshot for the landing page.
//
// PRIVACY: only the public unshielded wallet address and operation *type* are
// reported — never the private inputs used to perform an operation (no proofs,
// credentials, ages, jurisdictions, or signature material). Event reporting is
// strictly best-effort: failures are swallowed so analytics never degrades the
// user experience or leaks through console output.

import { NETWORK } from './env';

export const OPERATION_TYPES = [
  'wallet_connected',
  'credential_registered',
  'proof_generated',
  'proof_verified',
  'eligibility_verified',
  'permit_created',
  'protected_action',
  'permit_consumed',
  'operation_failed',
] as const;

export type OperationType = (typeof OPERATION_TYPES)[number];

export type AnalyticsEvent = {
  /** Shared by every event of one logical user action (retry-safe). */
  idempotencyKey: string;
  operationType: OperationType;
  status?: 'success' | 'failed';
  /** Public unshielded wallet address; null for pre-wallet failures. */
  walletAddress?: string | null;
  txHash?: string | null;
  durationMs?: number | null;
  /** Safe error code from classifyError (never raw error text). */
  errorCode?: string | null;
  network?: string;
};

export type MetricsSnapshot = {
  users: { total: number; active: number; completedFlow: number };
  operations: { total: number; successful: number; failed: number };
  proofs: { generated: number; verified: number };
  permits: { created: number; consumed: number };
  protectedActions: number;
  successRate: number;
  preprodUsers: number;
  preprodTarget: number;
  network: string;
};

/**
 * Base URL of the analytics API. Empty means same-origin (the Vite dev proxy
 * forwards /api to the server, and production Express serves both). Override
 * with VITE_API_URL when the API lives on another origin.
 */
export const ANALYTICS_BASE_URL = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '');

/** Fresh idempotency key for a new logical action. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Best-effort report of one operation event. Never throws. */
export function trackEvent(event: AnalyticsEvent): void {
  if (typeof fetch === 'undefined') return;
  const body = JSON.stringify({ ...event, network: event.network ?? NETWORK });
  fetch(`${ANALYTICS_BASE_URL}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Analytics is best-effort by design.
  });
}

/** Read the aggregate metrics snapshot. Throws when the API is unreachable. */
export async function fetchMetrics(): Promise<MetricsSnapshot> {
  const res = await fetch(`${ANALYTICS_BASE_URL}/api/metrics`);
  if (!res.ok) throw new Error(`Metrics API responded ${res.status}.`);
  return (await res.json()) as MetricsSnapshot;
}

/** Same username rules as the server (kept in sync with server/services/analytics.ts). */
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_PATTERN = /^[A-Za-z0-9._ -]+$/;

/**
 * Map a wallet-chosen username to its public wallet address on the analytics
 * server. Resolves with the accepted (trimmed) username; throws on rejection.
 */
export async function registerUsername(
  walletAddress: string,
  username: string,
  network: string,
): Promise<string> {
  const res = await fetch(`${ANALYTICS_BASE_URL}/api/users/username`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ walletAddress, username, network }),
  });
  const body = (await res.json().catch(() => null)) as { error?: string; username?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? `Username API responded ${res.status}.`);
  return body?.username ?? username.trim();
}
