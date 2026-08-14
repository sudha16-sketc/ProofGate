// Operations collection — one row per recorded user-facing operation.
//
// Each row is an anonymous, minimal event: what kind of operation happened,
// whether it succeeded, the wallet that performed it (null for pre-wallet
// failures), a client idempotency key, and a few timing details. Private
// witnesses are never recorded here.

import { MongoBulkWriteError, MongoServerError, type BulkWriteResult, type Db } from 'mongodb';

import type { AnalyticsEvent, OperationStatus, OperationType } from './types';

export type OperationDocument = {
  operationType: OperationType;
  status: OperationStatus;
  walletAddress?: string | null;
  idempotencyKey: string;
  txHash?: string | null;
  durationMs?: number | null;
  errorCode?: string | null;
  stage?: string | null;
  network?: string;
  createdAt: Date;
};

const OPERATIONS = 'operations';

export async function ensureOperationIndexes(db: Db): Promise<void> {
  // Idempotency guard: the same logical action reported twice (client retry or
  // duplicate POST) must not be double-counted in the metrics.
  await db.collection(OPERATIONS).createIndex({ idempotencyKey: 1, operationType: 1 }, { unique: true });
  // Metrics reads group by network + operationType + status.
  await db.collection(OPERATIONS).createIndex({ network: 1, operationType: 1, status: 1 });
  // Metrics distinct counts group wallets over time (network + active window).
  await db.collection(OPERATIONS).createIndex({ walletAddress: 1, network: 1, createdAt: 1 });
  await db.collection(OPERATIONS).createIndex({ createdAt: 1 });
  await db.collection(OPERATIONS).createIndex({ network: 1 });
}

export type RecordOutcome = 'inserted' | 'duplicate';

function toDocument(event: AnalyticsEvent): OperationDocument {
  return {
    operationType: event.operationType,
    status: event.status ?? 'success',
    walletAddress: event.walletAddress ?? null,
    idempotencyKey: event.idempotencyKey,
    txHash: event.txHash ?? null,
    durationMs: event.durationMs ?? null,
    errorCode: event.errorCode ?? null,
    stage: event.stage ?? null,
    network: event.network ?? 'unknown',
    createdAt: new Date(),
  };
}

/**
 * Insert one operation event. Returns 'duplicate' when an identical
 * {idempotencyKey, operationType} already exists, so the caller can skip the
 * user-counter increment and keep metrics exactly-once.
 */
export async function insertOperation(db: Db, event: AnalyticsEvent): Promise<RecordOutcome> {
  try {
    await db.collection(OPERATIONS).insertOne(toDocument(event));
    return 'inserted';
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) return 'duplicate';
    throw err;
  }
}

/**
 * Insert many operation events in a single bulkWrite (ordered: false), so a
 * whole logical action is persisted in one round trip. Duplicates (existing
 * {idempotencyKey, operationType}) are skipped and reported per event.
 */
export async function insertOperations(
  db: Db,
  events: AnalyticsEvent[],
): Promise<Array<{ event: AnalyticsEvent; outcome: RecordOutcome }>> {
  if (events.length === 0) return [];
  const docs = events.map((event) => ({ event, doc: toDocument(event) }));

  // The driver throws MongoBulkWriteError (carrying the partial result) when
  // any write in the batch fails — including the intended duplicate-key skips.
  let result: BulkWriteResult;
  try {
    result = await db.collection(OPERATIONS).bulkWrite(
      docs.map(({ doc }) => ({ insertOne: { document: doc } })),
      { ordered: false },
    );
  } catch (err) {
    if (err instanceof MongoBulkWriteError && err.result) {
      result = err.result;
    } else {
      throw err;
    }
  }

  const duplicateIndexes = new Set<number>();
  for (const writeErr of result.getWriteErrors()) {
    if (writeErr.code === 11000) duplicateIndexes.add(writeErr.index);
  }

  return docs.map(({ event }, index) => ({
    event,
    outcome: duplicateIndexes.has(index) ? 'duplicate' : 'inserted',
  }));
}
