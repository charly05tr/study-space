import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Divider,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonText,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { StudyRun } from '../components/StudyRun';
import { useQuiz } from '../hooks/useQuizzes';
import { questionCountLabel } from '../labels';
import type { Question, Quiz } from '../types';

const backLinkClasses =
  'font-heading text-xs uppercase tracking-[0.14em] text-muted hover:text-ink';

const newSeed = () => Math.floor(Math.random() * 2 ** 32);

/** Study mode: one question at a time over a published quiz. Attempts are not saved. */
export const QuizStudyPage = () => {
  const { quizId } = useParams();
  const id = Number(quizId);
  const quiz = useQuiz(id);

  if (!Number.isFinite(id)) {
    return (
      <Shell backTo="/studyspaces" backLabel="All studyspaces">
        <EmptyState
          title="Quiz not found"
          description="The link may be wrong, or the quiz may have been deleted."
        />
      </Shell>
    );
  }

  return (
    <article className="mx-auto flex w-full max-w-measure flex-col gap-6">
      {quiz.isPending && (
        <div className="flex flex-col gap-4" role="status" aria-label="Loading quiz">
          <Skeleton className="h-8 w-1/2" />
          <SkeletonText lines={4} />
        </div>
      )}

      {quiz.isError && (
        <ErrorState
          title="Could not load the quiz"
          message={getApiErrorMessage(quiz.error)}
          onRetry={() => quiz.refetch()}
        />
      )}

      {quiz.isSuccess && <QuizStudy key={quiz.data.id} quiz={quiz.data} />}
    </article>
  );
};

const Shell = ({
  backTo,
  backLabel,
  children,
}: {
  backTo: string;
  backLabel: string;
  children: React.ReactNode;
}) => (
  <article className="mx-auto flex w-full max-w-measure flex-col gap-6">
    <Link to={backTo} className={backLinkClasses}>
      &larr; {backLabel}
    </Link>
    {children}
  </article>
);

/** The question set and seed of the run on screen. `subset` null means the whole quiz. */
interface RunSetup {
  runId: number;
  subset: Question[] | null;
  seed: number;
}

const QuizStudy = ({ quiz }: { quiz: Quiz }) => {
  const [setup, setSetup] = useState<RunSetup>(() => ({ runId: 0, subset: null, seed: newSeed() }));

  const editorLink = `/studyspace/${quiz.studyspace}/quizzes/${quiz.id}`;
  const questions = setup.subset ?? quiz.questions;

  const restart = (subset: Question[] | null) =>
    setSetup((current) => ({ runId: current.runId + 1, subset, seed: newSeed() }));

  return (
    <>
      <header className="flex flex-col gap-4">
        <Link to={editorLink} className={backLinkClasses}>
          &larr; Back to quiz
        </Link>
        <div>
          <h1 className="font-display text-4xl text-ink">{quiz.title}</h1>
          <p className="mt-2 font-heading text-xs uppercase tracking-[0.14em] text-muted">
            Study
            {setup.subset
              ? ` · retrying ${questionCountLabel(setup.subset.length)}`
              : ` · ${questionCountLabel(quiz.questions.length)}`}
          </p>
        </div>
        <Divider ornament className="max-w-40" />
      </header>

      {quiz.status !== 'published' ? (
        <EmptyState
          title="This quiz is still a draft"
          description="Publish it from the editor to study it."
          action={
            <Link to={editorLink} className={backLinkClasses}>
              Open the editor
            </Link>
          }
        />
      ) : quiz.questions.length === 0 ? (
        <EmptyState
          title="No questions to study"
          description="Add questions in the editor first."
          action={
            <Link to={editorLink} className={backLinkClasses}>
              Open the editor
            </Link>
          }
        />
      ) : (
        <StudyRun
          key={setup.runId}
          questions={questions}
          seed={setup.seed}
          onRetry={restart}
          onRestartAll={() => restart(null)}
        />
      )}
    </>
  );
};
