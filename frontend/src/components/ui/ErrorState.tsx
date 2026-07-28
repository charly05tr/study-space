import { cn } from './cn';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export const ErrorState = ({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) => (
  <div
    role="alert"
    className={cn(
      'flex flex-col items-start gap-3 rounded-xs border border-danger/30 bg-danger-soft px-5 py-4',
      className,
    )}
  >
    <div>
      <h3 className="font-heading text-xl text-danger">{title}</h3>
      <p className="mt-1 text-sm text-ink">{message}</p>
    </div>
    {onRetry && (
      <Button variant="danger" size="sm" onClick={onRetry}>
        {retryLabel}
      </Button>
    )}
  </div>
);

interface FieldErrorProps {
  message: string;
  className?: string;
}

/** Inline error for anything that is not a labelled field (Input owns its own). */
export const FieldError = ({ message, className }: FieldErrorProps) => (
  <p role="alert" className={cn('text-sm text-danger', className)}>
    {message}
  </p>
);
