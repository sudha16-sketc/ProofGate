// Analytics CLI — export the wallet-level activity list (admin only).
//
//   npm run analytics:export-users -- [--limit 500]
//
// Requires ADMIN_API_TOKEN to be set, matching the server's admin token. Prints
// a JSON array. This data is never served on the public landing page.

import { ensureAnalyticsIndexes } from '../app';
import { loadConfig } from '../config';
import { connectAnalyticsDb } from '../db/mongodb';
import { listWallets } from '../services/analytics';

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.adminApiToken) {
    console.error('ADMIN_API_TOKEN is not set — refusing to export wallets without it.');
    process.exit(1);
  }
  const analytics = await connectAnalyticsDb(config);
  try {
    await ensureAnalyticsIndexes(analytics.db);
    const limitArg = process.argv.findIndex((a) => a === '--limit');
    const limit = limitArg >= 0 ? Number.parseInt(process.argv[limitArg + 1] ?? '500', 10) : 500;
    const rows = await listWallets(analytics.db, config, Number.isFinite(limit) ? limit : 500);
    console.log(JSON.stringify({ count: rows.length, users: rows }, null, 2));
  } finally {
    await analytics.close();
  }
}

main().catch((err) => {
  console.error('analytics:export-users failed', err);
  process.exit(1);
});
