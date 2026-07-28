import { cn } from './cn';

interface SkeletonProps {
  className?: string;
}

export const Skeleton = ({ className }: SkeletonProps) => (
  <span
    aria-hidden
    className={cn('block animate-pulse rounded-xs border border-rule bg-tint/40', className)}
  />
);

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

/** Ragged last line so the placeholder reads as prose, not as a table. */
export const SkeletonText = ({ lines = 3, className }: SkeletonTextProps) => (
  <div className={cn('flex flex-col gap-2', className)}>
    {Array.from({ length: lines }, (_, index) => (
      <Skeleton key={index} className={cn('h-4', index === lines - 1 && 'w-2/3')} />
    ))}
  </div>
);
