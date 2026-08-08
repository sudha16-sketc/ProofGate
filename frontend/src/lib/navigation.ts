// Shell navigation model for the ProofGate UI.
import type { JSX } from 'react';
import {
  IconGavel,
  IconIdCard,
  IconKey,
  IconLedger,
  IconSettings,
  IconShield,
  IconShieldCheck,
  IconZap,
} from '../components/icons';

export type RouteId =
  | 'overview'
  | 'credential'
  | 'prove'
  | 'permits'
  | 'ledger'
  | 'trust'
  | 'admin'
  | 'settings';

export type RouteItem = {
  id: RouteId;
  label: string;
  icon: (props: { size?: number }) => JSX.Element;
  group: 'workspace' | 'operate';
};

export const ROUTES: RouteItem[] = [
  { id: 'overview', label: 'Overview', icon: IconShield, group: 'workspace' },
  { id: 'credential', label: 'Credential', icon: IconIdCard, group: 'workspace' },
  { id: 'prove', label: 'Prove Eligibility', icon: IconZap, group: 'workspace' },
  { id: 'permits', label: 'Permit Center', icon: IconKey, group: 'workspace' },
  { id: 'ledger', label: 'Public Ledger', icon: IconLedger, group: 'workspace' },
  { id: 'trust', label: 'Security / Trust', icon: IconShieldCheck, group: 'workspace' },
  { id: 'admin', label: 'Admin', icon: IconGavel, group: 'operate' },
  { id: 'settings', label: 'Settings', icon: IconSettings, group: 'operate' },
];

export const ROUTE_TITLES: Record<RouteId, { title: string; lead: string }> = {
  overview: {
    title: 'Overview',
    lead: 'Privacy-preserving compliance on Midnight. Prove eligibility — not identity.',
  },
  credential: {
    title: 'Your Credential',
    lead: 'The issuer-signed credential held privately by your wallet.',
  },
  prove: {
    title: 'Prove Eligibility',
    lead: 'Choose what you need to prove. Your underlying identity stays private.',
  },
  permits: {
    title: 'Permit Center',
    lead: 'One-time authorizations produced by zero-knowledge proofs.',
  },
  ledger: {
    title: 'Public Ledger',
    lead: 'Everything shown here is public contract state.',
  },
  trust: {
    title: 'Security / Trust',
    lead: 'Who verifies what — and what ProofGate never knows.',
  },
  admin: {
    title: 'Admin',
    lead: 'Governance actions enforced by the ProofGate contract.',
  },
  settings: {
    title: 'Settings',
    lead: 'Network, technical details and environment configuration.',
  },
};

/** Routes reachable from the mobile bottom nav (the 5th slot opens "More"). */
export const BOTTOM_NAV: RouteId[] = ['overview', 'credential', 'prove', 'permits'];

/** Routes grouped into the "More" panel on mobile. */
export const MORE_ROUTES: RouteId[] = ['ledger', 'trust', 'admin', 'settings'];

export function isRoute(id: string): id is RouteId {
  return ROUTES.some((r) => r.id === id);
}

export function routeTitle(id: string): string {
  return (ROUTE_TITLES[id as RouteId] ?? ROUTE_TITLES.overview).title;
}
