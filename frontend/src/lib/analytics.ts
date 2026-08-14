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
  /** Coarse lifecycle stage of a failed operation (never raw error text). */
  stage?: string | null;
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

// ─── Coalescing batch sender ──────────────────────────────────────────────────
//
// A single logical action reports several operation events (e.g. register
// credential → credential_registered + proof_generated + proof_verified +
// eligibility_verified). Instead of firing one fetch per event, events are
// queued and flushed together on the next macrotask as one POST to
// /api/events/batch. Analytics must never block the UI and never throw.

const BATCH_MAX = 50;
let pending: AnalyticsEvent[] = [];
let flushTimer: number | undefined;

async function sendBatch(events: AnalyticsEvent[]): Promise<void> {
  try {
    const res = await fetch(`${ANALYTICS_BASE_URL}/api/events/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true,
    });
    // Backwards compatibility: if the deployed server predates the batch
    // endpoint, fall back to one request per event.
    if (res.status === 404) {
      await Promise.allSettled(events.map((event) => sendSingle(event)));
    }
  } catch {
    // Analytics is best-effort by design.
  }
}

async function sendSingle(event: AnalyticsEvent): Promise<void> {
  try {
    await fetch(`${ANALYTICS_BASE_URL}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    });
  } catch {
    // best-effort
  }
}

async function flushPending(): Promise<void> {
  if (pending.length === 0) return;
  const events = pending.splice(0, BATCH_MAX);
  void sendBatch(events);
  if (pending.length > 0) void flushPending();
}

function scheduleFlush(): void {
  if (flushTimer !== undefined) return;
  // Coalesce bursts on the next macrotask, so events from one action ship as a
  // single request even when they are enqueued across several synchronous calls.
  flushTimer = window.setTimeout(() => {
    flushTimer = undefined;
    void flushPending();
  }, 0);
}

// Never lose queued events on navigation/close.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (pending.length === 0) return;
    const events = pending.splice(0, BATCH_MAX);
    void sendBatch(events);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (pending.length === 0) return;
      const events = pending.splice(0, BATCH_MAX);
      void sendBatch(events);
    }
  });
}

/** Best-effort report of one operation event. Never throws. */
export function trackEvent(event: AnalyticsEvent): void {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  pending.push({ ...event, network: event.network ?? NETWORK });
  if (pending.length >= BATCH_MAX) {
    void flushPending();
  } else {
    scheduleFlush();
  }
}

/** Report several operation events of one logical action as a single request. */
export function trackEvents(events: readonly AnalyticsEvent[]): void {
  for (const event of events) trackEvent(event);
}

// ─── Metrics snapshot (short client TTL) ─────────────────────────────────────

let metricsCache: { at: number; snapshot: MetricsSnapshot } | null = null;

/** Read the aggregate metrics snapshot. Throws when the API is unreachable. */
export async function fetchMetrics(): Promise<MetricsSnapshot> {
  const now = Date.now();
  if (metricsCache && now - metricsCache.at < 5_000) return metricsCache.snapshot;

  const res = await fetch(`${ANALYTICS_BASE_URL}/api/metrics`);
  if (!res.ok) throw new Error(`Metrics API responded ${res.status}.`);
  const snapshot = (await res.json()) as MetricsSnapshot;
  metricsCache = { at: now, snapshot };
  return snapshot;
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
