import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonText,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useStudyspace } from '../../studyspaces/hooks/useStudyspace';
import { useSessionHistory } from '../hooks/useStudySessions';
import { SessionRow } from '../components/SessionRow';

/**
 * The whole history for one studyspace.
 *
 * Deliberately plain: a record you scan, not a dashboard. The studyspace page
 * carries the running session and the last one — everything else is here.
 */
export const SessionsPage = () => {
  const { studyspaceId } = useParams();
  const id = Number(studyspaceId);
  const [page, setPage] = useState(1);

  const studyspace = useStudyspace(id);
  const history = useSessionHistory(id, page);

  const sessions = history.data?.results ?? [];
  const total = history.data?.count ?? 0;

  return (
    <article className="mx-auto flex w-full max-w-measure flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link
          to={`/studyspace/${id}`}
          className="font-heading text-xs uppercase tracking-[0.14em] text-muted hover:text-ink"
        >
          &larr; Back to studyspace
        </Link>

        <div>
          <h1 className="font-display text-4xl text-ink">Sessions</h1>
          {studyspace.data && (
            <p className="mt-2 font-heading text-xs uppercase tracking-[0.14em] text-muted">
              {studyspace.data.title}
              {total > 0 && ` · ${total} in total`}
            </p>
          )}
        </div>

        <Divider ornament className="max-w-40" />
      </header>

      {history.isPending && (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-6 w-1/3" />
          <SkeletonText lines={6} />
        </div>
      )}

      {history.isError && (
        <ErrorState
          title="Could not load the sessions"
          message={getApiErrorMessage(history.error)}
          onRetry={() => history.refetch()}
        />
      )}

      {history.isSuccess &&
        (total === 0 ? (
          <EmptyState
            title="No sessions yet"
            description="Start one from the studyspace to work in timed stretches."
          />
        ) : (
          <>
            <ul>
              {sessions.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </ul>

            {/* Two buttons and a position, not a numbered pager: the history is
                read backwards from the most recent, so "further back" and
                "nearer" is the whole vocabulary anyone needs here. */}
            {(history.data.previous || history.data.next) && (
              <nav className="flex items-center justify-between gap-3 pt-2">
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={!history.data.previous}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  &larr; Newer
                </Button>
                <span className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
                  Page {page}
                </span>
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={!history.data.next}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Older &rarr;
                </Button>
              </nav>
            )}
          </>
        ))}
    </article>
  );
};
