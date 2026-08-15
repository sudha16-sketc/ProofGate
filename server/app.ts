// ProofGate analytics API — Express application factory.
//
// `createApp` is pure and dependency-injectable so the headless test suite can
// run it against an in-memory MongoDB without any environment configuration.
// `server/index.ts` is the thin startup entry point that reads real config.

import cors from 'cors';
import express, { type Express } from 'express';
import type { Db } from 'mongodb';

import type { AnalyticsConfig } from './config';
import { ensureOperationIndexes } from './models/Operation';
import { ensureUserIndexes } from './models/User';
import { createProofRelayRouter } from './proof-relay';
import { analyticsRouter } from './routes/analytics';

export async function ensureAnalyticsIndexes(db: Db): Promise<void> {
  await Promise.all([ensureOperationIndexes(db), ensureUserIndexes(db)]);
}

export type CreateAppOptions = {
  db: Db;
  config: AnalyticsConfig;
  /** Optional path to a built frontend to serve in production. */
  staticDir?: string;
};

export function createApp({ db, config, staticDir }: CreateAppOptions): Express {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  // Stream /check and /prove to the Midnight proof server (reached via the
  // PROOF_SERVER_URL tunnel; the proof server itself runs on a developer
  // machine, never on Render). Must come before the JSON body parser so raw
  // octet-stream proving payloads pass through untouched.
  app.use(createProofRelayRouter(config));
  app.use(express.json({ limit: '32kb' }));

  app.use('/api', analyticsRouter(db, config));

  // Production: serve the compiled frontend from the same origin as the API.
  if (staticDir) {
    app.use(express.static(staticDir));
    app.get(/.*/, (_req, res) => {
      res.sendFile('index.html', { root: staticDir }, (err) => {
        if (err) res.status(404).end();
      });
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[analytics] unhandled error', err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
