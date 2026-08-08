import { Fragment } from 'react';
import { useInView } from '../../hooks/useInView';
import { IconBuilding, IconCertificate, IconChip, IconLock, IconShield, IconZap } from '../icons';

export type PipelineStage = {
  icon: 'id' | 'cred' | 'zk' | 'elig' | 'permit' | 'action';
  label: string;
  name: string;
  kind: 'private' | 'transition' | 'public';
};

const ICONS = {
  id: IconBuilding,
  cred: IconCertificate,
  zk: IconChip,
  elig: IconShield,
  permit: IconZap,
  action: IconLock,
} as const;

/**
 * Scroll-illuminated proof pipeline. Each stage lights up as it enters the
 * viewport. Purely educational — describes the ProofGate architecture.
 */
export function ProofPipeline({
  stages,
  title = 'How a proof flows',
}: {
  stages: PipelineStage[];
  title?: string;
}) {
  return (
    <div className="pipe" aria-label={title}>
      {stages.map((stage, i) => {
        const Icon = ICONS[stage.icon];
        return (
          <Fragment key={stage.label}>
            <StageNode stage={stage} icon={Icon} index={i} />
            {i < stages.length - 1 && <span className="pipe-arrow" aria-hidden="true" />}
          </Fragment>
        );
      })}
    </div>
  );
}

function StageNode({
  stage,
  icon: Icon,
  index,
}: {
  stage: PipelineStage;
  icon: (p: { size?: number }) => React.ReactNode;
  index: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.4 });
  const style = { transitionDelay: inView ? `${index * 90}ms` : '0ms' };
  return (
    <div
      ref={ref}
      className={`pipe-stage ${inView ? 'lit' : ''} ${stage.kind}`.trim()}
      style={style}
    >
      <span className="pipe-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <span className="col grow">
        <span className="pipe-label">{stage.label}</span>
        <span className="pipe-name">{stage.name}</span>
      </span>
    </div>
  );
}
