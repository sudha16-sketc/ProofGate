import { useCallback, useEffect, useState } from 'react';
import { IconCheck, IconCopy } from '../icons';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API may be unavailable over insecure origins; fall back to
      // a textarea select+copy so the action still works.
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(el);
      }
    }
    setCopied(true);
  }, [text]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <button
      type="button"
      className={`copy-btn ${copied ? 'copied' : ''}`.trim()}
      onClick={copy}
      aria-label={`${label} to clipboard`}
    >
      {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

export function ShortId({ value, head = 12, copyable = true }: { value: string; head?: number; copyable?: boolean }) {
  const display = value.length <= head + 6 + 1 ? value : `${value.slice(0, head)}…${value.slice(-6)}`;
  return (
    <span className="row" style={{ gap: 8, minWidth: 0 }}>
      <span className="mono truncate" style={{ minWidth: 0 }}>
        {display}
      </span>
      {copyable && <CopyButton text={value} label="" />}
    </span>
  );
}
