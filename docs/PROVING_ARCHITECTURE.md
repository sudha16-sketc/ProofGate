# ProofGate — Proving Architecture (ZK proving OFF Render)

ProofGate uses **custom Midnight circuits**, so the Lace wallet's built-in
proving backend cannot prove them (`key not found: <circuit>`). Proving is done
by an official `midnightntwrk/proof-server` instance over the same
`httpClientProofProvider` path as the CLI.

The Midnight proof server is **memory- and CPU-hungry** (BLS12-381 SRS
parameters + multi-MB proving keys in RAM; the default is 2 workers with 4 GB
recommended). Render's free plan is 512 MB RAM / 0.1 CPU — it **cannot** run a
proof. So proving runs on a developer machine and Render only *relays* the
bytes.

## Target flow

```
Browser (Vercel frontend)
        │  POST /check, /prove   (the circuit key rides in the octet-stream payload)
        ▼
Render Free — proofgate-api (Express: analytics + relay)
        │  streams to PROOF_SERVER_URL (HTTPS tunnel)
        ▼
cloudflared / ngrok / SSH tunnel (public HTTPS endpoint)
        │  checks `Authorization: Bearer <PROOF_SERVER_AUTH_TOKEN>`
        ▼
tunnel-proxy (127.0.0.1:6400, local, auth required)
        │  forwards to 127.0.0.1:6300
        ▼
Local Midnight proof server (docker compose) — THE ONLY ZK prover
        │
        ▼
Midnight network
```

Render free tier therefore runs **zero** ZK work: no SRS loading, no `.prover`
files, no proving keys in the container image. It is a stateless byte-forwarding
hop plus the existing analytics API.

## Environment variables

| Variable | Where | Local value | Production value |
|---|---|---|---|
| `PROOF_SERVER_URL` | Render API | `http://127.0.0.1:6300` | `https://<your-tunnel>.trycloudflare.com` |
| `PROOF_SERVER_AUTH_TOKEN` | Render API + tunnel proxy | (empty for pure local) | `openssl rand -hex 24` output, same on both |
| `PROOF_SERVER_TIMEOUT_MS` | Render API | `1200000` (default) | `1200000` (default; keep ≥ 5 min) |
| `VITE_PROOF_SERVER_URL` | frontend | unset (Vite dev proxy → `127.0.0.1:6300`) | `https://proofgate-api.onrender.com` (the Render API origin) |
| `VITE_PROOF_SERVER_TIMEOUT_MS` | frontend | unset → 20 min | unset → 20 min |
| `VITE_API_URL` | frontend | unset (same-origin) | `https://proofgate-api.onrender.com` |

`PROOF_SERVER_URL` is **never** `127.0.0.1` in production: Render cannot reach
your laptop's loopback. It must be the HTTPS URL of the tunnel that fronts the
local proof server.

## Start the local proof server

```bash
# one-time image pull + first-boot SRS/proving-key download takes several minutes
docker compose up -d --wait proof-server

# verify it is healthy and responding
curl -i http://127.0.0.1:6300/            # expect HTTP/1.1 200
curl -s http://127.0.0.1:6300/health      # JSON status
```

ZK parameters are cached in the named Docker volume `proofgate-zk-params`
(mounted at `/.cache/midnight/zk-params`) so restarts do not re-download them.

> Docker is not required to be running while the dApp is idle — only when a
> proof is actually requested through the tunnel.

## Start the secure tunnel

The local proof server must never be exposed raw on the internet. Run the tiny
authenticating proxy in front of it, then point the tunnel at the **proxy**
(not `:6300`):

```bash
# 1) generate (or reuse) the shared secret, same value as the Render API uses
openssl rand -hex 24

# 2) auth proxy on 127.0.0.1:6400 → proof server :6300 (fails closed without the token)
PROOF_SERVER_AUTH_TOKEN=<token> node proof-server/tunnel-proxy.mjs

# 3) public HTTPS entry → the auth proxy (pick ONE tunnel tool)
cloudflared tunnel --url http://127.0.0.1:6400
#   → prints https://<random>.trycloudflare.com   (copy this into PROOF_SERVER_URL)
```

The proxy rejects any request without the correct `Authorization: Bearer`
header, so the tunnel is not an open proving endpoint. If the tunnel drops,
Render's `/prove` simply returns a 502 — the API stays up.

## Run the Render API (relay + analytics)

Local development:

```bash
cp .env.example .env                       # PROOF_SERVER_URL=http://127.0.0.1:6300
npm run server:dev                         # http://127.0.0.1:8787
```

Deployed (Render blueprint `render.yaml`):

```yaml
- type: web
  name: proofgate-api
  runtime: docker
  plan: free                       # 512 MB / 0.1 CPU — plenty, no proving here
  dockerfilePath: server/Dockerfile
  healthCheckPath: /api/health
  # dashboard secrets:
  #   PROOF_SERVER_URL=https://<your-tunnel>.trycloudflare.com
  #   PROOF_SERVER_AUTH_TOKEN=<token>          # must match the tunnel proxy
  #   MONGODB_URI, ADMIN_API_TOKEN, CORS_ORIGIN
  #   PROOF_SERVER_TIMEOUT_MS=1200000
```

Build the frontend with the Render API as the proof endpoint and deploy the
static build (e.g. Vercel):

```bash
cp frontend/.env.example frontend/.env.local
# edit frontend/.env.local:
#   VITE_PROOF_SERVER_URL=https://proofgate-api.onrender.com
#   VITE_API_URL=https://proofgate-api.onrender.com
npm --prefix frontend run build     # → frontend/dist (deploy to Vercel)
```

## Test the complete flow

With the proof server, tunnel and API all up:

```bash
# 1. API alive
curl -s https://proofgate-api.onrender.com/api/health                 # {ok:true, mongo:up}
# 2. proof server reachable through the tunnel
curl -s https://proofgate-api.onrender.com/api/proof-server/health    # {ok:true, proofServer:"up"}
# 3. relay round trip (octet-stream, mirrors the browser payload)
curl -s -X POST -H "content-type: application/octet-stream" \
  --data-binary @/dev/null \
  https://proofgate-api.onrender.com/prove   # 200/4xx/5xx echoed from the local proof server
# 4. full dApp: open the Vercel URL, connect the Lace wallet on Midnight Preview,
#    register a credential → the proof runs locally, render only streams bytes.
```

If the tunnel or proof server is down, `/api/proof-server/health` reports
`{ok:false, proofServer:"down"}` and `/prove` returns `502 Proof server
unreachable.` without crashing the API.

## Behavior notes

- **Single-flight proving:** `/prove` is serialised API-side (one proof at a
  time, FIFO queue). `/check` and all `/api/*` routes are not blocked.
- **Timeouts:** `PROOF_SERVER_TIMEOUT_MS` (default 20 min) caps a relayed
  `/prove`; the frontend uses the same default; Node's `requestTimeout` is
  disabled for long proofs. Do not lower these to 5 minutes.
- **Security:** the relay forwards only `content-type`/`content-length` plus the
  shared-secret `Authorization` header — proving payloads are never parsed or
  logged, so private credential/witness inputs never hit the logs.
- **Cost:** proving CPU/RAM now lives entirely on your machine; Render free tier
  only streams bytes and serves the analytics API (well under 512 MB / 0.1 CPU).

## Remaining limitations

- Render **free** instances spin down after ~15 minutes idle and cold-start on
  the first request (a few extra seconds). The first request also warms the
  tunnel. `starter`+ removes this.
- The frontend must be reachable cross-origin from the Render API — set
  `CORS_ORIGIN` to the exact frontend origin (e.g. `https://proofgate.vercel.app`).
- The tunnel URL changes every `cloudflared` restart; update Render's
  `PROOF_SERVER_URL` (or pin a named tunnel) when it does.
- Your laptop must stay online while a proof is running, and Docker must be
  running locally.
