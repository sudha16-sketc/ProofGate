#!/usr/bin/env node
// Sync the compiled ProofGate ZK artifacts (proving/verifying keys + ZKIRs)
// from the repo root's `managed/proofgate/` into this app's `public/` so the
// browser can fetch them (FetchZkConfigProvider loads `<origin>/keys/<id>.prover`
// and `<origin>/zkir/<id>.bzkir`).
//
// Run automatically by `npm run dev` and `npm run build`.

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const managedRoot = resolve(appRoot, '..', 'managed', 'proofgate');

const keysDir = resolve(managedRoot, 'keys');
const zkirDir = resolve(managedRoot, 'zkir');
const publicKeysDir = resolve(appRoot, 'public', 'keys');
const publicZkirDir = resolve(appRoot, 'public', 'zkir');

if (!existsSync(keysDir) || !existsSync(zkirDir)) {
  console.error(
    '\n❌ Compiled ProofGate artifacts not found under managed/proofgate.\n' +
      '   Run `npm run compile` in the repo root first.\n',
  );
  process.exit(1);
}

mkdirSync(publicKeysDir, { recursive: true });
mkdirSync(publicZkirDir, { recursive: true });
cpSync(keysDir, publicKeysDir, { recursive: true });
cpSync(zkirDir, publicZkirDir, { recursive: true });

console.log('✓ ZK artifacts synced to public/keys and public/zkir');
