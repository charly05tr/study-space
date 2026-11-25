import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  Button,
  FieldError,
  Input,
  Select,
  Textarea,
  cn,
  labelClasses,
} from '../../../components/ui';
import {
  addOption,
  canAddOption,
  canRemoveOption,
  draftToInput,
  hasErrors,
  removeOption,
  setOption,
  validateDraft,
} from '../questionForm';
import type { DraftErrors, QuestionDraft } from '../questionForm';
import { QUESTION_TYPES, QUESTION_TYPE_LABELS } from '../types';
import type { QuestionInput, QuestionType } from '../types';

interface QuestionFormProps {
  initial: QuestionDraft;
  /** Carried into the payload untouched: the form never changes a question's origin. */
  annotation: number | null;
  submitLabel: string;
  saving: boolean;
  /** Server-side failure to show under the form. */
  error?: string;
  onSubmit: (input: QuestionInput) => void;
  onCancel: () => void;
}

const radioClasses = 'size-4 shrink-0 accent-primary';

/** Create or edit one question of any of the three types. */
export const QuestionForm = ({
  initial,
  annotation,
  submitLabel,
  saving,
  error,
  onSubmit,
  onCancel,
}: QuestionFormProps) => {
  const [draft, setDraft] = useState(initial);
  // Errors appear after the first submit attempt, then follow the edits.
  const [attempted, setAttempted] = useState(false);

  const errors: DraftErrors = attempted ? validateDraft(draft) : {};

  const update = (changes: Partial<QuestionDraft>) => setDraft((current) => ({ ...current, ...changes }));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (hasErrors(validateDraft(draft))) return;
    onSubmit(draftToInput(draft, annotation));
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-xs border border-primary-200 p-4"
    >
      <Select
        label="Type"
        value={draft.type}
        onChange={(event) => update({ type: event.target.value as QuestionType })}
      >
        {QUESTION_TYPES.map((type) => (
          <option key={type} value={type}>
            {QUESTION_TYPE_LABELS[type]}
          </option>
        ))}
      </Select>

      <Textarea
        label="Question"
        rows={3}
        value={draft.prompt}
        error={errors.prompt}
        onChange={(event) => update({ prompt: event.target.value })}
      />

      {draft.type === 'multiple_choice' && (
        <fieldset className="flex flex-col gap-2">
          <legend className={cn(labelClasses, 'mb-1')}>
            Options (select the correct one)
          </legend>
          {draft.options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct-option"
                className={radioClasses}
                checked={draft.correctIndex === index}
                aria-label={`Option ${index + 1} is correct`}
                onChange={() => update({ correctIndex: index })}
              />
              <div className="flex-1">
                <Input
                  aria-label={`Option ${index + 1}`}
                  value={option}
                  maxLength={500}
                  onChange={(event) => setDraft(setOption(draft, index, event.target.value))}
                />
              </div>
              <Button
                variant="quiet"
                size="sm"
                disabled={!canRemoveOption(draft)}
                aria-label={`Remove option ${index + 1}`}
                onClick={() => setDraft(removeOption(draft, index))}
              >
                Remove
              </Button>
            </div>
          ))}
          {errors.options && <FieldError message={errors.options} />}
          {errors.correct && <FieldError message={errors.correct} />}
          <div>
            <Button
              variant="quiet"
              size="sm"
              disabled={!canAddOption(draft)}
              onClick={() => setDraft(addOption(draft))}
            >
              Add option
            </Button>
          </div>
        </fieldset>
      )}

      {draft.type === 'true_false' && (
        <fieldset className="flex flex-col gap-2">
          <legend className={cn(labelClasses, 'mb-1')}>Correct answer</legend>
          <div className="flex gap-6">
            {([true, false] as const).map((value) => (
              <label key={String(value)} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="true-false"
                  className={radioClasses}
                  checked={draft.trueFalse === value}
                  onChange={() => update({ trueFalse: value })}
                />
                {value ? 'True' : 'False'}
              </label>
            ))}
          </div>
          {errors.correct && <FieldError message={errors.correct} />}
        </fieldset>
      )}

      {draft.type === 'short_answer' && (
        <Textarea
          label="Reference answer"
          hint="What a good answer looks like. You compare your own answer against it."
          rows={2}
          value={draft.answer}
          error={errors.answer}
          onChange={(event) => update({ answer: event.target.value })}
        />
      )}

      <Textarea
        label="Explanation (optional)"
        rows={2}
        value={draft.explanation}
        error={errors.explanation}
        onChange={(event) => update({ explanation: event.target.value })}
      />

      {error && <FieldError message={error} />}

      <div className="flex gap-2">
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
        <Button variant="quiet" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
