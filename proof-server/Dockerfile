# ProofGate — standalone Midnight proof server for independent Render deployment.
#
# The upstream image already runs `midnight-proof-server --port $PORT`, so it
# picks up Render's injected PORT automatically and needs no entrypoint here.
# Verified behaviour of this image:
#   - GET /  -> 200 (usable as the Render health-check path)
#   - CORS preflight + POST responses carry Access-Control-Allow-Origin, so a
#     browser can POST /check and /prove cross-origin directly.
# On first boot it downloads the public SRS params + proving keys from
# https://srs.midnight.network and caches them on the instance disk (re-download
# after each cold start on Render's ephemeral disk).

FROM midnightntwrk/proof-server:8.1.0

EXPOSE 6300
