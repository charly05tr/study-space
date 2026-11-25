import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  FieldError,
  Skeleton,
  SkeletonText,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useStudyspaceAnnotations } from '../../annotations/hooks/useAnnotations';
import { QuestionForm } from '../components/QuestionForm';
import { QuestionItem } from '../components/QuestionItem';
import { QuizDetailsForm } from '../components/QuizDetailsForm';
import {
  useCreateQuestion,
  useDeleteQuestion,
  useMoveQuestion,
  useUpdateQuestion,
} from '../hooks/useQuestionMutations';
import { usePublishQuiz, useQuiz } from '../hooks/useQuizzes';
import { ORIGIN_LABELS, STATUS_LABELS, STATUS_VARIANTS, questionCountLabel } from '../labels';
import { draftFromQuestion, emptyDraft, movePatches } from '../questionForm';
import { MAX_QUESTIONS_PER_QUIZ } from '../types';
import type { Quiz } from '../types';

const backLinkClasses =
  'font-heading text-xs uppercase tracking-[0.14em] text-muted hover:text-ink';

/** Which question the form is open for: an existing id, a new one, or none. */
type Editing = number | 'new' | null;

/** The editor: quiz details, its questions (create, edit, delete, reorder) and publishing. */
export const QuizEditorPage = () => {
  const { quizId } = useParams();
  const id = Number(quizId);
  const quiz = useQuiz(id);

  if (!Number.isFinite(id)) {
    return (
      <article className="mx-auto flex w-full max-w-measure flex-col gap-6">
        <Link to="/studyspaces" className={backLinkClasses}>
          &larr; All studyspaces
        </Link>
        <EmptyState
          title="Quiz not found"
          description="The link may be wrong, or the quiz may have been deleted."
        />
      </article>
    );
  }

  return (
    <article className="mx-auto flex w-full max-w-measure flex-col gap-6">
      {quiz.isPending && (
        <div className="flex flex-col gap-4" role="status" aria-label="Loading quiz">
          <Skeleton className="h-8 w-1/2" />
          <SkeletonText lines={6} />
        </div>
      )}

      {quiz.isError && (
        <ErrorState
          title="Could not load the quiz"
          message={getApiErrorMessage(quiz.error)}
          onRetry={() => quiz.refetch()}
        />
      )}

      {/* Keyed so a different quiz never inherits the previous one's open form. */}
      {quiz.isSuccess && <QuizEditor key={quiz.data.id} quiz={quiz.data} />}
    </article>
  );
};

const QuizEditor = ({ quiz }: { quiz: Quiz }) => {
  const [editing, setEditing] = useState<Editing>(null);

  const annotations = useStudyspaceAnnotations(quiz.studyspace);
  const publish = usePublishQuiz(quiz.id);
  const create = useCreateQuestion(quiz.id);
  const update = useUpdateQuestion(quiz.id);
  const remove = useDeleteQuestion(quiz.id);
  const move = useMoveQuestion(quiz.id);

  const origins = useMemo(
    () => new Map((annotations.data ?? []).map((annotation) => [annotation.id, annotation])),
    [annotations.data],
  );

  const { questions } = quiz;
  const busy = create.isPending || update.isPending || remove.isPending || move.isPending;
  const atLimit = questions.length >= MAX_QUESTIONS_PER_QUIZ;
  const published = quiz.status === 'published';
  const canPublish = questions.length > 0;

  const close = () => setEditing(null);

  return (
    <>
      <header className="flex flex-col gap-4">
        <Link to={`/studyspace/${quiz.studyspace}/quizzes`} className={backLinkClasses}>
          &larr; All quizzes
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-4xl text-ink">{quiz.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANTS[quiz.status]}>{STATUS_LABELS[quiz.status]}</Badge>
              <Badge variant={quiz.origin === 'ai' ? 'primary' : 'neutral'}>
                {ORIGIN_LABELS[quiz.origin]}
              </Badge>
              <span className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
                {questionCountLabel(questions.length)}
              </span>
            </div>
          </div>

          {!published && (
            <div className="flex flex-col items-end gap-1">
              <Button
                disabled={!canPublish || busy}
                loading={publish.isPending}
                aria-describedby="publish-hint"
                onClick={() => publish.mutate()}
              >
                Publish
              </Button>
              <p id="publish-hint" className="text-xs text-muted">
                {canPublish
                  ? 'Drafts are not studied until published.'
                  : 'Add at least one question to publish.'}
              </p>
            </div>
          )}
        </div>

        {publish.isError && <FieldError message={getApiErrorMessage(publish.error)} />}
        <Divider ornament className="max-w-40" />
      </header>

      <QuizDetailsForm quiz={quiz} />

      <section aria-labelledby="questions-heading" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="questions-heading"
            className="font-heading text-xs uppercase tracking-[0.14em] text-muted"
          >
            Questions
          </h2>
          <Button
            variant="secondary"
            size="sm"
            disabled={editing === 'new' || atLimit}
            onClick={() => {
              create.reset();
              setEditing('new');
            }}
          >
            Add question
          </Button>
        </div>
        {atLimit && (
          <p className="text-sm text-muted">
            A quiz holds at most {MAX_QUESTIONS_PER_QUIZ} questions.
          </p>
        )}

        {editing === 'new' && (
          <QuestionForm
            initial={emptyDraft()}
            annotation={null}
            submitLabel="Add question"
            saving={create.isPending}
            error={create.isError ? getApiErrorMessage(create.error) : undefined}
            onCancel={close}
            onSubmit={(input) => create.mutate(input, { onSuccess: close })}
          />
        )}

        {questions.length === 0 && editing !== 'new' ? (
          <EmptyState
            title="No questions yet"
            description="Add the first question to start building this quiz."
          />
        ) : (
          <ul>
            {questions.map((question, index) =>
              editing === question.id ? (
                <li key={question.id} className="border-b border-rule py-4">
                  <QuestionForm
                    initial={draftFromQuestion(question)}
                    annotation={question.annotation}
                    submitLabel="Save question"
                    saving={update.isPending}
                    error={update.isError ? getApiErrorMessage(update.error) : undefined}
                    onCancel={close}
                    onSubmit={(input) =>
                      update.mutate({ questionId: question.id, payload: input }, { onSuccess: close })
                    }
                  />
                </li>
              ) : (
                <QuestionItem
                  key={question.id}
                  question={question}
                  number={index + 1}
                  origin={question.annotation === null ? undefined : origins.get(question.annotation)}
                  isFirst={index === 0}
                  isLast={index === questions.length - 1}
                  busy={busy}
                  onEdit={() => {
                    create.reset();
                    update.reset();
                    setEditing(question.id);
                  }}
                  onDelete={() => {
                    if (editing === question.id) close();
                    remove.mutate(question.id);
                  }}
                  onMove={(direction) => move.mutate(movePatches(questions, index, direction))}
                />
              ),
            )}
          </ul>
        )}

        {(remove.isError || move.isError) && (
          <FieldError
            message={getApiErrorMessage(remove.isError ? remove.error : move.error)}
          />
        )}
      </section>
    </>
  );
};
