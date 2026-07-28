import { cn } from './cn';

export type SpinnerSize = 'sm' | 'md' | 'lg';

const sizes: Record<SpinnerSize, string> = {
  sm: 'size-3.5 border',
  md: 'size-5 border-2',
  lg: 'size-8 border-2',
};

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  /** Accessible label. Set to null when a parent already announces the load. */
  label?: string | null;
}

export const Spinner = ({ size = 'md', className, label = 'Loading' }: SpinnerProps) => (
  <span
    role={label ? 'status' : undefined}
    aria-label={label ?? undefined}
    aria-hidden={label ? undefined : true}
    className={cn(
      'inline-block shrink-0 animate-spin rounded-full border-rule border-t-primary',
      sizes[size],
      className,
    )}
  />
);
