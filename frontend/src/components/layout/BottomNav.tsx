import { useEffect, useRef, useState } from 'react';
import { BOTTOM_NAV, MORE_ROUTES, ROUTES } from '../../lib/navigation';
import type { RouteId } from '../../lib/navigation';
import { IconMenu } from '../icons';

export function BottomNav({ route, navigate }: { route: RouteId; navigate: (route: string) => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [moreOpen]);

  const isMoreActive = MORE_ROUTES.includes(route);

  return (
    <nav className="pg-bottomnav" aria-label="Primary">
      {BOTTOM_NAV.map((id) => {
        const item = ROUTES.find((r) => r.id === id)!;
        const Icon = item.icon;
        const current = route === id;
        return (
          <a
            key={id}
            href={`#/${id}`}
            className="bn-item"
            aria-current={current ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate(id);
              setMoreOpen(false);
            }}
          >
            <span className="bn-icon">
              <Icon size={18} />
            </span>
            {item.label.split(' ')[0]!}
          </a>
        );
      })}

      <div className="bn-more" ref={anchorRef}>
        {moreOpen && (
          <div className="bn-more-panel" role="menu">
            {MORE_ROUTES.map((id) => {
              const item = ROUTES.find((r) => r.id === id)!;
              const Icon = item.icon;
              return (
                <a
                  key={id}
                  href={`#/${id}`}
                  role="menuitem"
                  className="bn-more-item"
                  aria-current={route === id ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(id);
                    setMoreOpen(false);
                  }}
                >
                  <Icon size={16} />
                  {item.label}
                </a>
              );
            })}
          </div>
        )}
        <button
          className="bn-item"
          aria-pressed={moreOpen}
          aria-expanded={moreOpen}
          aria-label="More pages"
          onClick={() => setMoreOpen((v) => !v)}
        >
          <span className="bn-icon">
            <IconMenu size={18} />
          </span>
          {moreOpen || isMoreActive ? 'Menu' : 'More'}
        </button>
      </div>
    </nav>
  );
}
