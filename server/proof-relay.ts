// ProofGate proof-server relay.
//
// The Midnight proof server (`midnightntwrk/proof-server`) runs as a sidecar
// next to the analytics server (same container, localhost:6300). The browser
// POSTs raw proving payloads to the SAME ORIGIN as the dApp (/check, /prove);
// this router streams them to the sidecar and streams the binary response back.
// Nothing is parsed or buffered here — proving payloads are `application/octet-stream`
// (the client uploads the circuit proving key inside the payload), so this is a
// pure byte-forwarding hop.

import { Router, type Request, type Response } from 'express';
import http from 'node:http';
import https from 'node:https';
import type { AnalyticsConfig } from './config';

const RELAY_PATHS = ['/check', '/prove'] as const;

function relay(config: AnalyticsConfig) {
  return (req: Request, res: Response): void => {
    const upstream = new URL(`${config.proofServerUrl}${req.path}`);
    const transport = upstream.protocol === 'https:' ? https : http;

    const outReq = transport.request(
      {
        hostname: upstream.hostname,
        port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
        path: `${upstream.pathname}${upstream.search}`,
        method: 'POST',
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

    outReq.on('error', (err) => {
      console.error('[proof-relay] upstream request failed', err);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Proof server unreachable.', detail: err.message });
      } else {
        res.end();
      }
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
