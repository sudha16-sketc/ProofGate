import { PageHeader } from './PageHeader';
import { OwnerPanel } from '../features/OwnerPanel';
import { ActivityFeed } from '../features/ActivityFeed';

export function OwnerPage() {
  return (
    <>
      <PageHeader route="owner" />
      <OwnerPanel />
      <section style={{ marginTop: 'var(--sp-8)' }}>
        <div className="section-head">
          <div>
            <h1 style={{ fontSize: 'var(--fs-h2)' }}>Recent activity</h1>
            <p className="lead">Only transaction ids, circuit names and statuses — never witness data.</p>
          </div>
        </div>
        <ActivityFeed />
      </section>
    </>
  );
}
