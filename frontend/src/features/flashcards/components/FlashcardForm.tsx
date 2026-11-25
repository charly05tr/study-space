import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, FieldError, Textarea } from '../../../components/ui';
import { toContent, validateContent } from '../flashcardList';
import type { FlashcardContent } from '../types';
import { MAX_FLASHCARD_TEXT } from '../types';

interface FlashcardFormProps {
  initial: FlashcardContent;
  submitLabel: string;
  saving: boolean;
  /** Server-side failure to show under the form. */
  error?: string;
  /** Explains what saving does to progress, when it matters. */
  note?: string;
  onSubmit: (content: FlashcardContent) => void;
  onCancel: () => void;
}

/** Front and back of one card: used to create a manual card and to edit any card. */
export const FlashcardForm = ({
  initial,
  submitLabel,
  saving,
  error,
  note,
  onSubmit,
  onCancel,
}: FlashcardFormProps) => {
  const [content, setContent] = useState(initial);
  // Errors appear after the first submit attempt, then follow the edits.
  const [attempted, setAttempted] = useState(false);

  const errors = attempted ? validateContent(content) : {};

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(validateContent(content)).length > 0) return;
    onSubmit(toContent(content));
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-xs border border-primary-200 p-4"
    >
      <Textarea
        label="Front"
        rows={3}
        maxLength={MAX_FLASHCARD_TEXT}
        value={content.front}
        error={errors.front}
        onChange={(event) => setContent({ ...content, front: event.target.value })}
      />
      <Textarea
        label="Back"
        rows={3}
        maxLength={MAX_FLASHCARD_TEXT}
        value={content.back}
        error={errors.back}
        onChange={(event) => setContent({ ...content, back: event.target.value })}
      />

      {note && <p className="text-sm text-muted">{note}</p>}
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
