// Formatting helpers and product metadata. These render *public* identifiers
// only; private values are never passed through the formatters.

import { FEATURES, JURISDICTIONS } from './proofgate';

/** Truncate a hex/identifier string for display, preserving a short tail. */
export function truncateId(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Show a raw identifier in monospace, first 12 + last 6 unless short. */
export function shortId(value: string, head = 12): string {
  return truncateId(value, head, 6);
}

export function formatTimestamp(unixSeconds: bigint | number): string {
  const ms = Number(unixSeconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(unixSeconds: bigint | number): string {
  const ms = Number(unixSeconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Milliseconds until a unix-seconds deadline, clamped to >= 0. */
export function msUntil(unixSeconds: bigint | number): number {
  return Math.max(0, Number(unixSeconds) * 1000 - Date.now());
}

/** Human countdown "1d 02:03:04" from a duration in ms. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

export function formatDuration(seconds: bigint | number): string {
  const s = Number(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1).replace(/\.0$/, '')}h`;
  return `${(s / 86400).toFixed(1).replace(/\.0$/, '')}d`;
}

export function formatBalance(value: bigint | undefined): string {
  if (value === undefined) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export type FeatureId = (typeof FEATURES)[keyof typeof FEATURES];

export type FeatureMeta = {
  id: FeatureId;
  label: string;
  category: string;
  description: string;
  claims: { label: string; hint: string }[];
};

export const FEATURE_META: Record<FeatureId, FeatureMeta> = {
  [FEATURES.rwaPurchase]: {
    id: FEATURES.rwaPurchase,
    label: 'RWA Purchase',
    category: 'Real-world asset purchase',
    description: 'Purchase access to tokenized real-world assets held by a regulated service.',
    claims: [
      { label: 'Age', hint: '≥ minimum age set by the active policy' },
      { label: 'KYC', hint: 'KYC level at or above the policy requirement' },
      { label: 'Jurisdiction', hint: 'Member of an allowed jurisdiction' },
      { label: 'Credential', hint: 'Active, issuer-signed credential' },
    ],
  },
  [FEATURES.defiLend]: {
    id: FEATURES.defiLend,
    label: 'DeFi Lending',
    category: 'Compliance-gated lending',
    description: 'Open a lending position in a compliance-gated DeFi protocol.',
    claims: [
      { label: 'Age', hint: '≥ minimum age set by the active policy' },
      { label: 'KYC', hint: 'KYC level at or above the policy requirement' },
      { label: 'Jurisdiction', hint: 'Member of an allowed jurisdiction' },
      { label: 'Credential', hint: 'Active, issuer-signed credential' },
    ],
  },
};

/** Planned features shown with an explicit "coming in production" state. */
export const PLANNED_FEATURES: { label: string; description: string }[] = [
  {
    label: 'Age-Gated Access',
    description: 'Prove a minimum age without disclosing the exact value.',
  },
  {
    label: 'Verified employment / licensing',
    description: 'Additional issuer-signed claim types under future policies.',
  },
];

export const JURISDICTION_LABELS: Record<string, string> = {
  US: 'United States',
  EU: 'European Union',
  UK: 'United Kingdom',
};

export function jurisdictionLabel(code: string): string {
  return JURISDICTION_LABELS[code] ?? code;
}

export const JURISDICTIONS_PUBLIC = JURISDICTIONS;

/** Demo permit lifetime used by the in-app request flow (1 hour). */
export const DEMO_PERMIT_LIFETIME_S = 3600n;

/** Map a circuit name to a human label for the activity feed. */
export const CIRCUIT_LABELS: Record<string, string> = {
  deploy: 'Deploy contract',
  setPolicy: 'Set policy',
  registerIssuer: 'Register issuer',
  setIssuerStatus: 'Update issuer status',
  registerCredential: 'Register credential',
  revokeCredential: 'Revoke credential',
  unrevokeCredential: 'Un-revoke credential',
  setSubjectStatus: 'Update subject status',
  requestPermit: 'Request permit',
  consumePermit: 'Consume permit',
  revokePermit: 'Revoke permit',
  rotateAdmin: 'Rotate admin key',
};

export function circuitLabel(name: string): string {
  return CIRCUIT_LABELS[name] ?? name;
}
