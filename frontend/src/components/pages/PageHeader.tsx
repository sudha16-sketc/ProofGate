import type { ReactNode } from 'react';
import { ROUTE_TITLES, type RouteId } from '../../lib/navigation';

export function PageHeader({ route, children }: { route: RouteId; children?: ReactNode }) {
  const meta = ROUTE_TITLES[route];
  return (
    <div className="section-head">
      <div>
        <h1>{meta.title}</h1>
        <p className="lead">{meta.lead}</p>
      </div>
      {children}
    </div>
  );
}
