import { Badge, Button, ConfirmButton } from '../../../components/ui';
import type { Annotation } from '../../annotations/types';
import { QUESTION_TYPE_LABELS } from '../types';
import type { Question } from '../types';

interface QuestionItemProps {
  question: Question;
  number: number;
  /** The annotation the question came from, when it still exists. */
  origin: Annotation | undefined;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}

const answerText = (question: Question): string =>
  question.type === 'true_false'
    ? question.correct_answer === true
      ? 'True'
      : 'False'
    : String(question.correct_answer);

/** One question as the editor lists it: its content, its answer and its actions. */
export const QuestionItem = ({
  question,
  number,
  origin,
  isFirst,
  isLast,
  busy,
  onEdit,
  onDelete,
  onMove,
}: QuestionItemProps) => (
  <li className="flex flex-col gap-3 border-b border-rule py-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-heading text-sm text-ink">Q{number}</span>
        <Badge>{QUESTION_TYPE_LABELS[question.type]}</Badge>
        {origin && (
          <Badge variant="primary">
            {origin.annotation_type === 'note' ? 'Note' : 'Highlight'} · {origin.source_title} · p.{' '}
            {origin.page}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="quiet"
          size="sm"
          disabled={busy || isFirst}
          aria-label={`Move question ${number} up`}
          onClick={() => onMove(-1)}
        >
          Up
        </Button>
        <Button
          variant="quiet"
          size="sm"
          disabled={busy || isLast}
          aria-label={`Move question ${number} down`}
          onClick={() => onMove(1)}
        >
          Down
        </Button>
        <Button variant="quiet" size="sm" disabled={busy} onClick={onEdit}>
          Edit
        </Button>
        <ConfirmButton confirmLabel="Delete question?" disabled={busy} onConfirm={onDelete}>
          Delete
        </ConfirmButton>
      </div>
    </div>

    <p className="whitespace-pre-wrap text-ink">{question.prompt}</p>

    {question.type === 'multiple_choice' ? (
      <ol className="flex flex-col gap-1 text-sm">
        {question.options.map((option, index) => {
          const correct = index === question.correct_answer;
          return (
            <li key={index} className={correct ? 'text-success' : 'text-muted'}>
              {String.fromCharCode(65 + index)}. {option}
              {correct && <span className="sr-only"> (correct answer)</span>}
              {correct && <span aria-hidden> &#10003;</span>}
            </li>
          );
        })}
      </ol>
    ) : (
      <p className="text-sm text-success">
        <span className="text-muted">Answer: </span>
        {answerText(question)}
      </p>
    )}

    {question.explanation && (
      <p className="whitespace-pre-wrap text-sm text-muted">{question.explanation}</p>
    )}
  </li>
);
