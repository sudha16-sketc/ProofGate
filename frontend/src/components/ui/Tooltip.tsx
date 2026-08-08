import { useId } from 'react';

/**
 * Accessible tooltip. The trigger receives an aria-describedby pointing at the
 * tooltip text so screen readers announce the explanation too.
 */
export function Tooltip({
  label,
  children,
  placement = 'top',
}: {
  label: string;
  children: React.ReactNode;
  placement?: 'top' | 'right';
}) {
  const id = useId();
  return (
    <span className="tip" data-placement={placement} role="note">
      <span aria-describedby={id}>{children}</span>
      <span id={id} className="tip-text" role="tooltip">
        {label}
      </span>
    </span>
  );
}

/** Tooltip specifically for the "public / private" privacy explanations. */
export function PrivacyHint({ children, hint }: { children: React.ReactNode; hint: string }) {
  const id = useId();
  return (
    <span className="tip" data-placement="top">
      <span aria-describedby={id} tabIndex={0} className="truncate">
        {children}
      </span>
      <span id={id} className="tip-text" role="tooltip">
        {hint}
      </span>
    </span>
  );
}
