import { useCallback, useEffect, useRef, useState } from 'react';
import { useMidnight, getConnectedApi } from '../../hooks/useMidnight';
import { useSessionMeta } from '../../store/session';
import { Button } from './Button';
import { Badge, StatusBadge } from './Badge';
import { IconWallet } from '../icons';
import { NETWORK } from '../../lib/env';
import { shortId } from '../../lib/formats';

type Balances = {
  shielded: { tokenType: string; amount: bigint }[];
  dust: { balance: bigint; cap: bigint };
};

async function fetchBalances(): Promise<Balances> {
  const api = getConnectedApi();
  if (!api) throw new Error('Not connected');
  const shieldedRaw = await api.getShieldedBalances();
  const dust = await api.getDustBalance();
  const shielded = Object.entries(shieldedRaw).map(([tokenType, amount]) => ({ tokenType, amount }));
  return { shielded, dust };
}

export function WalletButton() {
  const { state, disconnect } = useMidnight();
  const meta = useSessionMeta();
  const [open, setOpen] = useState(false);
  const [balances, setBalances] = useState<Balances | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const connected = state.status === 'connected';

  const refresh = useCallback(async () => {
    try {
      setBalances(await fetchBalances());
    } catch {
      setBalances(null);
    }
  }, []);

  useEffect(() => {
    if (open && connected) void refresh();
  }, [open, connected, refresh]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (open && anchorRef.current && !anchorRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (state.status === 'connecting') {
    return (
      <span className="badge badge-dim">
        <span className="spinner" aria-hidden="true" />
        Connecting…
      </span>
    );
  }

  if (!connected) {
    return null;
  }

  const credentialTone = meta?.mySubject?.status === 1 ? 'ok' : 'warn';
  const credentialLabel = meta?.mySubject?.status === 1 ? 'Credential active' : 'No credential';

  return (
    <div className="popover-anchor" ref={anchorRef}>
      <button
        type="button"
        className="wallet-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          void refresh();
        }}
      >
        <span className="wallet-avatar" aria-hidden="true">
          {shortId(state.address, 4).slice(0, 4).toUpperCase()}
        </span>
        <span className="mono" style={{ fontSize: '0.78rem' }}>
          {shortId(state.address, 10)}
        </span>
        <IconWallet size={15} />
      </button>

      {open && (
        <div className="popover" role="dialog" aria-label="Wallet details">
          <div className="popover-body">
            <div className="row-between">
              <Badge tone="accent" dot>
                {NETWORK}
              </Badge>
              <StatusBadge tone={credentialTone}>{credentialLabel}</StatusBadge>
            </div>

            <div className="mini-stat">
              <span className="k">Wallet</span>
              <span className="v truncate" title={state.address}>
                {shortId(state.address, 14)}
              </span>
            </div>

            <div className="divider" />

            <span className="micro">Balances</span>
            {balances?.dust && (
              <div className="mini-stat">
                <span className="k">tDUST</span>
                <span className="v">
                  {balances.dust.balance.toLocaleString()}
                  <span className="faint"> / cap {balances.dust.cap.toLocaleString()}</span>
                </span>
              </div>
            )}
            {balances?.shielded.length === 1 && (
              <div className="mini-stat">
                <span className="k">tNIGHT (native)</span>
                <span className="v">{balances.shielded[0]!.amount.toLocaleString()}</span>
              </div>
            )}
            {balances &&
              balances.shielded.length > 1 &&
              balances.shielded.map((b) => (
                <div className="mini-stat" key={b.tokenType}>
                  <span className="k mono">0x{b.tokenType.slice(0, 8)}…</span>
                  <span className="v">{b.amount.toLocaleString()}</span>
                </div>
              ))}
            {!balances && <p className="caption">Balances unavailable.</p>}
          </div>
          <div className="popover-foot">
            <span className="caption">Session-only credentials. No identity data leaves this device.</span>
            <Button variant="ghost" size="sm" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
