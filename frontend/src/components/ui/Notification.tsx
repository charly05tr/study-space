import { cn } from './cn';
import type { NotificationVariant } from './notificationContext';

const variants: Record<NotificationVariant, string> = {
  info: 'border-primary-200 bg-primary-50',
  success: 'border-success/30 bg-success-soft',
  error: 'border-danger/30 bg-danger-soft',
};

const accents: Record<NotificationVariant, string> = {
  info: 'text-primary-ink',
  success: 'text-success',
  error: 'text-danger',
};

interface NotificationProps {
  variant?: NotificationVariant;
  title?: string;
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export const Notification = ({
  variant = 'info',
  title,
  message,
  onDismiss,
  className,
}: NotificationProps) => (
  <div
    role={variant === 'error' ? 'alert' : 'status'}
    className={cn(
      'flex items-start gap-3 rounded-xs border px-4 py-3',
      variants[variant],
      className,
    )}
  >
    <div className="flex-1">
      {title && (
        <p
          className={cn(
            'font-heading text-sm uppercase tracking-[0.14em]',
            accents[variant],
          )}
        >
          {title}
        </p>
      )}
      <p className={cn('text-sm text-ink', title && 'mt-0.5')}>{message}</p>
    </div>
    {onDismiss && (
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="-mr-1 shrink-0 rounded-xs border border-transparent px-1.5 leading-none text-muted transition-colors hover:border-rule hover:text-ink"
      >
        &times;
      </button>
    )}
  </div>
);
