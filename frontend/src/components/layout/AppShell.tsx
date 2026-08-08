import type { ReactNode } from 'react';
import type { RouteId } from '../../lib/navigation';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { DemoBanner } from './DemoBanner';
import { ActivityDrawer } from './ActivityDrawer';
import { SessionNotice } from '../features/SessionNotice';

export function AppShell({
  route,
  navigate,
  activityOpen,
  onActivityOpen,
  onActivityClose,
  children,
}: {
  route: RouteId;
  navigate: (route: string) => void;
  activityOpen: boolean;
  onActivityOpen: () => void;
  onActivityClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="pg-app">
      <a className="pg-skip-link" href="#pg-main">
        Skip to content
      </a>
      <Sidebar route={route} navigate={navigate} onOpenActivity={onActivityOpen} />
      <div className="pg-main">
        <TopBar onOpenActivity={onActivityOpen} />
        <DemoBanner />
        <main id="pg-main" className="pg-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <BottomNav route={route} navigate={navigate} />
      <SessionNotice />
      <ActivityDrawer open={activityOpen} onClose={onActivityClose} />
    </div>
  );
}
