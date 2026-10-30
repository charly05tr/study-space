import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button, ErrorState, Spinner } from '../../../components/ui';
import { getAiErrorMessage } from '../api/gemini.api';
import { useWritingReview } from '../hooks/useWritingReview';
import {
  MAX_REVIEW_CHARS,
  MIN_REVIEW_CHARS,
  SCORE_MAX,
  isReviewTruncated,
} from '../prompts/writingReview';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import type { WritingReview } from '../types';

interface WritingReviewPanelProps {
  /** The note's prose, snapshotted when the panel opened. */
  text: string;
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
export const WritingReviewPanel = ({ text, onClose }: WritingReviewPanelProps) => {
  const isConnected = useAiSettingsStore((state) => state.encryptedKey !== null);
  const review = useWritingReview();

  const trimmed = text.trim();
  const tooShort = trimmed.length < MIN_REVIEW_CHARS;
  const canReview = isConnected && !tooShort;
  const truncated = isReviewTruncated(trimmed);

  // A ref guard, not `review.isIdle`: StrictMode runs this effect twice before
  // the first mutation has had a chance to leave the idle state.
  const started = useRef(false);
  useEffect(() => {
    if (!canReview || started.current) return;
    started.current = true;
    review.mutate(trimmed);
  }, [canReview, trimmed, review]);

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
        {!isConnected ? (
          <Message>
            {review.isError
              ? getAiErrorMessage(review.error)
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
        ) : review.isPending ? (
          <div className="flex items-center gap-3 text-sm text-muted" role="status">
            <Spinner size="sm" label={null} />
            Reading your note…
          </div>
        ) : review.isError ? (
          <ErrorState
            title="Could not review this note"
            message={getAiErrorMessage(review.error)}
            onRetry={() => review.mutate(trimmed)}
          />
        ) : review.data ? (
          <ReviewResult review={review.data} />
        ) : null}
      </div>
    </aside>
  );
};

const Message = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm leading-relaxed text-muted">{children}</p>
);

const ReviewResult = ({ review }: { review: WritingReview }) => (
  <div className="flex flex-col gap-7">
    <section className="flex flex-col gap-3" aria-label="Scores">
      <h3 className={sectionTitle}>Scores</h3>
      <dl className="flex flex-col gap-3">
        {SCORE_LABELS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <dt className="font-heading text-sm text-ink">{label}</dt>
              <dd className="font-heading text-sm text-ink">
                {review.scores[key]}
                <span className="text-muted"> / {SCORE_MAX}</span>
              </dd>
            </div>
            <div className="h-1 bg-rule" aria-hidden>
              <div
                className="h-full bg-primary"
                style={{ width: `${(review.scores[key] / SCORE_MAX) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </dl>
    </section>

    {review.summary && (
      <section className="flex flex-col gap-2">
        <h3 className={sectionTitle}>Summary</h3>
        <p className="text-sm leading-relaxed text-ink">{review.summary}</p>
      </section>
    )}

    {review.strengths.length > 0 && (
      <section className="flex flex-col gap-2">
        <h3 className={sectionTitle}>Strengths</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
          {review.strengths.map((strength, index) => (
            <li key={index}>{strength}</li>
          ))}
        </ul>
      </section>
    )}

    <section className="flex flex-col gap-3">
      <h3 className={sectionTitle}>Issues ({review.issues.length})</h3>
      {review.issues.length === 0 ? (
        <Message>Nothing to fix. Nice work.</Message>
      ) : (
        <ul className="flex flex-col gap-4">
          {review.issues.map((issue, index) => (
            <li key={index} className="flex flex-col gap-1.5 border-l-2 border-primary pl-3">
              {issue.quote && <p className="text-sm text-ink italic">“{issue.quote}”</p>}
              <p className="text-sm text-muted">{issue.problem}</p>
              {issue.suggestion && (
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
  </div>
);
