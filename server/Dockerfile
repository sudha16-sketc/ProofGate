# ProofGate — analytics/API server, deployed independently on Render.
#
#   /api            analytics endpoints (events, metrics, health, admin)
#   /check, /prove  optional relay to the separately-deployed proof server
#                   (set PROOF_SERVER_URL to its public URL)
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
