import { useMidnight } from '../../hooks/useMidnight';
import { useSessionStatus } from '../../store/session';
import { NETWORK } from '../../lib/env';
import { IconActivity } from '../icons';
import { Logo } from '../ui/Misc';
import { Badge } from '../ui/Badge';
import { WalletButton } from '../ui/WalletButton';

const NETWORK_LABELS: Record<string, string> = {
  preview: 'Midnight Preview',
  preprod: 'Midnight Preprod',
  undeployed: 'Local (demo)',
};

export function TopBar({ onOpenActivity }: { onOpenActivity: () => void }) {
  const { state } = useMidnight();
  const sessionStatus = useSessionStatus();

  return (
    <header className="pg-topbar">
      <a href="#/overview" className="topbar-logo" aria-label="ProofGate home">
        <Logo />
      </a>

      <div className="grow" />

      {state.status === 'connected' && (
        <>
          <Badge tone="accent" dot={sessionStatus === 'ready'}>
            {NETWORK_LABELS[NETWORK] ?? NETWORK}
          </Badge>
          <Badge tone="warn">DEMO MODE</Badge>
          <button className="btn-icon" onClick={onOpenActivity} aria-label="Transaction activity">
            <IconActivity size={16} />
          </button>
        </>
      )}

      <WalletButton />
    </header>
  );
}
