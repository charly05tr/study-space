import { cn } from '../../../components/ui';
import { formatTime } from '../calendar';
import type { PlannedSession } from '../types';

interface PlannedSessionChipProps {
  session: PlannedSession;
  onClick: () => void;
}

/**
 * How a status reads inside a cell four lines tall.
 *
 * Cancelled and missed are struck through rather than hidden: a calendar that
 * quietly erases what you did not do tells you nothing about your week.
 */
const statusStyles: Record<PlannedSession['status'], string> = {
  planned: 'border-primary-200 bg-primary-50 text-primary-ink',
  started: 'border-success/30 bg-success-soft text-success',
  completed: 'border-success/30 bg-success-soft text-success',
  missed: 'border-rule text-muted line-through',
  cancelled: 'border-rule text-muted line-through',
};

export const PlannedSessionChip = ({ session, onClick }: PlannedSessionChipProps) => (
  <button
    type="button"
    onClick={(event) => {
      // Without this the cell behind it opens the "new block" form as well.
      event.stopPropagation();
      onClick();
    }}
    title={`${formatTime(session.starts_at)} · ${session.goal}`}
    className={cn(
      'flex w-full items-baseline gap-1.5 rounded-xs border px-1.5 py-1 text-left',
      'transition-colors duration-150 hover:border-primary',
      statusStyles[session.status],
    )}
  >
    <span className="font-heading text-[0.65rem] tabular-nums opacity-80">
      {formatTime(session.starts_at)}
    </span>
    <span className="truncate text-xs">{session.goal}</span>
  </button>
);
