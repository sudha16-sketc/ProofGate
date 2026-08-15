// ProofGate proof-server relay.
//
// The Midnight proof server (`midnightntwrk/proof-server`) runs as a sidecar
// next to the analytics server (same container, localhost:6300) or as an
// independently-deployed Render service (set PROOF_SERVER_URL). The browser
// POSTs raw proving payloads to the SAME ORIGIN as the dApp (/check, /prove);
// this router streams them to the sidecar and streams the binary response back.
// Nothing is parsed or buffered here — proving payloads are `application/octet-stream`
// (the client uploads the circuit proving key inside the payload), so this is a
// pure byte-forwarding hop.
//
// Connection reuse: a single keep-alive agent is shared across requests so
// consecutive /check → /prove round trips for one transaction reuse the same
// TCP connection instead of re-handshaking each time.

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

function relay(config: AnalyticsConfig, agents: Agents) {
  return (req: Request, res: Response): void => {
    const upstream = new URL(`${config.proofServerUrl}${req.path}`);
    const transport = upstream.protocol === 'https:' ? https : http;
    const startedAt = Date.now();
    const requestTimeout =
      req.path === '/prove' ? PROOF_TIMEOUT_MS(config) : CHECK_TIMEOUT_MS;

    const outReq = transport.request(
      {
        hostname: upstream.hostname,
        port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
        path: `${upstream.pathname}${upstream.search}`,
        method: 'POST',
        agent: upstream.protocol === 'https:' ? agents.https : agents.http,
        timeout: requestTimeout,
        headers: {
          'content-type': req.headers['content-type'] ?? 'application/octet-stream',
          'content-length': req.headers['content-length'],
        },
      },
      (upRes) => {
        res.status(upRes.statusCode ?? 502);
        for (const [name, value] of Object.entries(upRes.headers)) {
          if (name === 'content-length' || name === 'content-encoding') continue;
          res.setHeader(name, value as string);
        }
        upRes.pipe(res);
      },
    );

    outReq.on('timeout', () => {
      console.error(`[proof-relay] upstream ${req.path} timed out after ${requestTimeout}ms`);
      outReq.destroy(new Error('Upstream timeout'));
    });

    outReq.on('error', (err) => {
      console.error(`[proof-relay] upstream ${req.path} failed after ${Date.now() - startedAt}ms`, err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Proof server unreachable.', detail: 'The proof service could not be reached. Retry the operation.' });
      } else {
        res.end();
      }
    });

    res.on('finish', () => {
      console.debug(`[proof-relay] ${req.path} → ${upstream.origin} in ${Date.now() - startedAt}ms`);
    });

    req.pipe(outReq);
  };
}

/** Router mounting the /check and /prove relay endpoints. Mounted before body parsers. */
export function createProofRelayRouter(config: AnalyticsConfig): Router {
  const router = Router();
  const agents = agentsFor(config);
  for (const path of RELAY_PATHS) {
    router.post(path, relay(config, agents));
  }
  return router;
}
