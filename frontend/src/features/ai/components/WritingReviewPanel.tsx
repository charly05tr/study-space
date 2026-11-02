import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, ConfirmButton, ErrorState, Spinner } from '../../../components/ui';
import { getAiErrorMessage } from '../api/gemini.api';
import { useDeleteNoteReview, useNoteReviews } from '../hooks/useNoteReviews';
import { useWritingReview } from '../hooks/useWritingReview';
import {
  MAX_REVIEW_CHARS,
  MIN_REVIEW_CHARS,
  SCORE_MAX,
  isReviewTruncated,
} from '../prompts/writingReview';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import type { PartialWritingReview, SavedWritingReview, WritingReview } from '../types';

interface WritingReviewPanelProps {
  /** The note's prose, snapshotted when the panel opened. */
  text: string;
  /** The note the review belongs to; its history is listed in the panel. */
  noteId: number;
  onClose: () => void;
}

const SCORE_LABELS: { key: keyof WritingReview['scores']; label: string }[] = [
  { key: 'grammar', label: 'Grammar' },
  { key: 'vocabulary', label: 'Vocabulary' },
  { key: 'topicMastery', label: 'Topic mastery' },
];

const sectionTitle = 'font-heading text-xs uppercase tracking-[0.18em] text-muted';

/**
 * Read-only feedback on a note. Nothing here writes to the editor: suggestions
 * are shown, never applied.
 */
export const WritingReviewPanel = ({ text, noteId, onClose }: WritingReviewPanelProps) => {
  const isConnected = useAiSettingsStore((state) => state.encryptedKey !== null);
  const { run, start, cancel, dismiss, retrySave } = useWritingReview(noteId);
  const history = useNoteReviews(noteId);
  const deleteReview = useDeleteNoteReview(noteId);
  // A saved review the user opened from the history; null shows the live or latest one.
  const [openedId, setOpenedId] = useState<number | null>(null);
  const opened = history.data?.find((item) => item.id === openedId) ?? null;
  // Newest first, per the API.
  const latest = history.data?.[0] ?? null;

  const trimmed = text.trim();
  const tooShort = trimmed.length < MIN_REVIEW_CHARS;
  const canReview = isConnected && !tooShort;
  const truncated = isReviewTruncated(trimmed);
  const running = run?.status === 'running';
  // The store refuses dismiss and replace while a save is in flight.
  const busy = running || run?.saving === true;
  const unsaved = run?.status === 'done' && run.saveFailed;

  const startReview = () => {
    setOpenedId(null);
    start(noteId, trimmed);
  };

  // History first: a note that already has reviews shows the latest one and
  // waits for "New review". Decided once per open, so cancelling or dismissing
  // the only run does not restart it. A run already in the store (reconnect) or
  // a failed history fetch never blocks: the first reconnects, the second falls
  // back to auto-starting. The store ignores a start while a run is in progress,
  // so StrictMode's double effect cannot start two.
  // Fresh data only: with the panel closed nothing observes the query, so a
  // reopen sees the cached list first and then refetches. Deciding on that
  // stale list could start a second review for a run that just finished.
  const historySettled =
    (history.isSuccess && history.isFetchedAfterMount && !history.isFetching) || history.isError;
  const decided = useRef(false);
  useEffect(() => {
    if (!canReview || !historySettled || decided.current) return;
    decided.current = true;
    if (!run && !latest) start(noteId, trimmed);
  }, [canReview, historySettled, run, latest, start, noteId, trimmed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <aside
      role="dialog"
      aria-label="AI writing review"
      // A drawer, not a modal: the note stays visible beside it so every quoted
      // passage can be found and compared without closing anything.
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-rule bg-page shadow-lg"
    >
      <header className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <h2 className="font-heading text-sm uppercase tracking-[0.18em] text-ink">AI review</h2>
        <Button variant="quiet" size="sm" onClick={onClose} aria-label="Close review">
          Close
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {truncated && canReview && (
          <p className="mb-5 text-sm text-muted" role="note">
            This note is long, so only the first {MAX_REVIEW_CHARS.toLocaleString('en-US')}{' '}
            characters were reviewed.
          </p>
        )}
        {canReview && (historySettled || run) && (
          <div className="mb-5 flex items-center gap-2">
            {unsaved ? (
              <ConfirmButton confirmLabel="Discard unsaved review?" disabled={busy} onConfirm={startReview}>
                New review
              </ConfirmButton>
            ) : (
              <Button variant="quiet" size="sm" disabled={busy} onClick={startReview}>
                New review
              </Button>
            )}
            {running && (
              <Button variant="quiet" size="sm" onClick={() => cancel(noteId)}>
                Cancel
              </Button>
            )}
          </div>
        )}
        {opened ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted">Saved review from {formatDate(opened.created_at)}</p>
              <Button variant="quiet" size="sm" onClick={() => setOpenedId(null)}>
                Back
              </Button>
            </div>
            <ReviewResult review={opened.result} />
          </div>
        ) : !isConnected ? (
          <Message>
            {run?.status === 'error'
              ? getAiErrorMessage(run.error)
              : 'Add your Gemini API key to get feedback on your writing.'}{' '}
            <Link to="/profile" className="text-ink underline underline-offset-2">
              Open your profile
            </Link>
            .
          </Message>
        ) : tooShort ? (
          <Message>
            Write a little more first. A review needs at least {MIN_REVIEW_CHARS} characters of
            text to say anything useful.
          </Message>
        ) : run?.status === 'running' ? (
          run.partial ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3 text-sm text-muted" role="status">
                <Spinner size="sm" label={null} />
                Writing your review…
              </div>
              <ReviewResult review={run.partial} streaming />
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm text-muted" role="status">
              <Spinner size="sm" label={null} />
              Reading your note…
            </div>
          )
        ) : run?.status === 'error' ? (
          <div className="flex flex-col items-start gap-3">
            <ErrorState
              title="Could not review this note"
              message={getAiErrorMessage(run.error)}
              onRetry={startReview}
            />
            <Button variant="quiet" size="sm" onClick={() => dismiss(noteId)}>
              Dismiss
            </Button>
          </div>
        ) : run?.status === 'done' && run.result ? (
          <>
            {run.saveFailed && (
              <div className="mb-5 flex flex-col items-start gap-2" role="note">
                <p className="text-sm text-muted">This review could not be saved to your history.</p>
                <div className="flex items-center gap-2">
                  <Button variant="quiet" size="sm" onClick={() => retrySave(noteId)}>
                    Retry save
                  </Button>
                  <Button variant="quiet" size="sm" onClick={() => dismiss(noteId)}>
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
            <ReviewResult review={run.result} />
          </>
        ) : latest ? (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-muted">Latest review from {formatDate(latest.created_at)}</p>
            <ReviewResult review={latest.result} />
          </div>
        ) : history.isPending ? (
          <div className="flex items-center gap-3 text-sm text-muted" role="status">
            <Spinner size="sm" label={null} />
            Loading your reviews…
          </div>
        ) : (
          <Message>No review yet. Start one to get feedback on this note.</Message>
        )}

        {history.data && history.data.length > 0 && (
          <ReviewHistory
            reviews={history.data}
            openedId={openedId}
            deleting={deleteReview.isPending}
            onOpen={setOpenedId}
            onDelete={(id) => {
              if (id === openedId) setOpenedId(null);
              deleteReview.mutate(id);
            }}
          />
        )}
      </div>
    </aside>
  );
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

interface ReviewHistoryProps {
  reviews: SavedWritingReview[];
  openedId: number | null;
  deleting: boolean;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
}

const ReviewHistory = ({ reviews, openedId, deleting, onOpen, onDelete }: ReviewHistoryProps) => (
  <section className="mt-8 flex flex-col gap-3 border-t border-rule pt-5" aria-label="Review history">
    <h3 className={sectionTitle}>History ({reviews.length})</h3>
    <ul className="flex flex-col gap-2">
      {reviews.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpen(item.id)}
            aria-current={item.id === openedId}
            className={`flex flex-1 flex-col gap-0.5 border-l-2 pl-3 text-left ${
              item.id === openedId ? 'border-primary' : 'border-rule hover:border-ink'
            }`}
          >
            <span className="text-sm text-ink">{formatDate(item.created_at)}</span>
            <span className="text-xs text-muted">
              Grammar {item.result.scores.grammar} · Vocabulary {item.result.scores.vocabulary} ·
              Topic {item.result.scores.topicMastery}
            </span>
          </button>
          <ConfirmButton
            confirmLabel="Delete review?"
            disabled={deleting}
            onConfirm={() => onDelete(item.id)}
          >
            Delete
          </ConfirmButton>
        </li>
      ))}
    </ul>
  </section>
);

const Message = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm leading-relaxed text-muted">{children}</p>
);

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

interface ReviewResultProps {
  /** Partial while streaming; every field is guarded because any may be missing. */
  review: PartialWritingReview;
  streaming?: boolean;
}

const ReviewResult = ({ review, streaming = false }: ReviewResultProps) => {
  const scores = SCORE_LABELS.flatMap(({ key, label }) => {
    const value = review.scores?.[key];
    return typeof value === 'number' ? [{ key, label, value }] : [];
  });
  const strengths = Array.isArray(review.strengths) ? review.strengths.filter(isText) : [];
  const issues = Array.isArray(review.issues)
    ? review.issues.filter((issue) => typeof issue === 'object' && issue !== null)
    : [];

  return (
    <div className="flex flex-col gap-7">
      {scores.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Scores">
          <h3 className={sectionTitle}>Scores</h3>
          <dl className="flex flex-col gap-3">
            {scores.map(({ key, label, value }) => (
              <div key={key} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <dt className="font-heading text-sm text-ink">{label}</dt>
                  <dd className="font-heading text-sm text-ink">
                    {value}
                    <span className="text-muted"> / {SCORE_MAX}</span>
                  </dd>
                </div>
                <div className="h-1 bg-rule" aria-hidden>
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${(Math.min(Math.max(value, 0), SCORE_MAX) / SCORE_MAX) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </dl>
        </section>
      )}

      {isText(review.summary) && (
        <section className="flex flex-col gap-2">
          <h3 className={sectionTitle}>Summary</h3>
          <p className="text-sm leading-relaxed text-ink">{review.summary}</p>
        </section>
      )}

      {strengths.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className={sectionTitle}>Strengths</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
            {strengths.map((strength, index) => (
              <li key={index}>{strength}</li>
            ))}
          </ul>
        </section>
      )}

      {(!streaming || issues.length > 0) && (
        <section className="flex flex-col gap-3">
          <h3 className={sectionTitle}>Issues ({issues.length})</h3>
          {issues.length === 0 ? (
            <Message>Nothing to fix. Nice work.</Message>
          ) : (
            <ul className="flex flex-col gap-4">
              {issues.map((issue, index) => (
                <li key={index} className="flex flex-col gap-1.5 border-l-2 border-primary pl-3">
                  {isText(issue.quote) && <p className="text-sm text-ink italic">“{issue.quote}”</p>}
                  {isText(issue.problem) && <p className="text-sm text-muted">{issue.problem}</p>}
                  {isText(issue.suggestion) && (
                    <p className="text-sm text-ink">
                      <span className="font-heading text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                        Try{' '}
                      </span>
                      {issue.suggestion}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};
