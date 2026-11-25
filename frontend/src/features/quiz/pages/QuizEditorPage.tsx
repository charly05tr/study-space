import { Link, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, Skeleton, SkeletonText } from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useQuiz } from '../hooks/useQuizzes';

/** Placeholder until the editor lands: shows the quiz so the route is usable. */
export const QuizEditorPage = () => {
  const { studyspaceId, quizId } = useParams();
  const spaceId = Number(studyspaceId);
  const id = Number(quizId);
  const quiz = useQuiz(id);

  return (
    <article className="mx-auto flex w-full max-w-measure flex-col gap-6">
      <Link
        to={`/studyspace/${spaceId}/quizzes`}
        className="font-heading text-xs uppercase tracking-[0.14em] text-muted hover:text-ink"
      >
        &larr; All quizzes
      </Link>

      {!Number.isFinite(id) && <EmptyState title="Quiz not found" />}

      {quiz.isPending && Number.isFinite(id) && (
        <div className="flex flex-col gap-4" role="status" aria-label="Loading quiz">
          <Skeleton className="h-8 w-1/2" />
          <SkeletonText lines={5} />
        </div>
      )}

      {quiz.isError && (
        <ErrorState
          title="Could not load the quiz"
          message={getApiErrorMessage(quiz.error)}
          onRetry={() => quiz.refetch()}
        />
      )}

      {quiz.isSuccess && <h1 className="font-display text-4xl text-ink">{quiz.data.title}</h1>}
    </article>
  );
};
