import type { ReactNode } from 'react';
import { cn } from './cn';

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Usually a Button. */
  action?: ReactNode;
  className?: string;
}

export const EmptyState = ({ title, description, action, className }: EmptyStateProps) => (
  <div
    className={cn(
      'flex flex-col items-center gap-3 rounded-xs border border-dashed border-rule px-6 py-12 text-center',
      className,
    )}
  >
    <span aria-hidden className="text-lg text-primary">
      &#10086;
    </span>
    <div>
      <h3 className="font-heading text-2xl text-ink">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-measure text-sm text-muted">{description}</p>}
    </div>
    {action}
  </div>
);
