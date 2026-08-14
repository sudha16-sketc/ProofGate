// Analytics service — the single place that turns client-reported events into
// stored facts and aggregates them into the public metrics snapshot.
//
// PRIVACY MODEL: only the public wallet address and aggregate counters are kept.
// The store answers "how many users did X" — never "which identity did X".

import type { Db } from 'mongodb';

import type { AnalyticsConfig } from '../config';
import { insertOperation, insertOperations, type RecordOutcome } from '../models/Operation';
import { applyUserActivity, setWalletUsername } from '../models/User';
import {
  OPERATION_STATUSES,
  OPERATION_TYPES,
  type AnalyticsEvent,
  type MetricsSnapshot,
  type WalletRow,
} from '../models/types';

const OPERATIONS = 'operations';
const USERS = 'users';

export type EventValidation = { ok: true; event: AnalyticsEvent } | { ok: false; reason: string };

/** Reject events that are structurally invalid or carry unknown types. */
export function validateEvent(input: unknown): EventValidation {
  if (typeof input !== 'object' || input === null) return { ok: false, reason: 'Event must be an object.' };
  const e = input as Record<string, unknown>;

  if (typeof e.idempotencyKey !== 'string' || e.idempotencyKey.length === 0) {
    return { ok: false, reason: 'idempotencyKey is required.' };
  }
  if (typeof e.operationType !== 'string' || !OPERATION_TYPES.includes(e.operationType as never)) {
    return { ok: false, reason: `operationType must be one of: ${OPERATION_TYPES.join(', ')}.` };
  }
  if (e.status !== undefined && e.status !== 'success' && e.status !== 'failed') {
    return { ok: false, reason: `status must be one of: ${OPERATION_STATUSES.join(', ')}.` };
  }
  if (e.walletAddress !== undefined && e.walletAddress !== null && typeof e.walletAddress !== 'string') {
    return { ok: false, reason: 'walletAddress must be a string or null.' };
  }
  if (e.txHash !== undefined && e.txHash !== null && typeof e.txHash !== 'string') {
    return { ok: false, reason: 'txHash must be a string or null.' };
  }
  if (e.durationMs !== undefined && e.durationMs !== null && typeof e.durationMs !== 'number') {
    return { ok: false, reason: 'durationMs must be a number or null.' };
  }
  if (e.errorCode !== undefined && e.errorCode !== null && typeof e.errorCode !== 'string') {
    return { ok: false, reason: 'errorCode must be a string or null.' };
  }
  if (e.stage !== undefined && e.stage !== null && typeof e.stage !== 'string') {
    return { ok: false, reason: 'stage must be a string or null.' };
  }
  if (e.network !== undefined && typeof e.network !== 'string') {
    return { ok: false, reason: 'network must be a string.' };
  }

  // Strip any unknown fields so nothing unexpected ever reaches the store.
  const event: AnalyticsEvent = {
    idempotencyKey: e.idempotencyKey as string,
    operationType: e.operationType as AnalyticsEvent['operationType'],
    status: e.status === 'failed' ? 'failed' : 'success',
    walletAddress: typeof e.walletAddress === 'string' ? e.walletAddress : null,
    txHash: typeof e.txHash === 'string' ? e.txHash : null,
    durationMs: typeof e.durationMs === 'number' ? e.durationMs : null,
    errorCode: typeof e.errorCode === 'string' ? e.errorCode : null,
    stage: typeof e.stage === 'string' ? e.stage : null,
    network: typeof e.network === 'string' ? e.network : 'unknown',
  };
  return { ok: true, event };
}

/**
 * Record one analytics event. Exactly-once semantics: an event whose
 * {idempotencyKey, operationType} was already recorded is ignored (returned as
 * 'duplicate') and never touches the user counters.
 */
export async function recordEvent(
  db: Db,
  event: AnalyticsEvent,
  config: AnalyticsConfig,
): Promise<RecordOutcome> {
  const outcome = await insertOperation(db, event);
  if (outcome === 'inserted') {
    invalidateMetricsCache();
    if (event.walletAddress) {
      await applyUserActivity(db, event.walletAddress, event.network ?? 'unknown', event.status ?? 'success', event.operationType);
    }
  }
  return outcome;
}

/**
 * Record a batch of events (a whole logical action) in one MongoDB round trip.
 * Exactly-once semantics are preserved per event via the unique
 * {idempotencyKey, operationType} index; user counters are only incremented for
 * events that were actually inserted.
 */
export async function recordEvents(
  db: Db,
  events: AnalyticsEvent[],
  config: AnalyticsConfig,
): Promise<Array<{ event: AnalyticsEvent; outcome: RecordOutcome }>> {
  if (events.length === 0) return [];
  const results = await insertOperations(db, events);
  for (const { event, outcome } of results) {
    if (outcome === 'inserted' && event.walletAddress) {
      await applyUserActivity(db, event.walletAddress, event.network ?? 'unknown', event.status ?? 'success', event.operationType);
    }
  }
  if (results.some(({ outcome }) => outcome === 'inserted')) invalidateMetricsCache();
  return results;
}

export type UsernameValidation =
  | { ok: true; walletAddress: string; username: string; network: string }
  | { ok: false; reason: string };

/** Usernames are short, printable, and free of control characters. */
const USERNAME_MAX_LENGTH = 32;
const USERNAME_PATTERN = /^[A-Za-z0-9._ -]+$/;

export function validateUsername(input: unknown): UsernameValidation {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, reason: 'Body must be an object.' };
  }
  const body = input as Record<string, unknown>;

  if (typeof body.walletAddress !== 'string' || body.walletAddress.trim().length === 0) {
    return { ok: false, reason: 'walletAddress is required.' };
  }
  if (typeof body.username !== 'string') {
    return { ok: false, reason: 'username is required.' };
  }

  const username = body.username.trim();
  if (username.length === 0) {
    return { ok: false, reason: 'username cannot be empty.' };
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return { ok: false, reason: `username must be at most ${USERNAME_MAX_LENGTH} characters.` };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      reason: 'username may only contain letters, numbers, spaces, dots, underscores and hyphens.',
    };
  }

  return {
    ok: true,
    walletAddress: body.walletAddress.trim(),
    username,
    network: typeof body.network === 'string' && body.network.trim() ? body.network.trim() : 'unknown',
  };
}

/** Persist a wallet-chosen username mapped to its public wallet address. */
export async function registerUsername(db: Db, input: unknown): Promise<UsernameValidation> {
  const validation = validateUsername(input);
  if (!validation.ok) return validation;
  await setWalletUsername(db, validation.walletAddress, validation.username, validation.network);
  return validation;
}

// ─── Metrics aggregation ──────────────────────────────────────────────────────

type MetricsCounts = {
  total: number;
  successful: number;
  proofGenerated: number;
  proofVerified: number;
  permitCreated: number;
  permitConsumed: number;
  protectedAction: number;
  allWallets: number;
  activeWallets: number;
  completedWallets: number;
};

/**
 * Aggregate every operational metric in a single `$facet` aggregation — one
 * MongoDB round trip instead of ten countDocuments/distinct queries that pull
 * full wallet address arrays into Node.js.
 */
async function aggregateMetrics(db: Db, filter: Record<string, unknown>, activeSince: Date): Promise<MetricsCounts> {
  const wallets = { walletAddress: { $ne: null } };
  const facets = await db.collection(OPERATIONS)
    .aggregate<{
      total: Array<{ n: number }>;
      successful: Array<{ n: number }>;
      proofGenerated: Array<{ n: number }>;
      proofVerified: Array<{ n: number }>;
      permitCreated: Array<{ n: number }>;
      permitConsumed: Array<{ n: number }>;
      protectedAction: Array<{ n: number }>;
      allWallets: Array<{ n: number }>;
      activeWallets: Array<{ n: number }>;
      completedWallets: Array<{ n: number }>;
    }>([
      {
        $facet: {
          total: [{ $match: filter }, { $count: 'n' }],
          successful: [{ $match: { ...filter, status: 'success' } }, { $count: 'n' }],
          proofGenerated: [{ $match: { ...filter, operationType: 'proof_generated' } }, { $count: 'n' }],
          proofVerified: [{ $match: { ...filter, operationType: 'proof_verified' } }, { $count: 'n' }],
          permitCreated: [{ $match: { ...filter, operationType: 'permit_created' } }, { $count: 'n' }],
          permitConsumed: [{ $match: { ...filter, operationType: 'permit_consumed' } }, { $count: 'n' }],
          protectedAction: [
            { $match: { ...filter, operationType: 'protected_action', status: 'success' } },
            { $count: 'n' },
          ],
          allWallets: [
            { $match: { ...filter, ...wallets } },
            { $group: { _id: '$walletAddress' } },
            { $count: 'n' },
          ],
          activeWallets: [
            { $match: { ...filter, ...wallets, createdAt: { $gte: activeSince } } },
            { $group: { _id: '$walletAddress' } },
            { $count: 'n' },
          ],
          completedWallets: [
            { $match: { ...filter, ...wallets, operationType: 'protected_action', status: 'success' } },
            { $group: { _id: '$walletAddress' } },
            { $count: 'n' },
          ],
        },
      },
    ])
    .toArray();

  const first = facets[0] ?? {};
  const n = (arr: Array<{ n: number }> | undefined): number => arr?.[0]?.n ?? 0;
  const total = n(first.total);
  return {
    total,
    successful: n(first.successful),
    proofGenerated: n(first.proofGenerated),
    proofVerified: n(first.proofVerified),
    permitCreated: n(first.permitCreated),
    permitConsumed: n(first.permitConsumed),
    protectedAction: n(first.protectedAction),
    allWallets: n(first.allWallets),
    activeWallets: n(first.activeWallets),
    completedWallets: n(first.completedWallets),
  };
}

// Short-TTL in-memory cache so the landing page poll (every 30 s) and parallel
// requests never hammer MongoDB for an aggregate that barely changes.
const metricsCache = new Map<string, { at: number; snapshot: MetricsSnapshot }>();

/** Drop the cached snapshot after any real insert so the next read is fresh. */
function invalidateMetricsCache(): void {
  metricsCache.clear();
}

function cachedMetricsKey(network?: string): string {
  return network && network !== 'all' ? network : 'all';
}

/**
 * Build the public metrics snapshot.
 *
 * `network` optionally filters every operational metric; when omitted the whole
 * store is aggregated and `network` reports 'all'. `preprodUsers` always counts
 * wallets first seen on the configured Preprod target network, independently of
 * the filter.
 */
export async function buildMetrics(db: Db, config: AnalyticsConfig, network?: string): Promise<MetricsSnapshot> {
  const key = cachedMetricsKey(network);
  const cached = metricsCache.get(key);
  if (cached && Date.now() - cached.at < config.metricsCacheTtlMs) {
    return cached.snapshot;
  }

  const filter = network && network !== 'all' ? { network } : {};
  const activeSince = new Date(Date.now() - config.activeWindowDays * 86_400_000);

  const [counts, preprodUsers] = await Promise.all([
    aggregateMetrics(db, filter, activeSince),
    db.collection(USERS).countDocuments({ firstSeenNetwork: config.preprodTargetNetwork }),
  ]);

  const snapshot: MetricsSnapshot = {
    users: {
      total: counts.allWallets,
      active: counts.activeWallets,
      completedFlow: counts.completedWallets,
    },
    operations: {
      total: counts.total,
      successful: counts.successful,
      failed: counts.total - counts.successful,
    },
    proofs: { generated: counts.proofGenerated, verified: counts.proofVerified },
    permits: { created: counts.permitCreated, consumed: counts.permitConsumed },
    protectedActions: counts.protectedAction,
    successRate: counts.total > 0 ? Math.round((counts.successful / counts.total) * 1000) / 10 : 0,
    preprodUsers,
    preprodTarget: config.preprodTargetCount,
    network: network && network !== 'all' ? network : 'all',
  };

  metricsCache.set(key, { at: Date.now(), snapshot });
  return snapshot;
}

/** Admin-only wallet export (never exposed on the public landing page). */
export async function listWallets(db: Db, config: AnalyticsConfig, limit = 500): Promise<WalletRow[]> {
  const cursor = db
    .collection(USERS)
    .find()
    .sort({ lastSeenAt: -1 })
    .limit(limit);

  const rows: WalletRow[] = [];
  for await (const u of cursor) {
    rows.push({
      walletAddress: u.walletAddress,
      username: typeof u.username === 'string' ? u.username : undefined,
      firstSeenAt: u.firstSeenAt.toISOString(),
      lastSeenAt: u.lastSeenAt.toISOString(),
      network: u.firstSeenNetwork,
      totalOperations: u.totalOperations,
      successful: u.successful,
      failed: u.failed,
      completedFlow: u.completedFlowAt != null,
    });
  }
  return rows;
}
