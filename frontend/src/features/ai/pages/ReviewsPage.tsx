import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  ConfirmButton,
  Divider,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonText,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useStudyspace } from '../../studyspaces/hooks/useStudyspace';
import { ReviewResult } from '../components/ReviewResult';
import { formatReviewDate } from '../formatReviewDate';
import { useDeleteReviewFromList, useStudyspaceReviews } from '../hooks/useNoteReviews';
import type { SavedWritingReview } from '../types';

/**
 * Every AI writing review in one studyspace, newest first.
 *
 * The note's own panel lists the history of a single note; this is the same
 * record across all of them, so progress can be read without opening each note.
 */
export const ReviewsPage = () => {
  const { studyspaceId } = useParams();
  const id = Number(studyspaceId);
  // One open at a time: a full review is long and would push the rest away.
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const studyspace = useStudyspace(id);
  const reviews = useStudyspaceReviews(id);
  const remove = useDeleteReviewFromList();

  const items = reviews.data ?? [];

  // `/studyspace/abc/reviews`: the query is disabled for a non-numeric id, so
  // without this the page would show its loading state forever.
  if (!Number.isFinite(id)) {
    return (
      <article className="mx-auto flex w-full max-w-measure flex-col gap-6">
        <Link
          to="/studyspaces"
          className="font-heading text-xs uppercase tracking-[0.14em] text-muted hover:text-ink"
        >
          &larr; All studyspaces
        </Link>
        <EmptyState
          title="Studyspace not found"
          description="The link may be wrong, or the studyspace may have been deleted."
        />
      </article>
    );
  }

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
          <h1 className="font-display text-4xl text-ink">Reviews</h1>
          {studyspace.data && (
            <p className="mt-2 font-heading text-xs uppercase tracking-[0.14em] text-muted">
              {studyspace.data.title}
              {items.length > 0 && ` · ${items.length} in total`}
            </p>
          )}
        </div>

        <Divider ornament className="max-w-40" />
      </header>

      {reviews.isPending && (
        <div className="flex flex-col gap-4" role="status" aria-label="Loading reviews">
          <Skeleton className="h-6 w-1/3" />
          <SkeletonText lines={6} />
        </div>
      )}

      {reviews.isError && (
        <ErrorState
          title="Could not load the reviews"
          message={getApiErrorMessage(reviews.error)}
          onRetry={() => reviews.refetch()}
        />
      )}

      {reviews.isSuccess &&
        (items.length === 0 ? (
          <EmptyState
            title="No reviews yet"
            description="Open a note and use AI review to get feedback on your writing."
          />
        ) : (
          <ul className="flex flex-col">
            {items.map((review) => (
              <ReviewEntry
                key={review.id}
                review={review}
                expanded={review.id === expandedId}
                deleting={remove.isPending}
                onToggle={() => setExpandedId(review.id === expandedId ? null : review.id)}
                onDelete={() => {
                  if (review.id === expandedId) setExpandedId(null);
                  remove.mutate({ reviewId: review.id, noteId: review.note });
                }}
              />
            ))}
          </ul>
        ))}

      {remove.isError && (
        <p role="alert" className="text-sm text-muted">
          Could not delete that review. {getApiErrorMessage(remove.error)}
        </p>
      )}
    </article>
  );
};

interface ReviewEntryProps {
  review: SavedWritingReview;
  expanded: boolean;
  deleting: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

const ReviewEntry = ({ review, expanded, deleting, onToggle, onDelete }: ReviewEntryProps) => {
  const { scores } = review.result;
  const detailId = `review-${review.id}`;

  return (
    <li className="flex flex-col gap-4 border-b border-rule py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            to={`/note/${review.note}`}
            className="truncate font-heading text-sm text-ink underline-offset-2 hover:underline"
          >
            {review.note_title || 'Untitled note'}
          </Link>
          <time
            dateTime={review.created_at}
            className="font-heading text-xs uppercase tracking-[0.14em] text-muted"
          >
            {formatReviewDate(review.created_at)}
          </time>
          <span className="text-xs text-muted">
            Grammar {scores.grammar} · Vocabulary {scores.vocabulary} · Topic {scores.topicMastery}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="quiet"
            size="sm"
            aria-expanded={expanded}
            aria-controls={detailId}
            onClick={onToggle}
          >
            {expanded ? 'Hide' : 'Show'}
          </Button>
          <ConfirmButton confirmLabel="Delete review?" disabled={deleting} onConfirm={onDelete}>
            Delete
          </ConfirmButton>
        </div>
      </div>

      {expanded && (
        <div id={detailId}>
          <ReviewResult review={review.result} />
        </div>
      )}
    </li>
  );
};
