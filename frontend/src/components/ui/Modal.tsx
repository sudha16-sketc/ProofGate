import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from '../icons';
import { Button } from './Button';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (focusables.length === 0) return;
  const first = focusables[0]!;
  const last = focusables[focusables.length - 1]!;
  const active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || !container.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last || !container.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

export function Modal({
  open,
  onClose,
  title,
  size,
  children,
  footer,
  labelledBy,
  dismissable = true,
}: {
  open: boolean;
  onClose?: () => void;
  title?: string;
  size?: 'md' | 'lg';
  children: React.ReactNode;
  footer?: React.ReactNode;
  labelledBy?: string;
  /** When false the dialog cannot be closed via Escape, backdrop or the X (e.g. a required setup step). */
  dismissable?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => {
    prevFocus.current?.focus?.();
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const el = ref.current;
    if (el) {
      const first = el.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (dismissable) handleClose();
      } else if (e.key === 'Tab' && ref.current) {
        trapFocus(ref.current, e);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, handleClose, dismissable]);

  if (!open) return null;

  const titleId = labelledBy ?? (title ? `${id}-title` : undefined);

  return createPortal(
    <div
      className="backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && dismissable && handleClose()}
    >
      <div
        ref={ref}
        className={`modal ${size === 'lg' ? 'modal-lg' : ''}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {(title || labelledBy) && (
          <div className="modal-header">
            <h2 id={titleId}>{title}</h2>
            {dismissable && (
              <Button variant="ghost" size="sm" onClick={handleClose} aria-label="Close dialog">
                <IconX size={16} />
              </Button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
