# ProofGate — single container: frontend + analytics API + Midnight proof server.
#
#   Stage 1  builds the frontend and installs server dependencies.
#   Stage 2  adds the official Midnight proof-server binary (a self-contained
#            nix/glibc closure under /nix) so one container runs:
#              - Express serving the SPA + /api and relaying /check & /prove
#              - midnight-proof-server on localhost:6300 (not exposed publicly)
#
# Deploy as a single Render Web Service (port 8787).

# ---- Stage 1: build ---------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package-lock.json frontend/
RUN npm ci
RUN npm --prefix frontend ci

COPY . .
RUN npm run frontend:build

# ---- Stage 2: runtime -------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app

# mongodb-memory-server (the no-MONGODB_URI fallback) needs libcurl for its
# downloaded mongod binary.
RUN apt-get update && apt-get install -y --no-install-recommends libcurl4 \
  && rm -rf /var/lib/apt/lists/*

# Midnight proof-server binary + its nix/glibc closure (self-contained; the
# version hash is pinned to the 8.1.0 image the rest of the stack uses).
COPY --from=midnightntwrk/proof-server:8.1.0 /nix /nix
RUN ln -s /nix/store/6naj0x3l5n0b4cx722xwasyp597p6z3h-ledger-8.1.0/bin/midnight-proof-server /usr/local/bin/midnight-proof-server

# App code, node_modules (includes tsx used by `npm run server:start`) and the
# built frontend (SPA + synced ZK artifacts under dist).
COPY --from=build /app /app

ENV NODE_ENV=production
EXPOSE 8787
