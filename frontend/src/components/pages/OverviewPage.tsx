import { useMidnight } from '../../hooks/useMidnight';
import { OverviewView } from '../features/OverviewView';
import { ConnectView } from '../features/ConnectView';

export function OverviewPage({ navigate }: { navigate: (route: string) => void }) {
  const { state } = useMidnight();
  const connected = state.status === 'connected';

  // Before the wallet connects, show the landing hero + connect CTA.
  if (!connected) {
    return <ConnectView navigate={navigate} />;
  }

  // Show the read-only overview even while the session boots.
  return <OverviewView navigate={navigate} />;
}
