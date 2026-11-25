import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useStudyspace } from '../../studyspaces/hooks/useStudyspace';
import { ReviewSession } from '../components/ReviewSession';
import { useDueQueue } from '../hooks/useFlashcards';
import { useNewLimit } from '../hooks/useNewLimit';
import { MAX_NEW_LIMIT } from '../reviewSession';
import type { Flashcard } from '../types';

const backLinkClasses =
  'font-heading text-xs uppercase tracking-[0.14em] text-muted hover:text-ink';

/** A snapshot of the queue the session runs over, taken when the user starts. */
interface Started {
  cards: Flashcard[];
  newLimit: number;
}

/** Spaced repetition review: pick how many new cards, start, rate, see the summary. */
export const ReviewPage = () => {
  const { studyspaceId } = useParams();
  const id = Number(studyspaceId);

  const [started, setStarted] = useState<Started | null>(null);
  const newLimit = useNewLimit(id);
  const studyspace = useStudyspace(id);
  const due = useDueQueue(id, newLimit.value);

  if (!Number.isFinite(id)) {
    return (
      <article className="mx-auto flex w-full max-w-measure flex-col gap-6">
        <Link to="/studyspaces" className={backLinkClasses}>
          &larr; All studyspaces
        </Link>
        <EmptyState
          title="Studyspace not found"
          description="The link may be wrong, or the studyspace may have been deleted."
        />
      </article>
    );
  }

  const cards = due.data ?? [];

  return (
    <article className="mx-auto flex w-full max-w-measure flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link to={`/studyspace/${id}/flashcards`} className={backLinkClasses}>
          &larr; All flashcards
        </Link>
        <div>
          <h1 className="font-display text-4xl text-ink">Review</h1>
          {studyspace.data && (
            <p className="mt-2 font-heading text-xs uppercase tracking-[0.14em] text-muted">
              {studyspace.data.title}
            </p>
          )}
        </div>
        <Divider ornament className="max-w-40" />
      </header>

      {started ? (
        <ReviewSession
          studyspaceId={id}
          cards={started.cards}
          newLimit={started.newLimit}
          onRestart={() => {
            // The page stayed mounted during the session, so its queue is stale.
            setStarted(null);
            void due.refetch();
          }}
        />
      ) : (
        <>
          <Input
            label="New cards per session"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_NEW_LIMIT}
            value={newLimit.text}
            hint="Cards you have never reviewed are introduced gradually. Reviews that are due always come first."
            className="max-w-32"
            onChange={(event) => newLimit.setText(event.target.value)}
          />

          {due.isPending && (
            <div role="status" aria-label="Loading the queue">
              <Skeleton className="h-10 w-1/2" />
            </div>
          )}

          {due.isError && (
            <ErrorState
              title="Could not load the queue"
              message={getApiErrorMessage(due.error)}
              onRetry={() => due.refetch()}
            />
          )}

          {due.isSuccess &&
            (cards.length === 0 ? (
              <EmptyState
                title="Nothing due"
                description="Every card is scheduled for later, or this studyspace has no flashcards yet."
                action={
                  <Link to={`/studyspace/${id}/flashcards`} className={backLinkClasses}>
                    Browse flashcards
                  </Link>
                }
              />
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p role="status" className="text-ink">
                  {cards.length} {cards.length === 1 ? 'card' : 'cards'} ready for this session.
                </p>
                <Button
                  size="lg"
                  disabled={due.isFetching}
                  onClick={() => setStarted({ cards, newLimit: newLimit.value })}
                >
                  Start review
                </Button>
              </div>
            ))}
        </>
      )}
    </article>
  );
};
