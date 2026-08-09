import { useMidnight } from '../../hooks/useMidnight';
import { useSessionBusy, useSessionMessage, useSessionStatus, useSessionError, bootSession } from '../../store/session';
import { CONTRACT_ADDRESS } from '../../lib/env';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';

/**
 * Session readiness card shown on the overview hero (and reused elsewhere).
 * Covers: booting, no configured contract (offers demo deploy), and errors.
 * Renders nothing once the session is ready.
 */
export function SetupCard() {
  const { state } = useMidnight();
  const status = useSessionStatus();
  const busy = useSessionBusy();
  const message = useSessionMessage();
  const error = useSessionError();

  if (state.status !== 'connected') return null;
  if (status === 'ready') return null;
  if (status === 'idle') return null; // App triggers boot on connect

  return (
    <div className="card" style={{ marginTop: 'var(--sp-5)', maxWidth: 560 }}>
      <div className="row-between">
        <h3 style={{ margin: 0 }}>Session setup</h3>
        <StatusBadge tone={status === 'error' ? 'err' : status === 'booting' ? 'dim' : 'warn'}>{status}</StatusBadge>
      </div>

      {status === 'booting' && (
        <p className="muted" style={{ marginTop: 8 }}>
          {busy ?? 'Building the in-memory private state and connecting to the contract…'}
        </p>
      )}

      {status === 'no-contract' && (
        <>
          <p style={{ marginTop: 8 }}>
            No contract address is configured (<code className="mono">VITE_CONTRACT_ADDRESS</code>). The app connects
            only to an existing deployed ProofGate contract — set{' '}
            <code className="mono">VITE_CONTRACT_ADDRESS</code> to the deployed address and reload.
          </p>
          <div className="row-wrap" style={{ marginTop: 12 }}>
            {CONTRACT_ADDRESS && (
              <Button variant="ghost" onClick={() => void bootSession()} loading={busy !== null}>
                Retry connect
              </Button>
            )}
          </div>
        </>
      )}

      {status === 'error' && (
        <>
          <p style={{ marginTop: 8 }}>{error ?? message?.text ?? 'The session could not start.'}</p>
          <div className="row-wrap" style={{ marginTop: 12 }}>
            <Button variant="primary" onClick={() => void bootSession()} loading={busy !== null}>
              Retry session
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
