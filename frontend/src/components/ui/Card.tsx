import type { HTMLAttributes } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  hover?: boolean;
  accent?: boolean;
  pad?: 'md' | 'sm';
};

export function Card({ hover, accent, pad = 'md', className = '', ...rest }: CardProps) {
  return (
    <div
      className={[
        'card',
        hover ? 'card-hover' : '',
        accent ? 'card-accent-top' : '',
        pad === 'sm' ? 'card-pad-sm' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}
