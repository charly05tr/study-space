import { useState } from 'react';
import { Button, ErrorState, Skeleton } from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { DetailSection } from '../../studyspaces/components/DetailSection';
import { useActiveSession, useSessionHistory } from '../hooks/useStudySessions';
import { PomodoroPanel } from './PomodoroPanel';
import { SessionRow } from './SessionRow';
import { StartSessionForm } from './StartSessionForm';

interface SessionsSectionProps {
  studyspaceId: number;
}

/**
 * Study sessions: the one running, and everything before it.
 *
 * Both come off the server, so a session opened on another device shows up
 * here as the running one rather than as an invitation to start a second.
 */
export const SessionsSection = ({ studyspaceId }: SessionsSectionProps) => {
  const [starting, setStarting] = useState(false);

  const active = useActiveSession(studyspaceId);
  const history = useSessionHistory(studyspaceId);

  const sessions = history.data?.results ?? [];
  const total = history.data?.count ?? 0;

  // Only once we KNOW there is none: offering "Start" while the answer is still
  // in flight is how someone ends up submitting into a 400.
  const canStart = !active.isPending && !active.data;

  return (
    <DetailSection
      title="Sessions"
      count={total}
      emptyMessage="No sessions yet. Start one to work in timed stretches."
      action={
        canStart && (
          <Button variant="quiet" size="sm" onClick={() => setStarting((open) => !open)}>
            {starting ? 'Close' : 'Start session'}
          </Button>
        )
      }
      banner={
        <div className="flex flex-col gap-4">
          {active.isPending && <Skeleton className="h-56 w-full" />}

          {active.isError && (
            <ErrorState
              title="Could not load the running session"
              message={getApiErrorMessage(active.error)}
              onRetry={() => active.refetch()}
            />
          )}

          {active.data && (
            <PomodoroPanel session={active.data} studyspaceId={studyspaceId} />
          )}

          {starting && canStart && (
            <StartSessionForm studyspaceId={studyspaceId} onDone={() => setStarting(false)} />
          )}
        </div>
      }
    >
      {history.isError ? (
        <ErrorState
          title="Could not load the history"
          message={getApiErrorMessage(history.error)}
          onRetry={() => history.refetch()}
        />
      ) : (
        <>
          <ul>
            {sessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </ul>

          {/* Paged at ten. A link rather than a pager: the history is a record
              to glance at, not a table to work through. */}
          {total > sessions.length && (
            <p className="pt-2 font-heading text-xs uppercase tracking-[0.14em] text-muted">
              Showing {sessions.length} of {total}
            </p>
          )}
        </>
      )}
    </DetailSection>
  );
};
