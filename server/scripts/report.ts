// Analytics CLI — print the aggregate activity snapshot.
//
//   npm run analytics:report
//
// Talks to MongoDB directly (no HTTP server required) and requires only the
// same environment variables as the server (MONGODB_URI / MONGODB_DATABASE).

import { ensureAnalyticsIndexes } from '../app';
import { loadConfig } from '../config';
import { connectAnalyticsDb } from '../db/mongodb';
import { buildMetrics } from '../services/analytics';

async function main(): Promise<void> {
  const config = loadConfig();
  const analytics = await connectAnalyticsDb(config);
  try {
    await ensureAnalyticsIndexes(analytics.db);
    const snapshot = await buildMetrics(analytics.db, config, process.argv[2]);
    console.log(`ProofGate activity report (network: ${snapshot.network})`);
    console.log(JSON.stringify(snapshot, null, 2));
  } finally {
    await analytics.close();
  }
}

main().catch((err) => {
  console.error('analytics:report failed', err);
  process.exit(1);
});
