// ProofGate analytics server — startup entry point.
//
//   npm run server:dev        — watch mode for local development
//   npm run server:start      — production-style start
//
// The server is the ONLY component that ever sees MONGODB_URI. Nothing
// sensitive is exposed to the browser; the landing page reads GET /api/metrics.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config';
import { connectAnalyticsDb } from './db/mongodb';
import { createApp, ensureAnalyticsIndexes } from './app';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const config = loadConfig();
  const analytics = await connectAnalyticsDb(config);
  await ensureAnalyticsIndexes(analytics.db);

  if (analytics.ephemeral) {
    console.log('[proofgate-analytics] no MONGODB_URI set — using an in-memory MongoDB (data resets on restart)');
  }

  const staticDir = path.resolve(__dirname, '..', 'frontend', 'dist');
  const app = createApp({
    db: analytics.db,
    config,
    staticDir: existsSync(staticDir) ? staticDir : undefined,
  });

  const server = app.listen(config.port, () => {
    console.log(`[proofgate-analytics] listening on :${config.port} (db=${config.mongoDatabase})`);
  });

  // The /prove relay streams a ZK proof request to the proof server and the
  // binary response back; a proof can legitimately take many minutes. Node's
  // default `requestTimeout` (5 min) destroys the socket before the response is
  // sent, surfacing in the browser as "Failed to fetch". Disable it so a slow
  // proof is never cut off by the framework. (header parsing stays bounded by
  // the default `headersTimeout`.)
  server.requestTimeout = 0;

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[proofgate-analytics] ${signal} — shutting down`);
    server.close();
    await analytics.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[proofgate-analytics] failed to start', err);
  process.exit(1);
});
