import { PageHeader } from './PageHeader';
import { CredentialPanel } from '../features/CredentialPanel';

export function CredentialPage() {
  return (
    <>
      <PageHeader route="credential" />
      <CredentialPanel />
    </>
  );
}
