/**
 * ProofGate — analytics store & metrics API tests.
 *
 * Runs against the real Express app backed by an in-memory MongoDB
 * (mongodb-memory-server), so the whole ingestion → aggregation → API path is
 * exercised headlessly without Docker or Atlas. Covers exactly-once
 * idempotency, user aggregation, Preprod-target counting, sensitive-field
 * stripping, and the admin-only wallet export.
 *
 * If the mongod binary cannot be provisioned (e.g. offline), the suite skips
 * rather than failing the build.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createApp, ensureAnalyticsIndexes } from '../server/app';
import { connectAnalyticsDb, type AnalyticsDb } from '../server/db/mongodb';
import { loadConfig } from '../server/config';
import { OPERATION_TYPES, type MetricsSnapshot } from '../server/models/types';

const WALLET_PREPROD_A = '0x1111'.padEnd(56, 'a');
const WALLET_PREPROD_B = '0x2222'.padEnd(56, 'b');
const WALLET_PREVIEW_A = '0x3333'.padEnd(56, 'c');

let suite: { db: AnalyticsDb; baseUrl: string; server: Server } | null = null;

try {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  const config = {
    ...loadConfig(),
    mongoUri: uri,
    adminApiToken: 'test-admin-token',
    preprodTargetNetwork: 'preprod',
    preprodTargetCount: 50,
  };
  const db = await connectAnalyticsDb(config);
  await ensureAnalyticsIndexes(db.db);
  const app = createApp({ db: db.db, config });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  suite = {
    db,
    server,
    baseUrl,
  };
} catch (err) {
  console.warn('[analytics] mongodb-memory-server unavailable — skipping analytics suite:', err);
}

afterAll(async () => {
  await suite?.server.close();
  await suite?.db.close();
});

const describeSuite = suite ? describe : describe.skip;

async function postEvent(baseUrl: string, body: Record<string, unknown>): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${baseUrl}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function getMetrics(baseUrl: string): Promise<MetricsSnapshot> {
  const res = await fetch(`${baseUrl}/api/metrics`);
  return (await res.json()) as MetricsSnapshot;
}

describeSuite('analytics store & API', () => {
  const baseUrl = suite!.baseUrl;

  it('reports health with the Mongo backend up', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.mongo).toBe('up');
  });

  it('rejects events with an unknown operationType', async () => {
    const res = await postEvent(baseUrl, { idempotencyKey: 'k-bad-type', operationType: 'mined_bitcoin' });
    expect(res.status).toBe(400);
  });

  it('rejects events without an idempotencyKey', async () => {
    const res = await postEvent(baseUrl, { operationType: 'wallet_connected' });
    expect(res.status).toBe(400);
  });

  it('rejects events without an operationType', async () => {
    const res = await postEvent(baseUrl, { idempotencyKey: 'k-no-op' });
    expect(res.status).toBe(400);
  });

  it('records a wallet_connected event', async () => {
    const res = await postEvent(baseUrl, {
      idempotencyKey: 'k-connect-1',
      operationType: 'wallet_connected',
      walletAddress: WALLET_PREVIEW_A,
      network: 'preview',
    });
    expect(res.status).toBe(201);
  });

  it('strips unknown/sensitive fields before storing', async () => {
    await postEvent(baseUrl, {
      idempotencyKey: 'k-secret-1',
      operationType: 'wallet_connected',
      walletAddress: WALLET_PREVIEW_A,
      network: 'preview',
      secret: 'subject-secret-key-42',
      age: 41,
      jurisdiction: 'US',
    });
    const doc = await suite!.db.db.collection('operations').findOne({ idempotencyKey: 'k-secret-1' });
    expect(doc).not.toBeNull();
    expect(doc?.secret).toBeUndefined();
    expect(doc?.age).toBeUndefined();
    expect(doc?.jurisdiction).toBeUndefined();
  });

  it('aggregates a full proof/permit journey into the metrics snapshot', async () => {
    await postEvent(baseUrl, {
      idempotencyKey: 'k-journey-cred',
      operationType: 'credential_registered',
      walletAddress: WALLET_PREVIEW_A,
      network: 'preview',
      txHash: 'tx-cred',
    });
    await postEvent(baseUrl, { idempotencyKey: 'k-journey-permit', operationType: 'permit_created', walletAddress: WALLET_PREVIEW_A, network: 'preview' });
    await postEvent(baseUrl, { idempotencyKey: 'k-journey-consume', operationType: 'permit_consumed', walletAddress: WALLET_PREVIEW_A, network: 'preview' });
    await postEvent(baseUrl, { idempotencyKey: 'k-journey-action', operationType: 'protected_action', walletAddress: WALLET_PREVIEW_A, network: 'preview' });

    const m = await getMetrics(baseUrl);
    expect(m.operations.total).toBeGreaterThanOrEqual(5);
    expect(m.proofs.generated).toBe(0);
    expect(m.permits.created).toBe(1);
    expect(m.permits.consumed).toBe(1);
    expect(m.protectedActions).toBe(1);
    expect(m.users.total).toBe(1);
    expect(m.users.completedFlow).toBe(1);
  });

  it('records failed operations with an errorCode and counts them', async () => {
    await postEvent(baseUrl, {
      idempotencyKey: 'k-fail-1',
      operationType: 'operation_failed',
      status: 'failed',
      walletAddress: WALLET_PREVIEW_A,
      network: 'preview',
      errorCode: 'insufficient-tnight',
    });
    const m = await getMetrics(baseUrl);
    expect(m.operations.failed).toBeGreaterThanOrEqual(1);
    expect(m.successRate).toBeGreaterThan(0);
  });

  it('rejects a username without a walletAddress', async () => {
    const res = await fetch(`${baseUrl}/api/users/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'alice' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an empty or whitespace-only username', async () => {
    for (const username of ['', '   ', ' \t ']) {
      const res = await fetch(`${baseUrl}/api/users/username`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ walletAddress: WALLET_PREPROD_A, username }),
      });
      expect(res.status).toBe(400);
    }
  });

  it('rejects usernames that are too long or use invalid characters', async () => {
    const tooLong = 'a'.repeat(33);
    const res = await fetch(`${baseUrl}/api/users/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ walletAddress: WALLET_PREPROD_A, username: tooLong }),
    });
    expect(res.status).toBe(400);

    const invalid = await fetch(`${baseUrl}/api/users/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ walletAddress: WALLET_PREPROD_A, username: 'alice<bob>' }),
    });
    expect(invalid.status).toBe(400);
  });

  it('maps a username to a wallet address and trims surrounding whitespace', async () => {
    const res = await fetch(`${baseUrl}/api/users/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ walletAddress: WALLET_PREPROD_A, username: '  alice_demo  ', network: 'preprod' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { accepted: boolean; username: string };
    expect(body.accepted).toBe(true);
    expect(body.username).toBe('alice_demo');

    const user = await suite!.db.db.collection('users').findOne({ walletAddress: WALLET_PREPROD_A });
    expect(user?.username).toBe('alice_demo');
    expect(user?.usernameSetAt).toBeInstanceOf(Date);
  });

  it('overwrites an existing username for the same wallet', async () => {
    await fetch(`${baseUrl}/api/users/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ walletAddress: WALLET_PREPROD_B, username: 'first_name', network: 'preprod' }),
    });
    const res = await fetch(`${baseUrl}/api/users/username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ walletAddress: WALLET_PREPROD_B, username: 'second_name', network: 'preprod' }),
    });
    expect(res.status).toBe(201);
    const user = await suite!.db.db.collection('users').findOne({ walletAddress: WALLET_PREPROD_B });
    expect(user?.username).toBe('second_name');
  });

  it('includes usernames in the admin wallet export', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { authorization: 'Bearer test-admin-token' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: Array<Record<string, unknown>> };
    const preprodUser = body.users.find((u) => u.walletAddress === WALLET_PREPROD_A);
    expect(preprodUser?.username).toBe('alice_demo');
  });

  it('does not double-count a duplicate event (idempotency)', async () => {
    await postEvent(baseUrl, { idempotencyKey: 'k-dup-1', operationType: 'proof_verified', walletAddress: WALLET_PREVIEW_A, network: 'preview' });
    const before = (await getMetrics(baseUrl)).proofs.verified;
    const dup = await postEvent(baseUrl, { idempotencyKey: 'k-dup-1', operationType: 'proof_verified', walletAddress: WALLET_PREVIEW_A, network: 'preview' });
    const after = (await getMetrics(baseUrl)).proofs.verified;
    expect(dup.status).toBe(201);
    expect(dup.json).toMatchObject({ accepted: true, outcome: 'duplicate' });
    expect(after).toBe(before);
  });

  it('does not double-count users for a repeated wallet', async () => {
    await postEvent(baseUrl, { idempotencyKey: 'k-again-1', operationType: 'wallet_connected', walletAddress: WALLET_PREVIEW_A, network: 'preview' });
    const m = await getMetrics(baseUrl);
    expect(m.users.total).toBe(1);
  });

  it('counts Preprod users against the announced target', async () => {
    await postEvent(baseUrl, { idempotencyKey: 'k-preprod-1', operationType: 'wallet_connected', walletAddress: WALLET_PREPROD_A, network: 'preprod' });
    await postEvent(baseUrl, { idempotencyKey: 'k-preprod-2', operationType: 'credential_registered', walletAddress: WALLET_PREPROD_A, network: 'preprod' });
    await postEvent(baseUrl, { idempotencyKey: 'k-preprod-3', operationType: 'wallet_connected', walletAddress: WALLET_PREPROD_B, network: 'preprod' });

    const m = await getMetrics(baseUrl);
    expect(m.preprodTarget).toBe(50);
    expect(m.preprodUsers).toBe(2);
    expect(m.network).toBe('all');
  });

  it('filters operational metrics by network when requested', async () => {
    const res = await fetch(`${baseUrl}/api/metrics?network=preview`);
    const m = (await res.json()) as MetricsSnapshot;
    expect(m.network).toBe('preview');
    expect(m.operations.total).toBeLessThan((await getMetrics(baseUrl)).operations.total);
    expect(m.preprodUsers).toBe(2);
  });

  it('computes successRate as a percentage', async () => {
    const m = await getMetrics(baseUrl);
    const { total, successful, failed } = m.operations;
    expect(total).toBe(successful + failed);
    expect(m.successRate).toBeGreaterThanOrEqual(0);
    expect(m.successRate).toBeLessThanOrEqual(100);
    expect(m.successRate).toBe(total > 0 ? Math.round((successful / total) * 1000) / 10 : 0);
  });

  it('exposes every expected operationType enum value', () => {
    expect(OPERATION_TYPES).toEqual([
      'wallet_connected',
      'credential_registered',
      'proof_generated',
      'proof_verified',
      'eligibility_verified',
      'permit_created',
      'protected_action',
      'permit_consumed',
      'operation_failed',
    ]);
  });

  it('blocks the admin wallet export without a bearer token', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users`);
    expect(res.status).toBe(401);
  });

  it('serves the admin wallet export with the bearer token', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { authorization: 'Bearer test-admin-token' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { count: number; users: Array<Record<string, unknown>> };
    expect(body.count).toBeGreaterThanOrEqual(2);
    const addresses = body.users.map((u) => u.walletAddress);
    expect(addresses).toContain(WALLET_PREPROD_A);
    expect(addresses).toContain(WALLET_PREVIEW_A);
    const preprodUser = body.users.find((u) => u.walletAddress === WALLET_PREPROD_A);
    expect(preprodUser?.network).toBe('preprod');
    expect(preprodUser?.totalOperations).toBeGreaterThanOrEqual(2);
  });
});
