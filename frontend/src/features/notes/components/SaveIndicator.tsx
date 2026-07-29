import { cn } from '../../../components/ui/cn';
import type { SaveStatus } from '../types';

const LABELS: Record<SaveStatus, string> = {
  saved: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving',
  error: 'Not saved',
};

const DOTS: Record<SaveStatus, string> = {
  saved: 'bg-rule',
  dirty: 'bg-muted',
  saving: 'bg-primary',
  error: 'bg-danger',
};

interface SaveIndicatorProps {
  status: SaveStatus;
  className?: string;
}

/**
 * A marginal note, not a notification: at rest it should be almost invisible,
 * and only the failure state earns a colour that pulls the eye.
 *
 * `aria-live="polite"` because the status changes without the user acting on
 * it — a screen reader user gets no other signal that the note was persisted.
 */
export const SaveIndicator = ({ status, className }: SaveIndicatorProps) => (
  <p
    aria-live="polite"
    className={cn(
      'flex items-center gap-2 font-heading text-xs uppercase tracking-[0.14em]',
      status === 'error' ? 'text-danger' : 'text-muted',
      className,
    )}
  >
    <span
      aria-hidden
      className={cn(
        'h-1.5 w-1.5 rounded-full transition-colors duration-300',
        DOTS[status],
        status === 'saving' && 'animate-pulse',
      )}
    />
    {LABELS[status]}
  </p>
);
