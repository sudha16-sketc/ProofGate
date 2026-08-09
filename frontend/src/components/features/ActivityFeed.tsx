import { useSessionActivity } from '../../store/session';
import { StatusBadge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { IconActivity, IconCheckCircle, IconClock, IconX } from '../icons';
import { circuitLabel } from '../../lib/formats';

/** Inline activity feed (used on the overview/owner pages). */
export function ActivityFeed() {
  const activity = useSessionActivity();

  if (activity.length === 0) {
    return (
      <EmptyState
        icon={<IconActivity size={20} />}
        title="No transactions yet"
        description="Contract actions appear here with their status as you run them."
      />
    );
  }

  return (
    <div className="activity-list">
      {activity.map((item) => (
        <div className="activity-item" key={item.id}>
          <span className="activity-icon">
            {item.status === 'confirmed' ? <IconCheckCircle size={16} /> : item.status === 'failed' ? <IconX size={16} /> : <IconClock size={16} />}
          </span>
          <div className="activity-main">
            <div className="activity-title">{circuitLabel(item.circuit)}</div>
            <div className="activity-meta">
              <span className="mono">
                {new Date(item.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
              {item.feature && <span>{item.feature}</span>}
              {item.permitId && <span className="mono">{item.permitId.slice(0, 12)}…</span>}
              {item.txId && <span className="mono">{item.txId.slice(0, 12)}…</span>}
            </div>
          </div>
          <StatusBadge tone={item.status === 'confirmed' ? 'ok' : item.status === 'failed' ? 'err' : 'dim'}>
            {item.status}
          </StatusBadge>
        </div>
      ))}
    </div>
  );
}
