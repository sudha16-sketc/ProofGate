// ProofGate proof-server relay.
//
// The Midnight proof server (`midnightntwrk/proof-server`) runs on the
// DEVELOPER MACHINE (16 GB RAM) and is reached by this deployed API through a
// secure HTTPS tunnel (see proof-server/tunnel-proxy.mjs and
// docs/PROVING_ARCHITECTURE.md). The browser POSTs raw proving payloads to THIS
// service's origin (/check, /prove); this router streams them to
// PROOF_SERVER_URL (the tunnel) and streams the binary response back. Nothing
// is parsed or buffered here — proving payloads are `application/octet-stream`
// (the client uploads the circuit proving key inside the payload), so this is a
// pure byte-forwarding hop. No SRS parameters or proving keys are ever loaded
// on Render.
//
// Connection reuse: a single keep-alive agent is shared across requests so
// consecutive /check → /prove round trips reuse the same TCP connection.
//
// Concurrency: /prove is single-flight. The local proof server handles one job
// at a time; additional /prove requests wait in a FIFO queue instead of
// starting a second memory-hungry proof. /check and every other API route are
// NOT serialised.

import { Router, type Request, type Response } from 'express';
import http from 'node:http';
import https from 'node:https';
import type { AnalyticsConfig } from './config';

const RELAY_PATHS = ['/check', '/prove'] as const;

// /check only validates inputs (fast); /prove generates a ZK proof and can take
// minutes on slow circuits. The /prove cap comes from the PROOF_SERVER_TIMEOUT_MS
// env (default 20 min) and must never truncate a real proof; /check stays at a
// fast 60 s since it never does proving work.
const CHECK_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 5_000;

const PROOF_TIMEOUT_MS = (config: AnalyticsConfig): number => config.proofServerTimeoutMs;

// The keep-alive agents must outlive the longest possible /prove so a slow proof
// is never cut off by a socket-level timeout. They are created once per router
// and shared across all requests (connection reuse).
type Agents = { http: http.Agent; https: https.Agent };

function agentsFor(config: AnalyticsConfig): Agents {
  const timeout = PROOF_TIMEOUT_MS(config);
  return {
    http: new http.Agent({ keepAlive: true, maxSockets: 16, timeout }),
    https: new https.Agent({ keepAlive: true, maxSockets: 16, timeout }),
  };
}

// Single-flight gate for /prove: only one proof runs at a time; later proofs
// wait in line. Implemented as a promise chain — a proof only starts after the
// previous one has fully streamed its response, and errors never poison later
// proofs.
let proveTail: Promise<void> = Promise.resolve();

function runProveExclusively<T>(work: () => Promise<T>): Promise<T> {
  const run = proveTail.then(work, work);
  proveTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Stream one relayed request to the upstream proof server and its response back. */
function streamToUpstream(
  config: AnalyticsConfig,
  agents: Agents,
  req: Request,
  res: Response,
  path: string,
): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const requestTimeout = path === '/prove' ? PROOF_TIMEOUT_MS(config) : CHECK_TIMEOUT_MS;

    let upstream: URL;
    try {
      upstream = new URL(`${config.proofServerUrl}${path}`);
    } catch {
      console.error(`[proof-relay] invalid PROOF_SERVER_URL: ${config.proofServerUrl}`);
      if (!res.destroyed && !res.headersSent) {
        res.status(502).json({ error: 'Proof server unreachable.', detail: 'PROOF_SERVER_URL is not a valid URL.' });
      }
      resolve();
      return;
    }

    const transport = upstream.protocol === 'https:' ? https : http;
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const headers: http.OutgoingHttpHeaders = {
      'content-type': req.headers['content-type'] ?? 'application/octet-stream',
      'content-length': req.headers['content-length'],
    };
    if (config.proofServerAuthToken) {
      headers.authorization = `Bearer ${config.proofServerAuthToken}`;
    }

    const outReq = transport.request(
      {
        hostname: upstream.hostname,
        port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
        path: `${upstream.pathname}${upstream.search}`,
        method: 'POST',
        agent: upstream.protocol === 'https:' ? agents.https : agents.http,
        timeout: requestTimeout,
        headers,
      },
      (upRes) => {
        res.status(upRes.statusCode ?? 502);
        for (const [name, value] of Object.entries(upRes.headers)) {
          if (name === 'content-length' || name === 'content-encoding') continue;
          res.setHeader(name, value as string);
        }
        upRes.pipe(res);
        // The upstream response body is fully received once proving finishes —
        // release the /prove lock then so the next proof can start while this
        // response is still flushing to the client.
        upRes.on('end', settle);
        upRes.on('error', (err) => {
          console.error(`[proof-relay] upstream ${path} response stream error after ${Date.now() - startedAt}ms`, err.message);
          if (!res.destroyed && !res.headersSent) {
            res.status(502).json({ error: 'Proof server unreachable.', detail: 'The proof service could not be reached. Retry the operation.' });
          } else if (!res.destroyed) {
            res.end();
          }
          settle();
        });
      },
    );

    outReq.on('timeout', () => {
      console.error(`[proof-relay] upstream ${path} timed out after ${requestTimeout}ms`);
      outReq.destroy(new Error('Upstream timeout'));
    });

    outReq.on('error', (err) => {
      console.error(`[proof-relay] upstream ${path} failed after ${Date.now() - startedAt}ms`, err.message);
      if (res.destroyed || res.writableEnded) {
        res.end();
      } else if (!res.headersSent) {
        res.status(502).json({ error: 'Proof server unreachable.', detail: 'The proof service could not be reached. Retry the operation.' });
      } else {
        res.end();
      }
      settle();
    });

    // Client disconnected or response completed — stop forwarding and release
    // the /prove lock. (Node fires ServerResponse 'close' at response completion
    // even on keep-alive connections.)
    res.on('close', () => {
      settle();
      outReq.destroy();
    });
    res.on('finish', () => {
      console.debug(`[proof-relay] ${path} → ${upstream.origin} in ${Date.now() - startedAt}ms`);
    });
    // Swallow writes after the client aborted so an abandoned stream never
    // crashes the API process.
    res.on('error', (err) => {
      console.debug(`[proof-relay] response stream error: ${err.message}`);
    });

    req.pipe(outReq);
  });
}

function relay(config: AnalyticsConfig, agents: Agents) {
  return (req: Request, res: Response): void => {
    const path = req.path;
    const forward = (): Promise<void> => streamToUpstream(config, agents, req, res, path);

    if (path === '/prove') {
      void runProveExclusively(async () => {
        if (res.writableEnded || req.destroyed) return;
        try {
          await forward();
        } catch (err) {
          console.error(`[proof-relay] ${path} failed`, err);
          if (!res.destroyed && !res.headersSent) {
            res.status(502).json({ error: 'Proof server unreachable.', detail: 'The proof service could not be reached. Retry the operation.' });
          }
        }
      });
    } else {
      void forward().catch((err) => {
        console.error(`[proof-relay] ${path} failed`, err);
        if (!res.destroyed && !res.headersSent) {
          res.status(502).json({ error: 'Proof server unreachable.', detail: 'The proof service could not be reached. Retry the operation.' });
        }
      });
    }
  };
}

/**
 * GET /api/proof-server/health — reachability probe for the configured
 * PROOF_SERVER_URL (the tunnel to the local proof server). The API itself stays
 * healthy even when the proof server is down; this endpoint just reports it.
 */
export function createProofServerHealthHandler(config: AnalyticsConfig) {
  return async (_req: Request, res: Response): Promise<void> => {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const response = await fetch(config.proofServerUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: config.proofServerAuthToken
          ? { authorization: `Bearer ${config.proofServerAuthToken}` }
          : undefined,
      });
      const latencyMs = Date.now() - startedAt;
      const ok = response.ok;
      const proofServer = !ok && (response.status === 401 || response.status === 403)
        ? 'unauthorized'
        : ok
          ? 'up'
          : 'down';
      res.json({ ok, proofServer, status: response.status, latencyMs });
    } catch {
      const latencyMs = Date.now() - startedAt;
      res.json({ ok: false, proofServer: 'down', status: null, latencyMs });
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Router mounting the /check, /prove and proof-server-health endpoints. Mounted before body parsers. */
export function createProofRelayRouter(config: AnalyticsConfig): Router {
  const router = Router();
  const agents = agentsFor(config);
  for (const path of RELAY_PATHS) {
    router.post(path, relay(config, agents));
  }
  router.get('/api/proof-server/health', createProofServerHealthHandler(config));
  return router;
}
