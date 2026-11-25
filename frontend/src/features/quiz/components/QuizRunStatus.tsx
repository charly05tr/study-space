import { Link } from 'react-router-dom';
import { Button, ErrorState, Spinner } from '../../../components/ui';
import { getAiErrorMessage } from '../../ai/api/gemini.api';
import type { QuizRunEntry } from '../store/quizRunsStore';

interface QuizRunStatusProps {
  studyspaceId: number;
  run: QuizRunEntry;
  onCancel: () => void;
  onDismiss: () => void;
  onRetrySave: () => void;
}

/** What a background generation is doing: progress, failure, or a draft ready to open. */
export const QuizRunStatus = ({
  studyspaceId,
  run,
  onCancel,
  onDismiss,
  onRetrySave,
}: QuizRunStatusProps) => {
  if (run.status === 'error') {
    return (
      <ErrorState
        title="Could not generate the quiz"
        message={getAiErrorMessage(run.error)}
        onRetry={onDismiss}
        retryLabel="Dismiss"
      />
    );
  }

  if (run.status === 'saved' && run.quizId !== null) {
    return (
      <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xs border border-success/30 bg-success-soft px-5 py-4">
        <p className="text-sm text-ink">
          Your quiz draft is ready: {run.result?.questions.length ?? 0} questions.
        </p>
        <div className="flex gap-2">
          <Link
            to={`/studyspace/${studyspaceId}/quizzes/${run.quizId}`}
            onClick={onDismiss}
            className="font-heading text-xs uppercase tracking-[0.14em] text-ink underline underline-offset-4"
          >
            Review draft
          </Link>
          <Button variant="quiet" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    );
  }

  if (run.status === 'done' && run.saveFailed) {
    return (
      <ErrorState
        title="The quiz was generated but not saved"
        message="Saving the draft failed. Your result is kept: try saving it again."
        onRetry={onRetrySave}
        retryLabel="Retry save"
      />
    );
  }

  const counted = run.partial?.questions?.length ?? 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xs border border-rule px-5 py-4"
    >
      <p className="flex items-center gap-3 text-sm text-ink">
        <Spinner size="sm" label={null} />
        {run.status === 'done'
          ? 'Saving the draft...'
          : counted > 0
            ? `Writing questions... ${counted} so far`
            : 'Reading your annotations...'}
      </p>
      {run.status === 'running' && (
        <Button variant="quiet" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
};
