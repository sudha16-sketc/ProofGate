import { PageHeader } from './PageHeader';
import { LedgerPanels } from '../features/LedgerPanels';

export function LedgerPage() {
  return (
    <>
      <PageHeader route="ledger" />
      <LedgerPanels />
    </>
  );
}
