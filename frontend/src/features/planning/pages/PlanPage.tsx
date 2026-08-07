import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Divider, ErrorState, Skeleton } from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useStudyspace } from '../../studyspaces/hooks/useStudyspace';
import { addMonths, buildMonthGrid, gridRange, groupByDay, monthLabel } from '../calendar';
import { CalendarGrid, type OpenCell } from '../components/CalendarGrid';
import { usePlannedSessions } from '../hooks/usePlannedSessions';

/**
 * The planning calendar for one studyspace.
 *
 * On its own route rather than a section of the studyspace detail: the grid
 * wants the full width of the page, and the detail is already a long scroll of
 * sources, notes and references. Same reasoning as the map and the history.
 */
export const PlanPage = () => {
  const { studyspaceId } = useParams();
  const id = Number(studyspaceId);

  const [month, setMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [open, setOpen] = useState<OpenCell | null>(null);

  const studyspace = useStudyspace(id);

  // Both derived from the same month so the cells and the query can never
  // disagree about which days are on screen.
  const days = useMemo(() => buildMonthGrid(month), [month]);
  const range = useMemo(() => gridRange(month), [month]);

  const planned = usePlannedSessions(id, range);
  const byDay = useMemo(() => groupByDay(planned.data ?? []), [planned.data]);

  const goToMonth = (delta: number) => {
    // Closed on navigation: a card anchored to a cell that is about to hold a
    // different day would be pointing at the wrong date.
    setOpen(null);
    setMonth((current) => addMonths(current, delta));
  };

  return (
    <article className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link
          to={`/studyspace/${id}`}
          className="font-heading text-xs uppercase tracking-[0.14em] text-muted hover:text-ink"
        >
          &larr; Back to studyspace
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl text-ink">Plan</h1>
            {studyspace.data && (
              <p className="mt-2 font-heading text-xs uppercase tracking-[0.14em] text-muted">
                {studyspace.data.title}
              </p>
            )}
          </div>

          <nav className="flex items-center gap-2">
            <Button variant="quiet" size="sm" onClick={() => goToMonth(-1)}>
              &larr;
            </Button>
            <span className="min-w-44 text-center font-heading text-sm uppercase tracking-[0.14em] text-ink">
              {monthLabel(month)}
            </span>
            <Button variant="quiet" size="sm" onClick={() => goToMonth(1)}>
              &rarr;
            </Button>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setOpen(null);
                const today = new Date();
                setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
              }}
            >
              Today
            </Button>
          </nav>
        </div>

        <Divider ornament className="max-w-40" />
      </header>

      {planned.isError ? (
        <ErrorState
          title="Could not load the calendar"
          message={getApiErrorMessage(planned.error)}
          onRetry={() => planned.refetch()}
        />
      ) : planned.isPending ? (
        <Skeleton className="h-[42rem] w-full" />
      ) : (
        <>
          <CalendarGrid
            studyspaceId={id}
            days={days}
            byDay={byDay}
            open={open}
            onOpen={setOpen}
          />
          <p className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
            Click a day to plan a block. Reminders arrive by email.
          </p>
        </>
      )}
    </article>
  );
};
