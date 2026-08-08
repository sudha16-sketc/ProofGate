export function Tabs({
  tabs,
  active,
  onChange,
  ariaLabel,
  className = '',
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={`tabs ${className}`.trim()}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={active === tab.id}
          aria-controls={`panel-${tab.id}`}
          tabIndex={active === tab.id ? 0 : -1}
          className="tab"
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              const idx = tabs.findIndex((t) => t.id === active);
              const next = tabs[(idx + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
              onChange(next!.id);
            }
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
