import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, ErrorState, Input, useNotification } from '../../../components/ui';
import { getApiErrorMessage, getFieldErrors } from '../../../lib/apiError';
import { useCreateNote } from '../hooks/useNoteMutations';

interface AddNoteFormProps {
  studyspaceId: number;
  onDone: () => void;
}

export const AddNoteForm = ({ studyspaceId, onDone }: AddNoteFormProps) => {
  const { notify } = useNotification();
  const createNote = useCreateNote(studyspaceId);

  const [title, setTitle] = useState('');

  const fieldErrors = getFieldErrors(createNote.error);
  const trimmed = title.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed) return;

    // No `content`: the note is created empty and the editor fills it in. There
    // is no file to upload, so unlike a source this needs no optimistic title.
    createNote.mutate(
      { title: trimmed, studyspace: studyspaceId },
      {
        onSuccess: () => {
          notify({
            variant: 'success',
            title: 'Note created',
            message: 'Open it to start writing.',
          });
          setTitle('');
          onDone();
        },
      },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-xs border border-rule p-4"
    >
      {createNote.isError && (
        <ErrorState title="Could not create the note" message={getApiErrorMessage(createNote.error)} />
      )}

      <Input
        label="Title"
        name="title"
        hint="You can rename it later"
        autoFocus
        required
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={fieldErrors.title}
      />

      <div className="flex justify-end gap-2">
        <Button variant="quiet" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={createNote.isPending} disabled={!trimmed}>
          Create note
        </Button>
      </div>
    </form>
  );
};
