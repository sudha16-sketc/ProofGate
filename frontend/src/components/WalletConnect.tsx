// WalletConnect — connect to the user's Midnight wallet (DApp Connector API v4).

import { useMidnight } from '../hooks/useMidnight';

export function WalletConnect() {
  const { state, network, connect, disconnect, clearError } = useMidnight();

  if (state.status === 'connected') {
    return (
      <section className="card">
        <div className="row">
          <h2>Wallet</h2>
          <span className="badge ok">connected</span>
        </div>
        <p>
          <strong>{state.walletName}</strong> · {network}
        </p>
        <p className="mono address">{state.address}</p>
        <button onClick={disconnect}>Disconnect</button>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="row">
        <h2>Wallet</h2>
        <span className="badge">{state.status === 'connecting' ? 'connecting…' : 'disconnected'}</span>
      </div>
      {state.status === 'error' && (
        <>
          <p className="error">{state.error}</p>
          <button onClick={clearError}>Dismiss</button>
        </>
      )}
      <p>
        ProofGate submits every on-chain action through your Midnight wallet
        (Lace): it generates the zero-knowledge proof, balances the transaction,
        and submits it — all in-app.
      </p>
      <button onClick={connect} disabled={state.status === 'connecting'}>
        {state.status === 'connecting' ? 'Connecting…' : `Connect wallet (${network})`}
      </button>
    </section>
  );
}
