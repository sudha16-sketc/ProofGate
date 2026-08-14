import { useEffect, useState } from 'react';
import './index.css';

import { useHashRoute } from './hooks/useHashRoute';
import { useMidnight } from './hooks/useMidnight';
import { bootSession, resetSession, useSessionStatus } from './store/session';
import { useUsername } from './store/username';
import { isRoute } from './lib/navigation';

import { AppShell } from './components/layout/AppShell';
import { ConnectView } from './components/features/ConnectView';
import { UsernameSetupModal } from './components/features/UsernameSetupModal';
import { OverviewPage } from './components/pages/OverviewPage';
import { CredentialPage } from './components/pages/CredentialPage';
import { ProvePage } from './components/pages/ProvePage';
import { PermitsPage } from './components/pages/PermitsPage';
import { LedgerPage } from './components/pages/LedgerPage';
import { TrustPage } from './components/pages/TrustPage';
import { OwnerPage } from './components/pages/OwnerPage';
import { SettingsPage } from './components/pages/SettingsPage';

function App() {
  const { route, navigate } = useHashRoute();
  const { state } = useMidnight();
  const sessionStatus = useSessionStatus();
  const [activityOpen, setActivityOpen] = useState(false);

  const connected = state.status === 'connected';
  const activeRoute = isRoute(route) ? route : 'overview';

  // Required one-time setup: the wallet must pick a display name (mapped to its
  // public address) before the app is usable. Tracked per wallet in the store.
  const connectedAddress = connected ? state.address : null;
  const savedUsername = useUsername(connectedAddress ?? '');
  const needsUsername = connected && connectedAddress !== null && savedUsername === null;

  // Boot the contract session when the wallet connects; tear it down when the
  // wallet disconnects or the connection errors.
  useEffect(() => {
    if (state.status === 'connected') {
      void bootSession();
    } else if (state.status === 'idle' || state.status === 'error') {
      if (sessionStatus !== 'idle') resetSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  // Once the wallet connects, take the user straight to the prove-eligibility
  // flow. Disconnecting (sidebar or wallet popover) drops back to the landing.
  useEffect(() => {
    if (connected) navigate('prove');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // Full-screen landing hero + marketing sections until a wallet is connected.
  if (!connected) {
    return <ConnectView />;
  }

  return (
    <>
      {needsUsername && connectedAddress !== null && (
        <UsernameSetupModal address={connectedAddress} onSaved={() => {}} />
      )}
      <AppShell
        route={activeRoute}
        navigate={navigate}
        activityOpen={activityOpen}
        onActivityOpen={() => setActivityOpen(true)}
        onActivityClose={() => setActivityOpen(false)}
      >
        {activeRoute === 'overview' && <OverviewPage navigate={navigate} />}
        {activeRoute === 'credential' && <CredentialPage />}
        {activeRoute === 'prove' && <ProvePage navigate={navigate} />}
        {activeRoute === 'permits' && <PermitsPage />}
        {activeRoute === 'ledger' && <LedgerPage />}
        {activeRoute === 'trust' && <TrustPage />}
        {activeRoute === 'owner' && <OwnerPage />}
        {activeRoute === 'settings' && <SettingsPage navigate={navigate} />}
      </AppShell>
    </>
  );
}

export default App;
