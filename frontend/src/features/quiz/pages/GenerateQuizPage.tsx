import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  FieldError,
  Input,
  Skeleton,
  SkeletonText,
  Textarea,
  cn,
  labelClasses,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useAiSettingsStore } from '../../ai/store/aiSettingsStore';
import { useStudyspaceAnnotations } from '../../annotations/hooks/useAnnotations';
import { useStudyspace } from '../../studyspaces/hooks/useStudyspace';
import {
  MAX_QUIZ_SOURCE_CHARS,
  countSourceChars,
  groupBySource,
  isOverSourceLimit,
  selectAnnotations,
} from '../annotationSelection';
import { AnnotationSelector } from '../components/AnnotationSelector';
import { QuizRunStatus } from '../components/QuizRunStatus';
import { useQuizGeneration } from '../hooks/useQuizGeneration';
import {
  DEFAULT_QUIZ_QUESTIONS,
  MAX_QUIZ_QUESTIONS,
  MIN_QUIZ_QUESTIONS,
} from '../prompts/quizGeneration';
import { QUESTION_TYPES, QUESTION_TYPE_LABELS } from '../types';
import type { QuestionType } from '../types';

const backLinkClasses =
  'font-heading text-xs uppercase tracking-[0.14em] text-muted hover:text-ink';

const parseCount = (text: string): number | null => {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text);
  return value >= MIN_QUIZ_QUESTIONS && value <= MAX_QUIZ_QUESTIONS ? value : null;
};

/** Builds a quiz draft from the studyspace's highlights and notes with the user's AI key. */
export const GenerateQuizPage = () => {
  const { studyspaceId } = useParams();
  const id = Number(studyspaceId);
  const navigate = useNavigate();

  const hasKey = useAiSettingsStore((state) => state.encryptedKey !== null);
  const studyspace = useStudyspace(id);
  const annotations = useStudyspaceAnnotations(id);
  const { run, start, cancel, dismiss, retrySave } = useQuizGeneration(id);

  const [topic, setTopic] = useState('');
  const [countText, setCountText] = useState(String(DEFAULT_QUIZ_QUESTIONS));
  const [types, setTypes] = useState<ReadonlySet<QuestionType>>(new Set(QUESTION_TYPES));
  // The unchecked ids, not the checked: everything starts checked, and an
  // annotation that arrives later is checked too.
  const [unchecked, setUnchecked] = useState<ReadonlySet<number>>(new Set());

  // The draft is saved by the background run; once it exists, go and edit it.
  const savedQuizId = run?.status === 'saved' ? run.quizId : null;
  useEffect(() => {
    if (savedQuizId === null) return;
    dismiss(id);
    navigate(`/studyspace/${id}/quizzes/${savedQuizId}`);
  }, [savedQuizId, dismiss, id, navigate]);

  const usable = useMemo(
    () => (annotations.data ?? []).filter((annotation) => annotation.content.trim()),
    [annotations.data],
  );
  const groups = useMemo(() => groupBySource(usable), [usable]);
  const selected = useMemo(() => selectAnnotations(usable, unchecked), [usable, unchecked]);
  const chars = countSourceChars(selected);
  const overLimit = isOverSourceLimit(chars);
  const count = parseCount(countText);

  const busy = run?.status === 'running' || run?.status === 'done' || run?.status === 'saved';

  const blocker = !topic.trim()
    ? 'Write what the quiz should focus on.'
    : count === null
      ? `Choose between ${MIN_QUIZ_QUESTIONS} and ${MAX_QUIZ_QUESTIONS} questions.`
      : types.size === 0
        ? 'Pick at least one question type.'
        : selected.length === 0
          ? 'Check at least one annotation.'
          : overLimit
            ? 'The selected text is too long. Uncheck some annotations.'
            : null;

  const toggleType = (type: QuestionType, checked: boolean) => {
    const next = new Set(types);
    if (checked) next.add(type);
    else next.delete(type);
    setTypes(next);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (blocker || count === null || busy) return;
    start(id, {
      topic: topic.trim(),
      count,
      types: QUESTION_TYPES.filter((type) => types.has(type)),
      annotations: selected,
    });
  };

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
        <Link to={`/studyspace/${id}/quizzes`} className={backLinkClasses}>
          &larr; All quizzes
        </Link>
        <div>
          <h1 className="font-display text-4xl text-ink">Generate a quiz</h1>
          {studyspace.data && (
            <p className="mt-2 font-heading text-xs uppercase tracking-[0.14em] text-muted">
              {studyspace.data.title}
            </p>
          )}
        </div>
        <Divider ornament className="max-w-40" />
      </header>

      {!hasKey ? (
        <EmptyState
          title="Connect your AI key first"
          description="Quizzes are written by Gemini with your own API key. Add it in your profile to continue."
          action={
            <Link
              to="/profile"
              className="font-heading text-xs uppercase tracking-[0.14em] text-ink underline underline-offset-4"
            >
              Open AI settings
            </Link>
          }
        />
      ) : annotations.isPending ? (
        <div className="flex flex-col gap-4" role="status" aria-label="Loading annotations">
          <Skeleton className="h-6 w-1/3" />
          <SkeletonText lines={6} />
        </div>
      ) : annotations.isError ? (
        <ErrorState
          title="Could not load your annotations"
          message={getApiErrorMessage(annotations.error)}
          onRetry={() => annotations.refetch()}
        />
      ) : usable.length === 0 ? (
        <EmptyState
          title="Nothing to build a quiz from"
          description="Highlight text or add notes while reading a source, and they will show up here."
          action={
            <Link
              to={`/studyspace/${id}`}
              className="font-heading text-xs uppercase tracking-[0.14em] text-ink underline underline-offset-4"
            >
              Go to your sources
            </Link>
          }
        />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {run && (
            <QuizRunStatus
              studyspaceId={id}
              run={run}
              onCancel={() => cancel(id)}
              onDismiss={() => dismiss(id)}
              onRetrySave={() => retrySave(id)}
            />
          )}

          <fieldset disabled={busy} className="flex flex-col gap-6">
            <Textarea
              label="Topic"
              hint="What should the quiz focus on? Only the checked annotations below are used as material."
              rows={3}
              maxLength={500}
              required
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />

            <div className="flex flex-col gap-6 sm:flex-row">
              <div className="sm:w-48">
                <Input
                  label="Number of questions"
                  type="number"
                  inputMode="numeric"
                  min={MIN_QUIZ_QUESTIONS}
                  max={MAX_QUIZ_QUESTIONS}
                  value={countText}
                  onChange={(event) => setCountText(event.target.value)}
                  error={
                    count === null
                      ? `${MIN_QUIZ_QUESTIONS} to ${MAX_QUIZ_QUESTIONS}`
                      : undefined
                  }
                />
              </div>

              <fieldset className="flex flex-col gap-2">
                <legend className={cn(labelClasses, 'mb-1')}>Question types</legend>
                {QUESTION_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={types.has(type)}
                      onChange={(event) => toggleType(type, event.target.checked)}
                    />
                    {QUESTION_TYPE_LABELS[type]}
                  </label>
                ))}
              </fieldset>
            </div>

            <section aria-labelledby="source-heading" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="source-heading" className={labelClasses}>
                  Material
                </h2>
                <p
                  aria-live="polite"
                  className={cn('text-sm', overLimit ? 'text-danger' : 'text-muted')}
                >
                  {chars.toLocaleString('en-US')} / {MAX_QUIZ_SOURCE_CHARS.toLocaleString('en-US')}{' '}
                  characters · {selected.length} of {usable.length} selected
                </p>
              </div>
              {overLimit && (
                <FieldError
                  message={`Over the limit by ${(chars - MAX_QUIZ_SOURCE_CHARS).toLocaleString('en-US')} characters. Uncheck some annotations to continue.`}
                />
              )}
              <AnnotationSelector groups={groups} unchecked={unchecked} onChange={setUnchecked} />
            </section>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={blocker !== null || busy} loading={busy}>
              Generate quiz
            </Button>
            {blocker && !busy && <p className="text-sm text-muted">{blocker}</p>}
          </div>
        </form>
      )}
    </article>
  );
};
