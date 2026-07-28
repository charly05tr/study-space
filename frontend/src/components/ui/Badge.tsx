import type { ReactNode } from 'react';
import { cn } from './cn';

export type BadgeVariant = 'neutral' | 'primary' | 'success' | 'danger';

const variants: Record<BadgeVariant, string> = {
  neutral: 'border-rule text-muted',
  /* primary-ink, not primary: gold text on paper is 2.19:1. */
  primary: 'border-primary-200 bg-primary-50 text-primary-ink',
  success: 'border-success/30 bg-success-soft text-success',
  danger: 'border-danger/30 bg-danger-soft text-danger',
};

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}

export const Badge = ({ variant = 'neutral', className, children }: BadgeProps) => (
  <span
    className={cn(
      'inline-flex items-center rounded-xs border px-2 py-0.5',
      'font-heading text-xs uppercase tracking-[0.12em]',
      variants[variant],
      className,
    )}
  >
    {children}
  </span>
);
