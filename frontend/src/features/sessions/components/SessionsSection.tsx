import { useState } from 'react';
import { Link } from 'react-router-dom';
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

  // Only the most recent one here. This section sits above the sources and the
  // notes, and a full history would push the material a scroll away — which is
  // the opposite of what a hub page is for. The rest lives on its own page.
  const latest = history.data?.results[0];
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
        <span className="flex items-center gap-1">
          {/* Siempre visible, al reves que "View all": planificar es lo que se
              hace cuando todavia no hay nada, no cuando ya hay historial. */}
          <Link
            to={`/studyspace/${studyspaceId}/plan`}
            className="rounded-xs border border-transparent px-3 py-1.5 font-heading text-xs uppercase tracking-[0.14em] text-muted transition-colors duration-150 hover:border-rule hover:text-ink"
          >
            Plan
          </Link>
          {total > 0 && (
            <Link
              to={`/studyspace/${studyspaceId}/sessions`}
              className="rounded-xs border border-transparent px-3 py-1.5 font-heading text-xs uppercase tracking-[0.14em] text-muted transition-colors duration-150 hover:border-rule hover:text-ink"
            >
              View all
            </Link>
          )}
          {canStart && (
            <Button variant="quiet" size="sm" onClick={() => setStarting((open) => !open)}>
              {starting ? 'Close' : 'Start session'}
            </Button>
          )}
        </span>
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
        latest && (
          <ul>
            <SessionRow session={latest} />
          </ul>
        )
      )}
    </DetailSection>
  );
};
