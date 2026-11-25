import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Input, Textarea } from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useUpdateQuiz } from '../hooks/useQuizzes';
import type { Quiz } from '../types';

interface QuizDetailsFormProps {
  quiz: Quiz;
}

/** Title and description: the only quiz fields a PATCH may change (plus language). */
export const QuizDetailsForm = ({ quiz }: QuizDetailsFormProps) => {
  const update = useUpdateQuiz(quiz.id);
  const [title, setTitle] = useState(quiz.title);
  const [description, setDescription] = useState(quiz.description);

  const trimmedTitle = title.trim();
  const changed = trimmedTitle !== quiz.title || description.trim() !== quiz.description;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmedTitle || !changed || update.isPending) return;
    update.mutate(
      { title: trimmedTitle, description: description.trim() },
      {
        onSuccess: (saved) => {
          setTitle(saved.title);
          setDescription(saved.description);
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Title"
        value={title}
        maxLength={200}
        required
        error={!trimmedTitle ? 'A quiz needs a title.' : undefined}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Textarea
        label="Description (optional)"
        rows={2}
        maxLength={1000}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={!trimmedTitle || !changed}
          loading={update.isPending}
        >
          Save details
        </Button>
        {update.isError && (
          <p role="alert" className="text-sm text-danger">
            {getApiErrorMessage(update.error)}
          </p>
        )}
        {update.isSuccess && !changed && (
          <p role="status" className="text-sm text-muted">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
};
