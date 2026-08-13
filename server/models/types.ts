// Shared analytics domain types.
//
// PRIVACY: the analytics store records only that an operation happened, never
// the private inputs used to perform it (no proofs, credentials, ages,
// jurisdictions, or signature material). The only per-user identifier is the
// public unshielded wallet address.

export const OPERATION_TYPES = [
  'wallet_connected',
  'credential_registered',
  'proof_generated',
  'proof_verified',
  'eligibility_verified',
  'permit_created',
  'protected_action',
  'permit_consumed',
  'operation_failed',
] as const;

export type OperationType = (typeof OPERATION_TYPES)[number];

export const OPERATION_STATUSES = ['success', 'failed'] as const;

export type OperationStatus = (typeof OPERATION_STATUSES)[number];

/** An event the client reports after a real user-facing action on-chain. */
export type AnalyticsEvent = {
  /** Client-generated attempt id shared by every event of one logical action. */
  idempotencyKey: string;
  operationType: OperationType;
  status?: OperationStatus;
  /** Public unshielded wallet address; null for pre-wallet failures. */
  walletAddress?: string | null;
  /** On-chain transaction id, when one was produced. */
  txHash?: string | null;
  /** Wall-clock time the operation took, in milliseconds. */
  durationMs?: number | null;
  /** Safe error code (from classifyError) for failed operations. */
  errorCode?: string | null;
  /** Network the wallet was on when the event happened. */
  network?: string;
};

/** Per-user aggregated counters (denormalized for the admin export). */
export type UserCounters = {
  totalOperations: number;
  successful: number;
  failed: number;
};

/** Shape returned by GET /api/metrics. */
export type MetricsSnapshot = {
  users: {
    total: number;
    active: number;
    completedFlow: number;
  };
  operations: {
    total: number;
    successful: number;
    failed: number;
  };
  proofs: {
    generated: number;
    verified: number;
  };
  permits: {
    created: number;
    consumed: number;
  };
  protectedActions: number;
  successRate: number;
  preprodUsers: number;
  preprodTarget: number;
  network: string;
};

/** A row from the admin-only wallet export. */
export type WalletRow = {
  walletAddress: string;
  firstSeenAt: string;
  lastSeenAt: string;
  network: string;
  totalOperations: number;
  successful: number;
  failed: number;
  completedFlow: boolean;
};
