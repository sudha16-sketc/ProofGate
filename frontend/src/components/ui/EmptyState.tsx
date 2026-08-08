import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className = '',
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`empty ${className}`.trim()}>
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      <p>{description}</p>
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  detail,
  onRetry,
  onDismiss,
}: {
  title: string;
  message: string;
  detail?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <div className="error-title">Error: {title}</div>
      <p>{message}</p>
      {detail && (
        <details>
          <summary className="caption">Technical details</summary>
          <pre className="codeblock" style={{ marginTop: 8 }}>
            {detail}
          </pre>
        </details>
      )}
      {(onRetry || onDismiss) && (
        <div className="row-wrap">
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
          {onDismiss && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
