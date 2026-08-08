import { PageHeader } from './PageHeader';
import { PermitPanel } from '../features/PermitPanel';

export function PermitsPage() {
  return (
    <>
      <PageHeader route="permits" />
      <PermitPanel />
    </>
  );
}
