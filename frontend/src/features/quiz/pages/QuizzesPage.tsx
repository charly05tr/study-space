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
import { NewQuizForm } from '../components/NewQuizForm';
import { QuizCard } from '../components/QuizCard';
import { QuizRunStatus } from '../components/QuizRunStatus';
import { useQuizGeneration } from '../hooks/useQuizGeneration';
import { useDeleteQuiz, useStudyspaceQuizzes } from '../hooks/useQuizzes';

const backLinkClasses =
  'font-heading text-xs uppercase tracking-[0.14em] text-muted hover:text-ink';

/** Every quiz in one studyspace, drafts included. */
export const QuizzesPage = () => {
  const { studyspaceId } = useParams();
  const id = Number(studyspaceId);
  const [creating, setCreating] = useState(false);

  const studyspace = useStudyspace(id);
  const quizzes = useStudyspaceQuizzes(id);
  const remove = useDeleteQuiz(id);
  const { run, cancel, dismiss, retrySave } = useQuizGeneration(id);

  const items = quizzes.data ?? [];

  // `/studyspace/abc/quizzes`: the queries are disabled for a non-numeric id,
  // so without this the page would show its loading state forever.
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

  return (
    <article className="mx-auto flex w-full max-w-measure flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link to={`/studyspace/${id}`} className={backLinkClasses}>
          &larr; Back to studyspace
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl text-ink">Quizzes</h1>
            {studyspace.data && (
              <p className="mt-2 font-heading text-xs uppercase tracking-[0.14em] text-muted">
                {studyspace.data.title}
                {items.length > 0 && ` · ${items.length} in total`}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
              New quiz
            </Button>
            <Link
              to={`/studyspace/${id}/quizzes/generate`}
              className="inline-flex items-center justify-center rounded-xs border border-primary bg-primary px-3 py-1.5 font-heading text-xs uppercase tracking-[0.14em] text-on-primary transition-colors duration-150 hover:border-primary-400 hover:bg-primary-400"
            >
              Generate with AI
            </Link>
          </div>
        </div>

        <Divider ornament className="max-w-40" />
      </header>

      {/* A generation started on the generator keeps running after leaving it. */}
      {run && (
        <QuizRunStatus
          studyspaceId={id}
          run={run}
          onCancel={() => cancel(id)}
          onDismiss={() => dismiss(id)}
          onRetrySave={() => retrySave(id)}
        />
      )}

      {creating && <NewQuizForm studyspaceId={id} onCancel={() => setCreating(false)} />}

      {quizzes.isPending && (
        <div className="flex flex-col gap-4" role="status" aria-label="Loading quizzes">
          <Skeleton className="h-6 w-1/3" />
          <SkeletonText lines={6} />
        </div>
      )}

      {quizzes.isError && (
        <ErrorState
          title="Could not load the quizzes"
          message={getApiErrorMessage(quizzes.error)}
          onRetry={() => quizzes.refetch()}
        />
      )}

      {quizzes.isSuccess &&
        (items.length === 0 ? (
          <EmptyState
            title="No quizzes yet"
            description="Write one by hand with New quiz, or generate one from your highlights."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {items.map((quiz) => (
              <li key={quiz.id}>
                <QuizCard
                  quiz={quiz}
                  deleting={remove.isPending && remove.variables === quiz.id}
                  onDelete={() => remove.mutate(quiz.id)}
                />
              </li>
            ))}
          </ul>
        ))}

      {remove.isError && (
        <p role="alert" className="text-sm text-muted">
          Could not delete that quiz. {getApiErrorMessage(remove.error)}
        </p>
      )}
    </article>
  );
};
