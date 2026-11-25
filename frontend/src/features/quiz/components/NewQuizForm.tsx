import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input } from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useCreateQuiz } from '../hooks/useQuizzes';

interface NewQuizFormProps {
  studyspaceId: number;
  onCancel: () => void;
}

/** Starts a manual quiz: just a title, the questions are added in the editor. */
export const NewQuizForm = ({ studyspaceId, onCancel }: NewQuizFormProps) => {
  const navigate = useNavigate();
  const create = useCreateQuiz();
  const [title, setTitle] = useState('');

  const trimmed = title.trim();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed || create.isPending) return;
    create.mutate(
      { studyspace: studyspaceId, title: trimmed, origin: 'manual' },
      { onSuccess: (quiz) => navigate(`/studyspace/${studyspaceId}/quizzes/${quiz.id}`) },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xs border border-rule p-4 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <Input
          label="Quiz title"
          value={title}
          maxLength={200}
          autoFocus
          required
          onChange={(event) => setTitle(event.target.value)}
          error={create.isError ? getApiErrorMessage(create.error) : undefined}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={!trimmed} loading={create.isPending}>
          Create
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
