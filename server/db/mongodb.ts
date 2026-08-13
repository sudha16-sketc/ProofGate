// MongoDB connection helpers for the analytics store.
//
// A single MongoClient is shared by the whole server process. The client is
// kept server-side only — the browser never receives the connection string.

import { MongoClient, type Db } from 'mongodb';

import type { AnalyticsConfig } from '../config';

export type AnalyticsDb = {
  client: MongoClient;
  db: Db;
  close: () => Promise<void>;
};

export async function connectAnalyticsDb(config: Pick<AnalyticsConfig, 'mongoUri' | 'mongoDatabase'>): Promise<AnalyticsDb> {
  const client = new MongoClient(config.mongoUri, {
    appName: 'proofgate-analytics',
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  const db = client.db(config.mongoDatabase);
  return { client, db, close: () => client.close() };
}
