import { IconAlert, IconCheckCircle, IconClock, IconInfo, IconLock, IconShield, IconX } from '../icons';

type BadgeTone = 'dim' | 'ok' | 'warn' | 'err' | 'accent' | 'proof' | 'default';

export function Badge({
  children,
  tone = 'default',
  dot,
  className = '',
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={`badge badge-${tone} ${className}`.trim()}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export type StatusTone = 'ok' | 'warn' | 'err' | 'accent' | 'proof' | 'dim' | 'default';

const STATUS_ICONS = {
  ok: IconCheckCircle,
  warn: IconAlert,
  err: IconX,
  accent: IconShield,
  proof: IconLock,
  dim: IconClock,
  default: IconInfo,
};

/** Status chip that always carries an icon so color is never the only signal. */
export function StatusBadge({
  children,
  tone = 'default',
  className = '',
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  const Icon = STATUS_ICONS[tone];
  return (
    <span className={`status status-${tone} ${className}`.trim()}>
      <Icon size={13} />
      <span>{children}</span>
    </span>
  );
}

export function NetworkIndicator({ network, live }: { network: string; live: boolean }) {
  return (
    <span className="badge badge-accent" title={`Connected network: ${network}`}>
      <span className={`badge-dot ${live ? '' : 'badge-err'}`} aria-hidden="true" />
      {network}
    </span>
  );
}
