import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  // The compiled contract + ZK artifacts live in ../managed (repo root), outside
  // the Vite project root. Allow the dev server to serve them, and force a single
  // copy of the shared Midnight runtime so the browser graph sees one instance.
  server: {
    fs: {
      allow: ['..'],
    },
    // Forward analytics API calls to the local server during development, so
    // the browser only ever talks to one origin. Production Express serves the
    // built frontend and the /api routes from the same process.
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      // The app proves through the same origin; in dev the Vite server relays
      // proving payloads to the local `docker compose` proof-server.
      '/check': 'http://127.0.0.1:6300',
      '/prove': 'http://127.0.0.1:6300',
    },
  },
  resolve: {
    dedupe: [
      '@midnight-ntwrk/compact-js',
      '@midnight-ntwrk/compact-runtime',
      '@midnight-ntwrk/midnight-js-protocol',
      '@midnight-ntwrk/midnight-js-types',
      '@midnight-ntwrk/midnight-js-utils',
      // compact-runtime resolves ^3.0.0 (→ 3.1.0) while midnight-js-protocol
      // pins 3.0.0 exactly, so npm installs two copies. Each copy owns a
      // separate StateValue class, and cross-copy instances fail the WASM
      // `instanceof` check with "expected instance of _StateValue". Collapse to
      // a single instance so contract execution shares one runtime.
      '@midnight-ntwrk/onchain-runtime-v3',
    ],
    // Node-only modules pulled in by the Midnight indexer client must be
    // replaced with browser equivalents for the web bundle.
    alias: {
      assert: fileURLToPath(new URL('./src/lib/polyfills/assert.ts', import.meta.url)),
      'isomorphic-ws': fileURLToPath(new URL('./src/lib/polyfills/isomorphic-ws.ts', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
  },
})
