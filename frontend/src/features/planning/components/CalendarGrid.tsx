import { cn } from '../../../components/ui';
import { DAYS_IN_WEEK, WEEKDAY_LABELS, type CalendarDay } from '../calendar';
import { PlannedSessionChip } from './PlannedSessionChip';
import { PlanSessionCard } from './PlanSessionCard';
import type { PlannedSession } from '../types';

/** Which cell has the card open, and whether it opened on a chip. */
export interface OpenCell {
  key: string;
  session?: PlannedSession;
}

interface CalendarGridProps {
  studyspaceId: number;
  days: CalendarDay[];
  byDay: Map<string, PlannedSession[]>;
  open: OpenCell | null;
  onOpen: (cell: OpenCell | null) => void;
}

/** Past cells stay clickable to read what is in them, but not to plan into. */
const CHIP_LIMIT = 3;

export const CalendarGrid = ({
  studyspaceId,
  days,
  byDay,
  open,
  onOpen,
}: CalendarGridProps) => (
  <div className="w-full">
    <div className="grid grid-cols-7 border-x border-t border-rule">
      {WEEKDAY_LABELS.map((label) => (
        <div
          key={label}
          className="border-b border-rule px-2 py-2 text-center font-heading text-xs uppercase tracking-[0.14em] text-muted"
        >
          {/* The initial on narrow screens: seven columns of "Wed" wrap, and a
              wrapped weekday header pushes the whole grid down a line. */}
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{label[0]}</span>
        </div>
      ))}

      {days.map((day, index) => {
        const sessions = byDay.get(day.key) ?? [];
        const isOpen = open?.key === day.key;
        const column = index % DAYS_IN_WEEK;
        const row = Math.floor(index / DAYS_IN_WEEK);

        return (
          <div
            key={day.key}
            /* `relative` and no `overflow-hidden` anywhere up the tree: the
               floating card is a child of the cell it belongs to, and a
               clipping ancestor would cut it off at the grid line. */
            className={cn(
              'relative flex min-h-28 flex-col gap-1 border-b border-r border-rule p-1.5',
              'transition-colors duration-150',
              day.inMonth ? 'bg-page' : 'bg-page/40',
              day.isPast && 'opacity-60',
              !day.isPast && 'hover:bg-primary-50/40',
            )}
          >
            <button
              type="button"
              disabled={day.isPast}
              aria-label={`Plan a block on ${day.date.toDateString()}`}
              onClick={() => onOpen(isOpen && !open?.session ? null : { key: day.key })}
              /* Stretched over the cell so the whole square is the target, but
                 underneath the chips so those keep their own click. */
              className="absolute inset-0 z-0 disabled:cursor-default"
            />

            <span
              className={cn(
                'relative z-10 self-end font-heading text-xs tabular-nums',
                day.isToday && 'rounded-full bg-primary px-1.5 py-0.5 text-on-primary',
                !day.isToday && (day.inMonth ? 'text-ink' : 'text-muted'),
              )}
            >
              {day.date.getDate()}
            </span>

            <div className="relative z-10 flex flex-col gap-1">
              {sessions.slice(0, CHIP_LIMIT).map((session) => (
                <PlannedSessionChip
                  key={session.id}
                  session={session}
                  onClick={() => onOpen({ key: day.key, session })}
                />
              ))}

              {sessions.length > CHIP_LIMIT && (
                <span className="px-1.5 font-heading text-[0.65rem] uppercase tracking-[0.12em] text-muted">
                  +{sessions.length - CHIP_LIMIT} more
                </span>
              )}
            </div>

            {isOpen && (
              <PlanSessionCard
                studyspaceId={studyspaceId}
                day={day.date}
                session={open.session}
                /* Flip towards the middle from the outer columns and the lower
                   rows, so the card never opens off the edge of the grid. */
                alignRight={column >= 4}
                alignTop={row >= 3}
                onClose={() => onOpen(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  </div>
);
