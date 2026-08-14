// ProofGate analytics server configuration.
//
// All values are read from the environment with safe defaults so the server can
// boot locally without any configuration. Only non-sensitive network settings
// are exposed — the MongoDB URI stays strictly server-side.

import 'dotenv/config';

function env(name: string): string | undefined {
  return process.env[name]?.trim();
}

function int(name: string, fallback: number): number {
  const raw = env(name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export type AnalyticsConfig = {
  /**
   * MongoDB connection string. Empty means "run against an in-memory MongoDB
   * for local development" (data resets on restart). Must never be shared with
   * the browser.
   */
  mongoUri: string;
  /** Database name inside the MongoDB deployment. */
  mongoDatabase: string;
  /** HTTP port the analytics API listens on. */
  port: number;
  /** Bearer token guarding the admin wallet-export endpoint. */
  adminApiToken: string;
  /** Network counted against the Preprod user target (default: preprod). */
  preprodTargetNetwork: string;
  /** The announced Preprod onboarding target (default: 50 real users). */
  preprodTargetCount: number;
  /** Users still "active" if seen within this many days. */
  activeWindowDays: number;
  /** Allowed CORS origin for the browser client (default: any localhost dev). */
  corsOrigin: string;
  /**
   * Base URL of the Midnight proof-server sidecar that the /check and /prove
   * relay endpoints stream to (default: the same-container localhost:6300).
   */
  proofServerUrl: string;
  /** Rate-limit window (milliseconds) for event ingestion. */
  rateLimitWindowMs: number;
  /** Max events per window per IP. */
  rateLimitMax: number;
  /** In-memory TTL for the cached /api/metrics snapshot (ms). */
  metricsCacheTtlMs: number;
  /** Max events accepted per /api/events/batch request. */
  analyticsBatchMax: number;
};

export function loadConfig(): AnalyticsConfig {
  return {
    mongoUri: env('MONGODB_URI') ?? '',
    mongoDatabase: env('MONGODB_DATABASE') ?? 'proofgate',
    port: int('PORT', 8787),
    adminApiToken: env('ADMIN_API_TOKEN') ?? '',
    preprodTargetNetwork: env('PREPROD_TARGET_NETWORK') ?? 'preprod',
    preprodTargetCount: int('PREPROD_TARGET_COUNT', 50),
    activeWindowDays: int('ANALYTICS_ACTIVE_DAYS', 30),
    corsOrigin: env('CORS_ORIGIN') ?? '*',
    proofServerUrl: env('PROOF_SERVER_URL') ?? 'http://127.0.0.1:6300',
    rateLimitWindowMs: int('ANALYTICS_RATE_LIMIT_MS', 60_000),
    rateLimitMax: int('ANALYTICS_RATE_LIMIT_MAX', 120),
    metricsCacheTtlMs: int('ANALYTICS_METRICS_CACHE_TTL_MS', 15_000),
    analyticsBatchMax: int('ANALYTICS_BATCH_MAX', 50),
  };
}
