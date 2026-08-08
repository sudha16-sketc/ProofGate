/**
 * STEP 2 — headless Schnorr-over-Jubjub verification test.
 *
 * Proves that the Compact circuit `contracts/schnorr-proto.compact` can verify
 * an actual Schnorr signature issued by a real issuer keypair, using ONLY the
 * on-chain embedded curve (Jubjub) primitives — with the full 255-bit point
 * coordinates reconstructed from witness bytes via `as Field` and the
 * challenge scalar derived via `degradeToTransient` (always a valid
 * embedded-field scalar, no modular-reduction ambiguity).
 *
 * Encoding contract (must match the circuit exactly):
 *   - point coordinates / s  -> 32-byte LITTLE-ENDIAN field elements
 *     (`as Field` compiles to convertBytesToField = LE_int, range-checked < p)
 *   - challenge -> persistentHash over [Px, Py, Rx, Ry, domain, msg]
 *   - e = degradeToTransient(challenge)  (LE mod 2^248, always < curve order)
 *   - s = (k + e*sk) mod r, r = Jubjub scalar-field order
 *   - verify: s*G == R + e*P
 */
import { describe, expect, it } from 'vitest';

import {
  CompactTypeBytes,
  CompactTypeVector,
  createCircuitContext,
  degradeToTransient,
  dummyContractAddress,
  ecMulGenerator,
  emptyZswapLocalState,
  jubjubPointX,
  jubjubPointY,
  persistentHash,
} from '@midnight-ntwrk/compact-runtime';

import { Contract } from '../managed/schnorr-proto/contract/index.js';

/** Jubjub scalar-field order (252-bit prime). */
const CURVE_ORDER = 0x0e7db4ea6533afa906673b0101343b00a6682093ccc81082d0970e5ed6f72cb7n;
const DOMAIN_BYTES = new Uint8Array(32);
DOMAIN_BYTES.set(msg32('pg:schnorr:'), 0);

/** 32-byte little-endian encoding of a non-negative integer < 2^256. */
function le32(x: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/** Right-pad UTF-8 text to 32 bytes (matching the Bytes<32> witness type). */
function msg32(text: string): Uint8Array {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(text), 0);
  return out;
}

/** Uniform scalar in [0, CURVE_ORDER). */
function randScalar(): bigint {
  const buf = new Uint8Array(40);
  crypto.getRandomValues(buf);
  let x = 0n;
  for (const b of buf) x = (x << 8n) | BigInt(b);
  return x % CURVE_ORDER;
}

type SchnorrSig = { rx: Uint8Array; ry: Uint8Array; s: Uint8Array };

function challengeBytes(pubX: Uint8Array, pubY: Uint8Array, rx: Uint8Array, ry: Uint8Array, message: Uint8Array) {
  return persistentHash(new CompactTypeVector(6, new CompactTypeBytes(32)), [
    pubX,
    pubY,
    rx,
    ry,
    DOMAIN_BYTES,
    message,
  ]);
}

function sign(message: Uint8Array, pubX: Uint8Array, pubY: Uint8Array, sk: bigint, k: bigint): SchnorrSig {
  const R = ecMulGenerator(k);
  const rx = le32(jubjubPointX(R));
  const ry = le32(jubjubPointY(R));
  const e = degradeToTransient(challengeBytes(pubX, pubY, rx, ry, message));
  const s = (k + e * sk) % CURVE_ORDER;
  return { rx, ry, s: le32(s) };
}

function runVerify(
  pubX: Uint8Array,
  pubY: Uint8Array,
  sig: SchnorrSig,
  message: Uint8Array,
): { success: boolean; error?: string } {
  const witnesses = {
    rx: () => [undefined, sig.rx] as [undefined, Uint8Array],
    ry: () => [undefined, sig.ry] as [undefined, Uint8Array],
    s: () => [undefined, sig.s] as [undefined, Uint8Array],
    msg: () => [undefined, message] as [undefined, Uint8Array],
  };
  const contract = new Contract(witnesses);
  const zswap = emptyZswapLocalState({ bytes: new Uint8Array(32).fill(0x01) });
  const init = contract.initialState(
    { initialPrivateState: undefined, initialZswapLocalState: zswap },
    pubX,
    pubY,
  );
  const context = createCircuitContext(
    dummyContractAddress(),
    zswap.coinPublicKey,
    init.currentContractState.data,
    init.currentPrivateState,
    undefined,
    undefined,
    Math.floor(Date.now() / 1000),
  );
  try {
    contract.circuits.verify(context);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

describe('Schnorr-over-Jubjub headless verification (STEP 2)', () => {
  it('accepts a valid signature (full 255-bit coordinates)', () => {
    const sk = randScalar();
    const P = ecMulGenerator(sk);
    const pubX = le32(jubjubPointX(P));
    const pubY = le32(jubjubPointY(P));
    const message = msg32('credential:subject:123');
    const sig = sign(message, pubX, pubY, sk, randScalar());
    expect(runVerify(pubX, pubY, sig, message).success).toBe(true);
  });

  it('verifies with point coordinates >= 2^248 (degradeToTransient break case)', () => {
    let x = 1n;
    let pt = ecMulGenerator(x);
    while (jubjubPointX(pt) < 2n ** 248n && x < 1000n) {
      x += 1n;
      pt = ecMulGenerator(x);
    }
    expect(jubjubPointX(pt)).toBeGreaterThanOrEqual(2n ** 248n);
    const sk = randScalar();
    const P = ecMulGenerator(sk);
    const pubX = le32(jubjubPointX(P));
    const pubY = le32(jubjubPointY(P));
    const message = msg32('large-coordinate-test');
    const sig = sign(message, pubX, pubY, sk, x);
    expect(runVerify(pubX, pubY, sig, message).success).toBe(true);
  });

  it('rejects a tampered message', () => {
    const sk = randScalar();
    const P = ecMulGenerator(sk);
    const pubX = le32(jubjubPointX(P));
    const pubY = le32(jubjubPointY(P));
    const sig = sign(msg32('honest message'), pubX, pubY, sk, randScalar());
    const result = runVerify(pubX, pubY, sig, msg32('tampered message'));
    expect(result.success).toBe(false);
    expect(result.error ?? '').toMatch(/mismatch|assert/i);
  });

  it('rejects a tampered signature scalar s', () => {
    const sk = randScalar();
    const P = ecMulGenerator(sk);
    const pubX = le32(jubjubPointX(P));
    const pubY = le32(jubjubPointY(P));
    const message = msg32('message');
    const sig = sign(message, pubX, pubY, sk, randScalar());
    const tampered = { ...sig, s: le32((BigInt('0x' + Buffer.from(sig.s).toString('hex')) + 1n) % CURVE_ORDER) };
    const result = runVerify(pubX, pubY, tampered, message);
    expect(result.success).toBe(false);
    expect(result.error ?? '').toMatch(/mismatch|assert/i);
  });

  it('rejects a signature from a different (wrong) issuer key', () => {
    const sk = randScalar();
    const wrongSk = randScalar();
    const P = ecMulGenerator(sk);
    const pubX = le32(jubjubPointX(P));
    const pubY = le32(jubjubPointY(P));
    const message = msg32('message');
    const sig = sign(message, pubX, pubY, wrongSk, randScalar());
    const result = runVerify(pubX, pubY, sig, message);
    expect(result.success).toBe(false);
    expect(result.error ?? '').toMatch(/mismatch|assert/i);
  });

  it('challenge scalar e is reproducible and a valid embedded-field scalar', () => {
    const sk = randScalar();
    const P = ecMulGenerator(sk);
    const pubX = le32(jubjubPointX(P));
    const pubY = le32(jubjubPointY(P));
    const message = msg32('deterministic');
    const sig = sign(message, pubX, pubY, sk, randScalar());
    const e = degradeToTransient(challengeBytes(pubX, pubY, sig.rx, sig.ry, message));
    expect(e).toBeGreaterThanOrEqual(0n);
    expect(e).toBeLessThan(2n ** 248n);
    expect(e).toBeLessThan(CURVE_ORDER);
  });
});
