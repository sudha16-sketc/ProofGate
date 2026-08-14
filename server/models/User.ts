// Users collection — one document per public wallet address.
//
// Stores only aggregation-friendly metadata: first/last seen timestamps, the
// network the wallet was first seen on, and denormalized operation counters for
// the admin wallet export. No identity data, no credentials, no proofs.

import type { Db } from 'mongodb';

import type { OperationStatus, OperationType } from './types';

export type UserDocument = {
  walletAddress: string;
  username?: string;
  usernameSetAt?: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
  firstSeenNetwork: string;
  totalOperations: number;
  successful: number;
  failed: number;
  completedFlowAt?: Date;
};

const USERS = 'users';

export async function ensureUserIndexes(db: Db): Promise<void> {
  await db.collection(USERS).createIndex({ walletAddress: 1 }, { unique: true });
  await db.collection(USERS).createIndex({ firstSeenNetwork: 1 });
  await db.collection(USERS).createIndex({ lastSeenAt: 1 });
}

/**
 * Reflect one successfully-recorded operation on a user's counters.
 *
 * Callers must only invoke this AFTER the operation row was actually inserted
 * (the idempotency guard lives in the operations collection), so a duplicate
 * event never double-increments the counters.
 */
export async function applyUserActivity(
  db: Db,
  walletAddress: string,
  network: string,
  status: OperationStatus,
  operationType: OperationType,
): Promise<void> {
  const now = new Date();
  const completedFlow = operationType === 'protected_action' && status === 'success';
  const set: Record<string, unknown> = { lastSeenAt: now };
  const min: Record<string, Date> = completedFlow ? { completedFlowAt: now } : {};

  await db.collection(USERS).updateOne(
    { walletAddress },
    {
      $set: set,
      $min: min,
      $setOnInsert: {
        walletAddress,
        firstSeenAt: now,
        firstSeenNetwork: network,
      },
      $inc: {
        totalOperations: 1,
        ...(status === 'success' ? { successful: 1 } : { failed: 1 }),
      },
    },
    { upsert: true },
  );
}

/**
 * Set (or overwrite) the display name a wallet chose for itself.
 *
 * Maps a username to its public wallet address. Creates the user document if it
 * does not exist yet (e.g. the wallet connected without reporting any event).
 */
export async function setWalletUsername(
  db: Db,
  walletAddress: string,
  username: string,
  network: string,
): Promise<void> {
  const now = new Date();
  await db.collection(USERS).updateOne(
    { walletAddress },
    {
      $set: { username, usernameSetAt: now, lastSeenAt: now },
      $setOnInsert: {
        walletAddress,
        firstSeenAt: now,
        firstSeenNetwork: network,
        totalOperations: 0,
        successful: 0,
        failed: 0,
      },
    },
    { upsert: true },
  );
}
