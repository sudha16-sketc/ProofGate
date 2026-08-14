// Analytics HTTP routes.
//
// Public (landing-page) surface:
//   GET  /api/health   — liveness + Mongo connectivity
//   GET  /api/metrics  — aggregate activity (no wallet data)
//   POST /api/events   — anonymous operation events (rate-limited)
//   POST /api/users/username — map a wallet-chosen username to its wallet (rate-limited)
//
// Admin-only (bearer-token protected) surface:
//   GET  /api/admin/users — wallet-level export, never served publicly

import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Db } from 'mongodb';

import type { AnalyticsConfig } from '../config';
import {
  buildMetrics,
  listWallets,
  recordEvent,
  recordEvents,
  registerUsername,
  validateEvent,
} from '../services/analytics';

export function analyticsRouter(db: Db, config: AnalyticsConfig): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    try {
      await db.command({ ping: 1 });
      res.json({ ok: true, service: 'proofgate-analytics', mongo: 'up' });
    } catch {
      res.status(503).json({ ok: false, service: 'proofgate-analytics', mongo: 'down' });
    }
  });

  router.get('/metrics', async (req, res) => {
    const network = typeof req.query.network === 'string' ? req.query.network.trim() : undefined;
    const snapshot = await buildMetrics(db, config, network || undefined);
    res.json(snapshot);
  });

  const eventLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many events — slow down and retry later.' },
  });

  router.post('/events', eventLimiter, async (req, res) => {
    const validation = validateEvent(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.reason });
      return;
    }
    const outcome = await recordEvent(db, validation.event, config);
    res.status(201).json({ accepted: true, outcome });
  });

  // Batched ingestion: one logical action reports several operation events;
  // the client coalesces them into a single request to cut round trips.
  router.post('/events/batch', eventLimiter, async (req, res) => {
    const rawEvents = Array.isArray(req.body?.events) ? req.body.events : null;
    if (!rawEvents) {
      res.status(400).json({ error: 'Batch body must be { events: [...] }.' });
      return;
    }
    if (rawEvents.length === 0) {
      res.status(201).json({ accepted: true, count: 0, outcomes: [] });
      return;
    }
    if (rawEvents.length > config.analyticsBatchMax) {
      res.status(400).json({ error: `A batch may contain at most ${config.analyticsBatchMax} events.` });
      return;
    }

    const events = [];
    for (const raw of rawEvents) {
      const validation = validateEvent(raw);
      if (!validation.ok) {
        res.status(400).json({ error: validation.reason });
        return;
      }
      events.push(validation.event);
    }

    const results = await recordEvents(db, events, config);
    res.status(201).json({
      accepted: true,
      count: results.length,
      outcomes: results.map(({ event, outcome }) => ({ idempotencyKey: event.idempotencyKey, operationType: event.operationType, outcome })),
    });
  });

  const usernameLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests — slow down and retry later.' },
  });

  // Maps a wallet-chosen username to its public wallet address. The mapping is
  // keyed by the wallet itself (the user sets it once, right after connecting).
  router.post('/users/username', usernameLimiter, async (req, res) => {
    const outcome = await registerUsername(db, req.body);
    if (!outcome.ok) {
      res.status(400).json({ error: outcome.reason });
      return;
    }
    res.status(201).json({ accepted: true, username: outcome.username });
  });

  router.get('/admin/users', async (req, res) => {
    const provided = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice('Bearer '.length)
      : '';
    if (!config.adminApiToken || provided !== config.adminApiToken) {
      res.status(401).json({ error: 'Unauthorized. Provide a valid admin bearer token.' });
      return;
    }
    const limit = Number.parseInt(String(req.query.limit ?? '500'), 10);
    const rows = await listWallets(db, config, Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 5000) : 500);
    res.json({ count: rows.length, users: rows });
  });

  return router;
}
