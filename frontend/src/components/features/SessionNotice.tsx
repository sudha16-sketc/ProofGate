import { useSessionMessage, clearMessage } from '../../store/session';
import { Toast } from '../ui/Toast';

/** Renders the global session message (ok/error) as a fixed toast. */
export function SessionNotice() {
  const message = useSessionMessage();
  if (!message) return null;
  return (
    <div className="toast-region">
      <Toast
        kind={message.kind === 'ok' ? 'info' : 'err'}
        text={message.text}
        onDismiss={clearMessage}
      >
        {message.detail && <p className="caption mono">{message.detail}</p>}
      </Toast>
    </div>
  );
}
