// MongoDB connection helpers for the analytics store.
//
// A single MongoClient is shared by the whole server process. The client is
// kept server-side only — the browser never receives the connection string.
//
// When no MONGODB_URI is configured, the server falls back to an in-memory
// MongoDB (mongodb-memory-server) so local development "just works" — note the
// data is ephemeral and resets on restart. Set MONGODB_URI (e.g. Atlas) for a
// persistent store.

import { MongoClient, type Db } from 'mongodb';

import type { AnalyticsConfig } from '../config';

export type AnalyticsDb = {
  client: MongoClient;
  db: Db;
  ephemeral: boolean;
  close: () => Promise<void>;
};

export async function connectAnalyticsDb(config: Pick<AnalyticsConfig, 'mongoUri' | 'mongoDatabase'>): Promise<AnalyticsDb> {
  if (config.mongoUri) {
    const client = new MongoClient(config.mongoUri, {
      appName: 'proofgate-analytics',
      serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    return { client, db: client.db(config.mongoDatabase), ephemeral: false, close: () => client.close() };
  }

  // Ephemeral dev fallback: no MongoDB installed or configured.
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongo = await MongoMemoryServer.create();
  const client = new MongoClient(mongo.getUri(), {
    appName: 'proofgate-analytics-ephemeral',
  });
  await client.connect();
  return {
    client,
    db: client.db(config.mongoDatabase),
    ephemeral: true,
    close: async () => {
      await client.close();
      await mongo.stop();
    },
  };
}
