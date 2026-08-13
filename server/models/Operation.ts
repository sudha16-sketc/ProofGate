// Operations collection — one row per recorded user-facing operation.
//
// Each row is an anonymous, minimal event: what kind of operation happened,
// whether it succeeded, the wallet that performed it (null for pre-wallet
// failures), a client idempotency key, and a few timing details. Private
// witnesses are never recorded here.

import { MongoServerError, type Db } from 'mongodb';

import type { AnalyticsEvent, OperationStatus, OperationType } from './types';

export type OperationDocument = {
  operationType: OperationType;
  status: OperationStatus;
  walletAddress?: string | null;
  idempotencyKey: string;
  txHash?: string | null;
  durationMs?: number | null;
  errorCode?: string | null;
  network?: string;
  createdAt: Date;
};

const OPERATIONS = 'operations';

export async function ensureOperationIndexes(db: Db): Promise<void> {
  // Idempotency guard: the same logical action reported twice (client retry or
  // duplicate POST) must not be double-counted in the metrics.
  await db.collection(OPERATIONS).createIndex({ idempotencyKey: 1, operationType: 1 }, { unique: true });
  await db.collection(OPERATIONS).createIndex({ createdAt: 1 });
  await db.collection(OPERATIONS).createIndex({ network: 1 });
}

export type RecordOutcome = 'inserted' | 'duplicate';

/**
 * Insert one operation event. Returns 'duplicate' when an identical
 * {idempotencyKey, operationType} already exists, so the caller can skip the
 * user-counter increment and keep metrics exactly-once.
 */
export async function insertOperation(db: Db, event: AnalyticsEvent): Promise<RecordOutcome> {
  const doc: OperationDocument = {
    operationType: event.operationType,
    status: event.status ?? 'success',
    walletAddress: event.walletAddress ?? null,
    idempotencyKey: event.idempotencyKey,
    txHash: event.txHash ?? null,
    durationMs: event.durationMs ?? null,
    errorCode: event.errorCode ?? null,
    network: event.network ?? 'unknown',
    createdAt: new Date(),
  };
  try {
    await db.collection(OPERATIONS).insertOne(doc);
    return 'inserted';
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) return 'duplicate';
    throw err;
  }
}
