import { useMidnight } from '../../hooks/useMidnight';
import { useSessionStatus } from '../../store/session';
import { NETWORK } from '../../lib/env';
import { ROUTES, type RouteId } from '../../lib/navigation';
import { IconActivity, IconSettings } from '../icons';
import { Logo } from '../ui/Misc';
import { NetworkIndicator } from '../ui/Badge';
import { Tooltip } from '../ui/Tooltip';

const NETWORK_LABELS: Record<string, string> = {
  preview: 'Midnight Preview',
  preprod: 'Midnight Preprod',
  undeployed: 'Local (demo)',
};

export function Sidebar({
  route,
  navigate,
  onOpenActivity,
}: {
  route: RouteId;
  navigate: (route: string) => void;
  onOpenActivity: () => void;
}) {
  const { state } = useMidnight();
  const sessionStatus = useSessionStatus();
  const live = state.status === 'connected' && sessionStatus !== 'error';

  const workspace = ROUTES.filter((r) => r.group === 'workspace');
  const operate = ROUTES.filter((r) => r.group === 'operate');

  return (
    <aside className="pg-sidebar" aria-label="Primary">
      <a
        href="#/overview"
        className="pg-nav-link"
        aria-label="ProofGate home"
        onClick={(e) => {
          e.preventDefault();
          navigate('overview');
        }}
      >
        <Logo />
      </a>

      <nav className="pg-nav">
        <div className="pg-nav-group-label">Workspace</div>
        {workspace.map((item) => (
          <NavLink key={item.id} item={item} current={route} navigate={navigate} />
        ))}
        <div className="pg-nav-group-label">Operate</div>
        {operate.map((item) => (
          <NavLink key={item.id} item={item} current={route} navigate={navigate} />
        ))}
      </nav>

      <div className="stack-sm" style={{ gap: 10, borderTop: '1px solid var(--border-1)', paddingTop: 10 }}>
        <div className="row-between">
          <NetworkIndicator network={NETWORK_LABELS[NETWORK] ?? NETWORK} live={live} />
          <button className="btn-icon" onClick={onOpenActivity} aria-label="Transaction activity">
            <Tooltip label="Recent activity">
              <IconActivity size={16} />
            </Tooltip>
          </button>
          <button className="btn-icon" onClick={() => navigate('settings')} aria-label="Settings">
            <Tooltip label="Settings">
              <IconSettings size={16} />
            </Tooltip>
          </button>
        </div>
        <span className="micro" style={{ paddingLeft: 4 }}>
          Wallet {state.status === 'connected' ? 'connected' : 'not connected'}
        </span>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  current,
  navigate,
}: {
  item: { id: string; label: string; icon: (p: { size?: number }) => React.ReactNode };
  current: string;
  navigate: (route: string) => void;
}) {
  const Icon = item.icon;
  return (
    <a
      href={`#/${item.id}`}
      className="pg-nav-link"
      aria-current={current === item.id ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault();
        navigate(item.id);
      }}
    >
      <span className="nav-icon">
        <Icon size={16} />
      </span>
      {item.label}
    </a>
  );
}
