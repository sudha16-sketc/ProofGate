# ProofGate — analytics/API server + proof relay, deployed independently on
# Render's FREE plan. It NEVER performs ZK proving:
#
#   /api            analytics endpoints (events, metrics, health, admin)
#   /check, /prove  relay that streams proving payloads to PROOF_SERVER_URL
#                   (the secure HTTPS tunnel to the LOCAL proof server)
#
# No SRS parameters and no proving keys are bundled or downloaded here; the
# relay is a pure byte-forwarding hop. See docs/PROVING_ARCHITECTURE.md.
#
# The frontend is NOT built here: it is deployed as its own static site and
# pointed at this service via VITE_API_URL / VITE_PROOF_SERVER_URL in
# frontend/.env.local.

FROM node:22-slim AS runtime
WORKDIR /app

# mongodb-memory-server (the no-MONGODB_URI dev fallback) needs libcurl for its
# downloaded mongod binary.
RUN apt-get update && apt-get install -y --no-install-recommends libcurl4 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY server/ server/

ENV NODE_ENV=production
EXPOSE 8787

# tsx (a devDependency installed by `npm ci`) runs the server entrypoint.
CMD ["npm", "run", "server:start"]
