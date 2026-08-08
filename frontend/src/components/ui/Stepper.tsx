import { Fragment } from 'react';
import { IconCheck } from '../icons';

export function Stepper({
  steps,
  current,
  className = '',
}: {
  steps: string[];
  current: number;
  className?: string;
}) {
  return (
    <ol className={`stepper ${className}`.trim()} aria-label="Progress">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <Fragment key={`${label}-${i}`}>
            <li className={`step ${done ? 'done' : ''} ${active ? 'active' : ''}`.trim()}>
              <span className="step-index" aria-hidden="true">
                {done ? <IconCheck size={15} /> : String(i + 1).padStart(2, '0')}
              </span>
              <span className="step-label">{label}</span>
            </li>
            {i < steps.length - 1 && <li className="step-track" aria-hidden="true" />}
          </Fragment>
        );
      })}
    </ol>
  );
}
