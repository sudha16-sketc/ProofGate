import { PageHeader } from './PageHeader';
import { SettingsPanel } from '../features/SettingsPanel';

export function SettingsPage({ navigate }: { navigate: (route: string) => void }) {
  return (
    <>
      <PageHeader route="settings" />
      <SettingsPanel navigate={navigate} />
    </>
  );
}
