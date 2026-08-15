# ProofGate — LOCAL Midnight proof server (runs on the developer machine, NOT on
# Render). Kept here so the exact image used by Render in earlier deployments is
# preserved, and so `docker compose up -d --wait proof-server` reproduces it.
#
# The upstream image already runs `midnight-proof-server --port $PORT`.
# Verified behaviour of this image:
#   - GET /  -> 200 (usable as the health-check path)
#   - CORS preflight + POST responses carry Access-Control-Allow-Origin, so a
#     browser can POST /check and /prove cross-origin directly.
# On first boot it downloads the public SRS params + proving keys from
# https://srs.midnight.network and caches them under
# /.cache/midnight/zk-params (mounted as the `proofgate-zk-params` Docker
# volume in compose.yml so restarts do not re-download them).
#
# Do NOT expose :6300 to the internet. Reach this server through the
# authenticating tunnel proxy (proof-server/tunnel-proxy.mjs) when the deployed
# Render API needs to prove against it.

FROM midnightntwrk/proof-server:8.1.0

EXPOSE 6300
