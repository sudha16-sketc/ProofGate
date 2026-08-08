import { useInView } from '../../hooks/useInView';

/**
 * Scroll-reveal wrapper: adds `.in-view` when the element enters the viewport
 * so the CSS transition (opacity/translate) runs. Fully inert under
 * prefers-reduced-motion.
 */
export function Reveal({
  children,
  className = '',
  as: Tag = 'div',
  delay,
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'li';
  delay?: 1 | 2 | 3;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const cls = ['reveal', inView ? 'in-view' : '', delay ? `reveal-delay-${delay}` : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <Tag ref={ref as never} className={cls}>
      {children}
    </Tag>
  );
}
