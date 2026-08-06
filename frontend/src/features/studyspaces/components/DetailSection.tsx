import type { ReactNode } from 'react';

interface DetailSectionProps {
  title: string;
  count: number;
  /** Shown instead of the children when count is 0. */
  emptyMessage: string;
  /** Optional control rendered on the right of the section heading. */
  action?: ReactNode;
  /** Rendered under the heading, above the list. */
  banner?: ReactNode;
  children: ReactNode;
}

export const DetailSection = ({
  title,
  count,
  emptyMessage,
  action,
  banner,
  children,
}: DetailSectionProps) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-2">
      <div className="flex items-baseline gap-3">
        <h2 className="font-heading text-sm uppercase tracking-[0.18em] text-ink">{title}</h2>
        <span className="font-heading text-xs text-muted">{count}</span>
      </div>
      {action}
    </div>

    {banner}

    {count === 0 ? <p className="text-sm text-muted">{emptyMessage}</p> : children}
  </section>
);
