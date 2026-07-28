import { cn } from './cn';
import { Spinner } from './Spinner';

interface LoadingProps {
  label?: string;
  /** Centers the block in the available vertical space, for route-level loads. */
  full?: boolean;
  className?: string;
}

export const Loading = ({ label = 'Loading', full = false, className }: LoadingProps) => (
  <div
    role="status"
    aria-live="polite"
    className={cn(
      'flex flex-col items-center justify-center gap-3 py-10',
      full && 'min-h-[50vh]',
      className,
    )}
  >
    <Spinner size="lg" label={null} />
    <p className="font-heading text-sm uppercase tracking-[0.14em] text-muted">{label}</p>
  </div>
);
