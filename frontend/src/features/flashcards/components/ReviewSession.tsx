import { useEffect, useReducer, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button, Divider, EmptyState, FieldError, cn } from '../../../components/ui';
import type { ButtonVariant } from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { flashcardsApi } from '../api/flashcards.api';
import { useReviewFlashcard } from '../hooks/useFlashcards';
import {
  initSession,
  ratingBreakdown,
  ratingForKey,
  remainingNewLimit,
  sessionProgress,
  sessionReducer,
} from '../reviewSession';
import type { SessionState } from '../reviewSession';
import { RATINGS, RATING_LABELS } from '../types';
import type { Flashcard, Rating } from '../types';

interface ReviewSessionProps {
  studyspaceId: number;
  /** The queue at the moment the session started. */
  cards: Flashcard[];
  newLimit: number;
  /** Leaves the summary for the start screen, which re-reads the queue. */
  onRestart: () => void;
}

const RATING_VARIANT: Record<Rating, ButtonVariant> = {
  1: 'danger',
  2: 'secondary',
  3: 'primary',
  4: 'secondary',
};

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** A review session over a fixed queue: front, reveal, rate, repeat, summary. */
export const ReviewSession = ({ studyspaceId, cards, newLimit, onRestart }: ReviewSessionProps) => {
  const [state, dispatch] = useReducer(sessionReducer, cards, initSession);
  const review = useReviewFlashcard();
  const cardRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  const current = state.queue[0] as Flashcard | undefined;
  const reviewing = state.phase === 'reviewing' && current !== undefined;
  const submitting = review.isPending;

  const reveal = () => dispatch({ type: 'reveal' });

  const rate = (rating: Rating) => {
    // One request at a time: a double press must not rate the card twice.
    if (!reviewing || !state.revealed || submitting) return;
    review.mutate(
      { card: current, rating },
      {
        onSuccess: ({ alreadyReviewed }) =>
          dispatch(
            alreadyReviewed
              ? { type: 'already_reviewed', cardId: current.id }
              : { type: 'rated', rating },
          ),
      },
    );
  };

  // The queue ran dry: ask the server once whether a card (an Again, say) is due again.
  useEffect(() => {
    if (state.phase !== 'refilling') return;
    let cancelled = false;
    flashcardsApi
      .due(studyspaceId, { newLimit: remainingNewLimit(state, newLimit) })
      .then((fresh) => {
        if (!cancelled) dispatch({ type: 'refilled', cards: fresh });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'refill_failed' });
      });
    return () => {
      cancelled = true;
    };
    // The budget is read once, when the refill starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, studyspaceId]);

  // Keyboard: Space or Enter reveals, 1-4 rate once the answer is showing.
  useEffect(() => {
    if (!reviewing) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (!state.revealed) {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          dispatch({ type: 'reveal' });
        }
        return;
      }

      const rating = ratingForKey(event.key);
      if (rating !== null) {
        event.preventDefault();
        rate(rating);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Focus follows the card: the answer when it appears, the next question otherwise.
  const currentId = current?.id;
  const revealed = state.revealed;
  useEffect(() => {
    if (currentId === undefined) return;
    (revealed ? answerRef : cardRef).current?.focus();
  }, [currentId, revealed]);

  if (state.phase === 'refilling') {
    return (
      <p role="status" className="text-sm text-muted">
        Checking for cards that are due again&hellip;
      </p>
    );
  }

  if (state.phase === 'done') {
    return <Summary state={state} studyspaceId={studyspaceId} onRestart={onRestart} />;
  }

  if (!current) return null;

  const { position, total } = sessionProgress(state);

  return (
    <section aria-label="Review session" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
            Card {position} of {total}
          </p>
          <Link
            to={`/studyspace/${studyspaceId}/flashcards`}
            className="font-heading text-xs uppercase tracking-[0.14em] text-muted hover:text-ink"
          >
            End session
          </Link>
        </div>
        <div
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={state.reviewed}
          className="h-1 w-full bg-rule"
        >
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${(state.reviewed / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Keyed so each card starts from a clean, unfocused panel. */}
      <div key={current.id} className="flex flex-col gap-4">
        <div
          ref={cardRef}
          tabIndex={-1}
          className="flex flex-col gap-2 rounded-xs border border-rule p-6 outline-none focus-visible:border-primary"
        >
          <h2 className="font-heading text-xs uppercase tracking-[0.14em] text-muted">Front</h2>
          <p className="whitespace-pre-wrap text-lg text-ink">{current.front}</p>
        </div>

        {/* aria-live so the answer is read out when it appears. */}
        <div
          ref={answerRef}
          tabIndex={-1}
          aria-live="polite"
          className={cn(
            'flex flex-col gap-2 rounded-xs outline-none',
            state.revealed && 'border border-primary-200 p-6 focus-visible:border-primary',
          )}
        >
          {state.revealed && (
            <>
              <h2 className="font-heading text-xs uppercase tracking-[0.14em] text-muted">Back</h2>
              <p className="whitespace-pre-wrap text-lg text-ink">{current.back}</p>
            </>
          )}
        </div>

        {state.revealed ? (
          <div className="flex flex-col gap-2">
            <div role="group" aria-label="How well did you remember it?" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATINGS.map((rating) => (
                <Button
                  key={rating}
                  variant={RATING_VARIANT[rating]}
                  disabled={submitting}
                  loading={submitting && review.variables?.rating === rating}
                  aria-keyshortcuts={String(rating)}
                  onClick={() => rate(rating)}
                >
                  {RATING_LABELS[rating]}
                  <span aria-hidden className="text-[0.65rem] opacity-70">
                    {rating}
                  </span>
                </Button>
              ))}
            </div>
            {review.isError && (
              <FieldError
                message={`Could not save that rating. ${getApiErrorMessage(review.error)} Pick a rating to try again.`}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <Button aria-keyshortcuts="Space Enter" onClick={reveal}>
              Show answer
            </Button>
            <p className="text-xs text-muted">Space or Enter reveals the answer; 1-4 then rate it.</p>
          </div>
        )}
      </div>
    </section>
  );
};

interface SummaryProps {
  state: SessionState;
  studyspaceId: number;
  onRestart: () => void;
}

const Summary = ({ state, studyspaceId, onRestart }: SummaryProps) => {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  if (state.reviewed === 0) {
    return (
      <EmptyState
        title="Nothing due"
        description="Every card is scheduled for later. Come back when one is due."
        action={
          <Link
            to={`/studyspace/${studyspaceId}/flashcards`}
            className="font-heading text-xs uppercase tracking-[0.14em] text-muted hover:text-ink"
          >
            Back to flashcards
          </Link>
        }
      />
    );
  }

  return (
    <section aria-labelledby="summary-heading" className="flex flex-col gap-5">
      <div>
        <h2
          id="summary-heading"
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-3xl text-ink outline-none"
        >
          Session complete
        </h2>
        <p role="status" className="mt-1 text-sm text-muted">
          You reviewed {state.reviewed} {state.reviewed === 1 ? 'card' : 'cards'}.
        </p>
      </div>

      <Divider ornament className="max-w-40" />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ratingBreakdown(state.counts).map(({ rating, count }) => (
          <div key={rating} className="rounded-xs border border-rule px-4 py-3">
            <dt className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
              {RATING_LABELS[rating]}
            </dt>
            <dd className="font-display text-2xl text-ink">{count}</dd>
          </div>
        ))}
      </dl>

      {state.refillFailed && (
        <FieldError message="Could not check for cards that are due again. Study again to look once more." />
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={onRestart}>Study again</Button>
        <Link
          to={`/studyspace/${studyspaceId}/flashcards`}
          className="inline-flex items-center justify-center rounded-xs border border-ink px-5 py-2.5 font-heading text-sm uppercase tracking-[0.14em] text-ink transition-colors duration-150 hover:bg-tint"
        >
          Back to flashcards
        </Link>
      </div>
    </section>
  );
};
