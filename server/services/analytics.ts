// Analytics service — the single place that turns client-reported events into
// stored facts and aggregates them into the public metrics snapshot.
//
// PRIVACY MODEL: only the public wallet address and aggregate counters are kept.
// The store answers "how many users did X" — never "which identity did X".

import type { Db } from 'mongodb';

import type { AnalyticsConfig } from '../config';
import { insertOperation, type RecordOutcome } from '../models/Operation';
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
  if (outcome === 'inserted' && event.walletAddress) {
    await applyUserActivity(db, event.walletAddress, event.network ?? 'unknown', event.status ?? 'success', event.operationType);
  }
  return outcome;
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

function count(db: Db, filter: Record<string, unknown>): Promise<number> {
  return db.collection(OPERATIONS).countDocuments(filter);
}

function distinctWallets(db: Db, filter: Record<string, unknown>): Promise<string[]> {
  return db.collection(OPERATIONS).distinct('walletAddress', filter);
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
  const filter = network && network !== 'all' ? { network } : {};
  const activeSince = new Date(Date.now() - config.activeWindowDays * 86_400_000);

  const total = await count(db, filter);
  const successful = await count(db, { ...filter, status: 'success' });
  const failed = total - successful;

  const [generated, verified, permitsCreated, permitsConsumed, protectedActions] = await Promise.all([
    count(db, { ...filter, operationType: 'proof_generated' }),
    count(db, { ...filter, operationType: 'proof_verified' }),
    count(db, { ...filter, operationType: 'permit_created' }),
    count(db, { ...filter, operationType: 'permit_consumed' }),
    count(db, { ...filter, operationType: 'protected_action', status: 'success' }),
  ]);

  const [allWallets, activeWallets, completedWallets, preprodUsers] = await Promise.all([
    distinctWallets(db, { ...filter, walletAddress: { $ne: null } }),
    distinctWallets(db, { ...filter, walletAddress: { $ne: null }, createdAt: { $gte: activeSince } }),
    distinctWallets(db, {
      ...filter,
      walletAddress: { $ne: null },
      operationType: 'protected_action',
      status: 'success',
    }),
    db.collection(USERS).countDocuments({ firstSeenNetwork: config.preprodTargetNetwork }),
  ]);

  return {
    users: {
      total: allWallets.length,
      active: activeWallets.length,
      completedFlow: completedWallets.length,
    },
    operations: { total, successful, failed },
    proofs: { generated, verified },
    permits: { created: permitsCreated, consumed: permitsConsumed },
    protectedActions,
    successRate: total > 0 ? Math.round((successful / total) * 1000) / 10 : 0,
    preprodUsers,
    preprodTarget: config.preprodTargetCount,
    network: network && network !== 'all' ? network : 'all',
  };
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
