// Global `Buffer` polyfill for the browser.
//
// Several Midnight.js runtime modules call `Buffer.from(...)` / `Buffer.concat(...)`
// using the bare global rather than an explicit import. Node exposes `Buffer`
// globally, but the browser does not — so the first bundle that touches one of
// those modules throws `buffer is not defined`. Expose the `buffer` package's
// implementation as a global before any wallet/contract code runs.

import { Buffer } from 'buffer';

const g = globalThis as Record<string, unknown>;
if (g.Buffer === undefined) {
  g.Buffer = Buffer;
}
