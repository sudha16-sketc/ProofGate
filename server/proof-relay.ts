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
// minutes on slow circuits. Timeouts must never truncate a real proof.
const PATH_TIMEOUT_MS: Record<(typeof RELAY_PATHS)[number], number> = {
  '/check': 60_000,
  '/prove': 5 * 60_000,
};

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 16, timeout: 5 * 60_000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 16, timeout: 5 * 60_000 });

function relay(config: AnalyticsConfig) {
  return (req: Request, res: Response): void => {
    const upstream = new URL(`${config.proofServerUrl}${req.path}`);
    const transport = upstream.protocol === 'https:' ? https : http;
    const startedAt = Date.now();

    const outReq = transport.request(
      {
        hostname: upstream.hostname,
        port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
        path: `${upstream.pathname}${upstream.search}`,
        method: 'POST',
        agent: upstream.protocol === 'https:' ? httpsAgent : httpAgent,
        timeout: PATH_TIMEOUT_MS[req.path as (typeof RELAY_PATHS)[number]] ?? 60_000,
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
      console.error(`[proof-relay] upstream ${req.path} timed out after ${PATH_TIMEOUT_MS[req.path as (typeof RELAY_PATHS)[number]] ?? 60_000}ms`);
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
  for (const path of RELAY_PATHS) {
    router.post(path, relay(config));
  }
  return router;
}
