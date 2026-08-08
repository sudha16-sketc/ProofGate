import { useSessionActivity } from '../../store/session';
import { Drawer } from '../ui/Drawer';
import { StatusBadge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { IconActivity, IconCheckCircle, IconClock, IconX } from '../icons';
import { circuitLabel } from '../../lib/formats';

export function ActivityDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const activity = useSessionActivity();

  return (
    <Drawer open={open} onClose={onClose} title="Activity">
      {activity.length === 0 ? (
        <EmptyState
          icon={<IconActivity size={20} />}
          title="No transactions yet"
          description="Every contract action you take — policy, credential, permit — will appear here with its status."
        />
      ) : (
        <div className="activity-list">
          {activity.map((item) => (
            <div className="activity-item" key={item.id}>
              <span className="activity-icon">
                <StatusIcon status={item.status} />
              </span>
              <div className="activity-main">
                <div className="activity-title">{circuitLabel(item.circuit)}</div>
                <div className="activity-meta">
                  <span className="mono">
                    {new Date(item.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  {item.feature && <span>{item.feature}</span>}
                  {item.permitId && <span className="mono">{item.permitId.slice(0, 12)}…</span>}
                  {item.txId && <span className="mono">{item.txId.slice(0, 12)}…</span>}
                </div>
                {item.detail && <div className="activity-meta">{item.detail}</div>}
              </div>
              <StatusBadge tone={item.status === 'confirmed' ? 'ok' : item.status === 'failed' ? 'err' : 'dim'}>
                {item.status}
              </StatusBadge>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}

function StatusIcon({ status }: { status: 'pending' | 'confirmed' | 'failed' }) {
  if (status === 'confirmed') return <IconCheckCircle size={16} />;
  if (status === 'failed') return <IconX size={16} />;
  return <IconClock size={16} />;
}
