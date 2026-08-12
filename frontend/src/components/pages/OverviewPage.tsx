import { OverviewView } from '../features/OverviewView';

export function OverviewPage({ navigate }: { navigate: (route: string) => void }) {
  return <OverviewView navigate={navigate} />;
}
