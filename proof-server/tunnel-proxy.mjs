#!/usr/bin/env node
// ProofGate — minimal authenticating reverse proxy for the LOCAL Midnight proof
// server.
//
// The deployed Render API relays /check and /prove to PROOF_SERVER_URL. For the
// local (laptop) proof server to receive those requests, that URL must be a
// public HTTPS tunnel (e.g. cloudflared) — but a raw tunnel would expose an
// unauthenticated proving endpoint to the internet. This proxy sits in front of
// the proof server on 127.0.0.1, requires the same shared secret the relay
// sends (PROOF_SERVER_AUTH_TOKEN), and forwards only matching requests.
//
//   docker compose up -d --wait proof-server           # proof server on :6300
//   PROOF_SERVER_AUTH_TOKEN=... node proof-server/tunnel-proxy.mjs
//   cloudflared tunnel --url http://127.0.0.1:6400     # public HTTPS entry
//
// It fails closed: without PROOF_SERVER_AUTH_TOKEN it refuses to start, so an
// accidentally-open public endpoint is impossible. Port 6300 (the proof server
// itself) is never bound to a public interface by this setup.

import http from 'node:http';

const token = process.env.PROOF_SERVER_AUTH_TOKEN?.trim();
if (!token) {
  console.error(
    '[tunnel-proxy] PROOF_SERVER_AUTH_TOKEN is required. Set it to the same value as the Render API PROOF_SERVER_AUTH_TOKEN.',
  );
  process.exit(1);
}

const upstream = new URL(process.env.PROOF_SERVER_UPSTREAM ?? 'http://127.0.0.1:6300');
const host = process.env.TUNNEL_PROXY_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.TUNNEL_PROXY_PORT ?? '6400', 10);
// Proofs take minutes with an idle socket between request upload and response;
// keep this well above any realistic /prove duration.
const proxyTimeoutMs = Number.parseInt(process.env.TUNNEL_PROXY_TIMEOUT_MS ?? String(20 * 60_000), 10);

const server = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    console.error(`[tunnel-proxy] rejected ${req.method} ${req.url} — missing/invalid Authorization`);
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized.' }));
    return;
  }

  const out = http.request(
    {
      hostname: upstream.hostname,
      port: upstream.port || 80,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: upstream.host },
      timeout: proxyTimeoutMs,
    },
    (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, upRes.headers);
      upRes.pipe(res);
      upRes.on('error', (err) => {
        console.error('[tunnel-proxy] upstream response stream error:', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'Proof server unreachable.' }));
        } else {
          res.end();
        }
      });
    },
  );

  out.on('timeout', () => {
    console.error(`[tunnel-proxy] upstream timed out after ${proxyTimeoutMs}ms`);
    out.destroy(new Error('Upstream timeout'));
  });
  out.on('error', (err) => {
    console.error('[tunnel-proxy] upstream failed:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proof server unreachable.' }));
    } else {
      res.end();
    }
  });

  res.on('close', () => {
    out.destroy();
  });

  req.pipe(out);
});

server.listen(port, host, () => {
  console.log(`[tunnel-proxy] listening on http://${host}:${port} → ${upstream.origin} (auth required)`);
});

server.on('error', (err) => {
  console.error('[tunnel-proxy] fatal:', err.message);
  process.exit(1);
});
