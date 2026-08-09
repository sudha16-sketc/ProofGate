// Frontend error classification.
//
// The UI must never silently swallow an error, and it must never print private
// witness values. Midnight/ledger exceptions carry protocol-level messages
// (not witness data), so mapping them to a short, actionable message is safe.
// Unknown errors keep their original message so nothing is hidden.

export type ErrorKind =
  | 'network-id'
  | 'wallet-not-connected'
  | 'contract-address-missing'
  | 'proof-generation'
  | 'balancing'
  | 'insufficient-tnight'
  | 'insufficient-tdust'
  | 'indexer'
  | 'deployment'
  | 'owner-only'
  | 'unknown';

const MSG: Record<ErrorKind, string> = {
  'network-id': 'Network ID is not configured. Reload the page or re-deploy; no Midnight operation runs before setNetworkId().',
  'wallet-not-connected': 'Wallet is not connected. Connect your Midnight wallet and try again.',
  'contract-address-missing': 'Contract address is missing. Deploy a contract or set VITE_CONTRACT_ADDRESS.',
  'proof-generation': 'Proof generation failed. Check that the ZK artifacts are served (keys/ and zkir/) and the wallet is unlocked.',
  balancing: 'Transaction balancing failed. Check tNIGHT / tDUST balances and the wallet connection.',
  'insufficient-tnight': 'Insufficient tNIGHT. Fund the wallet via the faucet and try again.',
  'insufficient-tdust': 'Insufficient tDUST. Generate tDUST in the wallet and try again.',
  indexer: 'Indexer unavailable. The read-only ledger view could not be queried.',
  deployment: 'Contract deployment failed.',
  'owner-only': 'This action is owner-only. The connected wallet is not the owner of the deployed contract — no transaction was submitted.',
  unknown: '',
};

const RULES: ReadonlyArray<{ kind: ErrorKind; pattern: RegExp }> = [
  {
    kind: 'network-id',
    pattern: /network\s*id\s*has\s*not\s*been\s*configured|setnetworkid|networkid.*configured/i,
  },
  { kind: 'wallet-not-connected', pattern: /wallet\s+is\s+not\s+connected|wallet\s+not\s+connected|no\s+wallet/i },
  { kind: 'contract-address-missing', pattern: /contract\s+address|address\s+is\s+missing/i },
  { kind: 'owner-only', pattern: /caller\s+is\s+not\s+the\s+owner|failed\s+assert:.*owner|not\s+the\s+owner/i },
  { kind: 'insufficient-tdust', pattern: /not\s+enough\s+dust|insufficient\s+dust|dust\s+shortage/i },
  { kind: 'insufficient-tnight', pattern: /not\s+enough\s+night|insufficient\s+night|insufficient\s+funds|insufficient\s+tnight/i },
  { kind: 'proof-generation', pattern: /proof\s+generat|proving\s+failed|failed\s+to\s+prove|proof\s+server/i },
  { kind: 'balancing', pattern: /balanc|overspend|unbound|fee/i },
  { kind: 'indexer', pattern: /indexer|graphql|subscription|network.*error/i },
  { kind: 'deployment', pattern: /deploy/i },
];

export function classifyError(err: unknown): { kind: ErrorKind; message: string; detail: string } {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const detail = raw.trim();
  for (const rule of RULES) {
    if (rule.pattern.test(detail)) {
      return { kind: rule.kind, message: MSG[rule.kind], detail };
    }
  }
  return { kind: 'unknown', message: detail || 'An unknown error occurred.', detail };
}

/**
 * Build a user-facing error string for a thrown error. Known failure modes are
 * mapped to a short actionable message; unknown errors surface their raw text
 * so nothing is silently swallowed.
 */
export function friendlyError(err: unknown): string {
  const { kind, message, detail } = classifyError(err);
  if (kind === 'unknown') return message;
  return detail && detail !== message ? `${message} (${detail})` : message;
}
