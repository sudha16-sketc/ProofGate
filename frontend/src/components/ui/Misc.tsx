import { IconShield } from '../icons';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <span className="logo-mark" aria-hidden="true">
        <IconShield size={17} />
      </span>
      {!compact && (
        <span className="logo-word">
          Proof<span>Gate</span>
        </span>
      )}
    </span>
  );
}

export function Spinner({ size = 'md', label }: { size?: 'sm' | 'md' | 'lg'; label?: string }) {
  return (
    <span className={`row ${label ? '' : 'visually-hidden'}`.trim()}>
      <span className={`spinner ${size === 'lg' ? 'spinner-lg' : ''}`.trim()} aria-hidden="true" />
      {label && <span className="muted caption">{label}</span>}
    </span>
  );
}
