import { Button } from './Button';
import { IconAlert, IconInfo } from '../icons';

export function Toast({
  kind,
  text,
  onDismiss,
  children,
}: {
  kind: 'ok' | 'err' | 'info';
  text: string;
  onDismiss?: () => void;
  children?: React.ReactNode;
}) {
  const Icon = kind === 'ok' ? IconInfo : kind === 'err' ? IconAlert : IconInfo;
  return (
    <div className={`toast toast-${kind}`} role={kind === 'err' ? 'alert' : 'status'}>
      <span className={`toast-icon ${kind === 'ok' ? 'status-proof' : kind === 'err' ? 'status-err' : ''}`.trim()}>
        <Icon size={16} />
      </span>
      <p>{text}</p>
      {children}
      {onDismiss && (
        <Button variant="ghost" size="sm" onClick={onDismiss} aria-label="Dismiss message">
          Dismiss
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      <div className="skeleton-block" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`skeleton-line ${i % 2 === 0 ? 'w60' : 'w40'}`.trim()} />
      ))}
    </div>
  );
}
