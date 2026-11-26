import { useEffect, useReducer, useRef, useState } from 'react';
import { Button, Divider, FieldError, Textarea, cn, useNotification } from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { summarizeConversion } from '../../flashcards/conversion';
import { useConvertQuestions } from '../../flashcards/hooks/useFlashcards';
import {
  buildRun,
  correctLabel,
  initStudy,
  isChoiceCorrect,
  missedQuestions,
  scoreResults,
  studyReducer,
} from '../study';
import type { RunQuestion, StudyState } from '../study';
import { QUESTION_TYPE_LABELS } from '../types';
import type { Question } from '../types';

interface StudyRunProps {
  questions: Question[];
  /** Fixes the option order of this run; a new seed reshuffles. */
  seed: number;
  /** Starts a new run over just these questions. */
  onRetry: (questions: Question[]) => void;
  onRestartAll: () => void;
}

const choiceClasses = (state: 'idle' | 'correct' | 'wrong' | 'dim') =>
  cn(
    'flex w-full items-start gap-3 rounded-xs border px-4 py-3 text-left text-ink transition-colors duration-150',
    state === 'idle' && 'border-rule hover:border-primary hover:bg-tint',
    state === 'correct' && 'border-success bg-success-soft text-success',
    state === 'wrong' && 'border-danger bg-danger-soft text-danger',
    state === 'dim' && 'border-rule text-muted',
  );

/** One run through a set of questions: answer, get feedback, move on, see the score. */
export const StudyRun = ({ questions, seed, onRetry, onRestartAll }: StudyRunProps) => {
  const [state, dispatch] = useReducer(studyReducer, undefined, () =>
    initStudy(buildRun(questions, seed)),
  );

  if (state.finished) {
    return (
      <Results
        state={state}
        questions={questions}
        onRetry={onRetry}
        onRestartAll={onRestartAll}
      />
    );
  }

  return <Step state={state} dispatch={dispatch} />;
};

interface StepProps {
  state: StudyState;
  dispatch: React.Dispatch<Parameters<typeof studyReducer>[1]>;
}

const Step = ({ state, dispatch }: StepProps) => {
  const item = state.items[state.index];
  const { question } = item;
  const [typed, setTyped] = useState('');
  const questionRef = useRef<HTMLHeadingElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  // Focus follows the flow: the question when it appears, the feedback once it
  // has something to say (the answer, or the grade).
  useEffect(() => {
    (state.status === 'answering' ? questionRef : feedbackRef).current?.focus();
  }, [state.index, state.status]);

  const answered = state.status === 'answered';
  const isLast = state.index === state.items.length - 1;
  const total = state.items.length;
  const right = state.results.filter((result) => result.correct).length;

  return (
    <section aria-label="Quiz study" className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
          Question {state.index + 1} of {total}
        </p>
        <p className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
          {right} correct
        </p>
      </div>
      <div
        role="progressbar"
        aria-label="Quiz progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={state.index}
        className="h-1 w-full bg-rule"
      >
        <div
          className="h-full bg-primary transition-[width] duration-200"
          style={{ width: `${(state.index / total) * 100}%` }}
        />
      </div>

      {/* Keyed so the typed answer and focus start fresh on every question. */}
      <div key={question.id} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
            {QUESTION_TYPE_LABELS[question.type]}
          </p>
          <h2
            ref={questionRef}
            tabIndex={-1}
            className="whitespace-pre-wrap font-heading text-xl text-ink outline-none"
          >
            {question.prompt}
          </h2>
        </div>

        {question.type !== 'short_answer' ? (
          <ChoiceList item={item} state={state} dispatch={dispatch} />
        ) : (
          <>
            <Textarea
              label="Your answer (optional)"
              hint="Write it out, or just think it through, then check the reference answer."
              rows={3}
              value={typed}
              disabled={state.status !== 'answering'}
              onChange={(event) => setTyped(event.target.value)}
            />
            {state.status === 'answering' && (
              <div>
                <Button onClick={() => dispatch({ type: 'reveal' })}>Show answer</Button>
              </div>
            )}
          </>
        )}

        {/* aria-live: the reference answer and the verdict are read out as they appear. */}
        <div
          ref={feedbackRef}
          tabIndex={-1}
          aria-live="polite"
          className="flex flex-col gap-3 outline-none"
        >
          {question.type === 'short_answer' && state.status !== 'answering' && (
            <div className="rounded-xs border border-primary-200 p-4">
              <p className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
                Reference answer
              </p>
              <p className="mt-1 whitespace-pre-wrap text-ink">{String(question.correct_answer)}</p>
            </div>
          )}

          {answered && (
            <p className={cn('font-heading text-lg', state.correct ? 'text-success' : 'text-danger')}>
              {question.type === 'short_answer'
                ? state.correct
                  ? 'Marked as got it.'
                  : 'Marked as missed.'
                : state.correct
                  ? 'Correct.'
                  : `Not quite. The answer is ${correctLabel(item)}.`}
            </p>
          )}

          {answered && question.explanation && (
            <p className="whitespace-pre-wrap text-sm text-muted">{question.explanation}</p>
          )}
        </div>

        {state.status === 'revealed' && (
          <div role="group" aria-label="How did you do?" className="flex flex-wrap gap-2">
            <Button onClick={() => dispatch({ type: 'self_mark', correct: true })}>I got it</Button>
            <Button variant="secondary" onClick={() => dispatch({ type: 'self_mark', correct: false })}>
              I missed it
            </Button>
          </div>
        )}

        {answered && (
          <div>
            <Button onClick={() => dispatch({ type: 'next' })}>
              {isLast ? 'See results' : 'Next question'}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};

const ChoiceList = ({ item, state, dispatch }: StepProps & { item: RunQuestion }) => {
  const answered = state.status === 'answered';
  const isMultipleChoice = item.question.type === 'multiple_choice';

  return (
    <div role="group" aria-label="Answers" className="flex flex-col gap-2">
      {item.choices.map((choice, position) => {
        const correct = isChoiceCorrect(item.question, choice.value);
        const picked = state.selected === choice.value;
        const visual = !answered
          ? 'idle'
          : correct
            ? 'correct'
            : picked
              ? 'wrong'
              : 'dim';

        return (
          <button
            key={String(choice.value)}
            type="button"
            // aria-disabled, not disabled: the focused option keeps focus until feedback takes it.
            aria-disabled={answered || undefined}
            className={choiceClasses(visual)}
            onClick={() => dispatch({ type: 'choose', value: choice.value })}
          >
            {isMultipleChoice && (
              <span aria-hidden className="font-heading">
                {String.fromCharCode(65 + position)}.
              </span>
            )}
            <span className="flex-1">{choice.label}</span>
            {answered && correct && <span className="sr-only">(correct answer)</span>}
            {answered && picked && !correct && <span className="sr-only">(your answer)</span>}
          </button>
        );
      })}
    </div>
  );
};

interface ResultsProps {
  state: StudyState;
  questions: Question[];
  onRetry: (questions: Question[]) => void;
  onRestartAll: () => void;
}

const Results = ({ state, questions, onRetry, onRestartAll }: ResultsProps) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const convert = useConvertQuestions();
  const { notify } = useNotification();

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const score = scoreResults(state.results);
  const missed = missedQuestions(questions, state.results);

  const handleConvert = () => {
    if (convert.isPending) return;
    convert.mutate(
      missed.map((question) => question.id),
      { onSuccess: (result) => notify(summarizeConversion(result)) },
    );
  };

  return (
    <section aria-labelledby="results-heading" className="flex flex-col gap-5">
      <div>
        <h2
          id="results-heading"
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-3xl text-ink outline-none"
        >
          {missed.length === 0 ? 'Perfect run' : 'Run complete'}
        </h2>
        <p role="status" className="mt-1 text-ink">
          {score.correct} of {score.total} correct ({score.percent}%).
        </p>
      </div>

      <Divider ornament className="max-w-40" />

      {missed.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
            Missed ({missed.length})
          </h3>
          <ol className="flex flex-col gap-2">
            {missed.map((question) => (
              <li key={question.id} className="border-b border-rule pb-2 text-sm text-ink">
                <span className="whitespace-pre-wrap">{question.prompt}</span>
                <span className="mt-1 block text-success">
                  <span className="text-muted">Answer: </span>
                  {question.type === 'multiple_choice'
                    ? question.options[Number(question.correct_answer)]
                    : question.type === 'true_false'
                      ? question.correct_answer === true
                        ? 'True'
                        : 'False'
                      : String(question.correct_answer)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {convert.isError && <FieldError message={getApiErrorMessage(convert.error)} />}

      <div className="flex flex-wrap gap-2">
        {missed.length > 0 && (
          <>
            <Button onClick={() => onRetry(missed)}>Retry missed</Button>
            <Button
              variant="secondary"
              loading={convert.isPending}
              disabled={convert.isSuccess || convert.isPending}
              onClick={handleConvert}
            >
              {convert.isSuccess ? 'Converted' : 'Convert missed to flashcards'}
            </Button>
          </>
        )}
        <Button variant={missed.length > 0 ? 'quiet' : 'primary'} onClick={onRestartAll}>
          Study the whole quiz again
        </Button>
      </div>
    </section>
  );
};
