import { SCORE_MAX } from '../prompts/writingReview';
import type { PartialWritingReview, WritingReview } from '../types';

const SCORE_LABELS: { key: keyof WritingReview['scores']; label: string }[] = [
  { key: 'grammar', label: 'Grammar' },
  { key: 'vocabulary', label: 'Vocabulary' },
  { key: 'topicMastery', label: 'Topic mastery' },
];

export const sectionTitle = 'font-heading text-xs uppercase tracking-[0.18em] text-muted';

export const Message = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm leading-relaxed text-muted">{children}</p>
);

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

interface ReviewResultProps {
  /** Partial while streaming; every field is guarded because any may be missing. */
  review: PartialWritingReview;
  streaming?: boolean;
}

export const ReviewResult = ({ review, streaming = false }: ReviewResultProps) => {
  const scores = SCORE_LABELS.flatMap(({ key, label }) => {
    const value = review.scores?.[key];
    return typeof value === 'number' ? [{ key, label, value }] : [];
  });
  const strengths = Array.isArray(review.strengths) ? review.strengths.filter(isText) : [];
  const issues = Array.isArray(review.issues)
    ? review.issues.filter((issue) => typeof issue === 'object' && issue !== null)
    : [];
  // Optional: reviews saved before the follow-up existed do not have it, and
  // while streaming it is the last thing to arrive.
  const followUp =
    typeof review.followUp === 'object' && review.followUp !== null ? review.followUp : null;
  const overview = isText(followUp?.overview) ? followUp.overview : null;
  const steps = Array.isArray(followUp?.steps) ? followUp.steps.filter(isText) : [];

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

      {(overview || steps.length > 0) && (
        <section className="flex flex-col gap-3" aria-label="How to improve your writing">
          <h3 className={sectionTitle}>How to improve your writing</h3>
          {overview && <p className="text-sm leading-relaxed text-ink">{overview}</p>}
          {steps.length > 0 && (
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink">
              {steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
};
