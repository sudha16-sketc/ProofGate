// Minimal hash-based router hook. Deep-links, back/forward and keyboard
// navigation all work without a router dependency.

import { useCallback, useEffect, useState } from 'react';

export function parseHash(hash: string): string {
  const raw = hash.replace(/^#\/?/, '').replace(/\/$/, '');
  const [segment] = raw.split('?');
  return segment ?? '';
}

export function currentRoute(): string {
  return parseHash(window.location.hash);
}

export function useHashRoute(): { route: string; navigate: (route: string) => void } {
  const [route, setRoute] = useState<string>(() => currentRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: string) => {
    const target = `#/${next.replace(/^\/+/, '')}`;
    if (window.location.hash === target) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    } else {
      window.location.hash = target;
    }
  }, []);

  return { route, navigate };
}
