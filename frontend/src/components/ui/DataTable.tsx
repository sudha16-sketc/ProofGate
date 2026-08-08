import type { ReactNode } from 'react';

export function DataTable<T extends { key: string }>({
  columns,
  rows,
  empty,
  className = '',
}: {
  columns: { key: string; label: string; align?: 'left' | 'right'; render?: (row: T) => ReactNode }[];
  rows: T[];
  empty?: string;
  className?: string;
}) {
  return (
    <div className={`table-wrap ${className}`.trim()}>
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" style={{ textAlign: c.align }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length}>
                <div className="empty" style={{ padding: '24px 12px' }}>
                  <p>{empty ?? 'No records.'}</p>
                </div>
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.key}>
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align }}>
                  {c.render
                    ? c.render(row)
                    : ((row as Record<string, unknown>)[c.key] as ReactNode) ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CodeBlock({
  label,
  children,
  actions,
  className = '',
}: {
  label?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`codeblock ${className}`.trim()}>
      {label && (
        <div className="codeblock-head">
          <span>{label}</span>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
