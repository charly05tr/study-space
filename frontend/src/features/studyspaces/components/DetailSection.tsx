import type { ReactNode } from 'react';

interface DetailSectionProps {
  title: string;
  count: number;
  /** Shown instead of the children when count is 0. */
  emptyMessage: string;
  children: ReactNode;
}

export const DetailSection = ({ title, count, emptyMessage, children }: DetailSectionProps) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-baseline gap-3 border-b border-rule pb-2">
      <h2 className="font-heading text-sm uppercase tracking-[0.18em] text-ink">{title}</h2>
      <span className="font-heading text-xs text-muted">{count}</span>
    </div>

    {count === 0 ? <p className="text-sm text-muted">{emptyMessage}</p> : children}
  </section>
);

interface DetailRowProps {
  children: ReactNode;
}

/** One entry inside a section. Hairline separators, never a boxed card. */
export const DetailRow = ({ children }: DetailRowProps) => (
  <li className="flex items-center justify-between gap-4 border-b border-rule/60 py-2 last:border-b-0">
    {children}
  </li>
);
