import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, cn, ErrorState, Input, useNotification } from '../../../components/ui';
import { getApiErrorMessage, getFieldErrors } from '../../../lib/apiError';
import { useCreateNote } from '../hooks/useNoteMutations';
import { seedTemplate } from '../noteDocument';
import { BLANK_TEMPLATE, NOTE_TEMPLATES, templateById } from '../templates';

interface AddNoteFormProps {
  studyspaceId: number;
  onDone: () => void;
}

export const AddNoteForm = ({ studyspaceId, onDone }: AddNoteFormProps) => {
  const { notify } = useNotification();
  const createNote = useCreateNote(studyspaceId);

  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState(BLANK_TEMPLATE.id);

  const fieldErrors = getFieldErrors(createNote.error);
  const trimmed = title.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed) return;

    const template = templateById(templateId);

    createNote.mutate(
      {
        title: trimmed,
        studyspace: studyspaceId,
        // A blank note is still born with nothing, so Note.content keeps its
        // `{}` default and the editor builds the empty document — the path this
        // form has always taken.
        content: template.id === BLANK_TEMPLATE.id ? undefined : seedTemplate(template.build()),
      },
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
      className="flex flex-col gap-5 rounded-xs border border-rule p-4"
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

      <fieldset className="flex flex-col gap-2">
        <legend className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
          Template
        </legend>

        <div className="flex flex-col gap-2 sm:flex-row">
          {NOTE_TEMPLATES.map((template) => {
            const chosen = template.id === templateId;
            return (
              <button
                key={template.id}
                type="button"
                aria-pressed={chosen}
                onClick={() => setTemplateId(template.id)}
                className={cn(
                  'flex flex-1 flex-col items-start gap-0.5 rounded-xs border px-3 py-2 text-left',
                  'transition-colors duration-150',
                  chosen ? 'border-primary bg-primary-50' : 'border-rule hover:border-primary-200',
                )}
              >
                <span
                  className={cn(
                    'font-heading text-xs uppercase tracking-[0.12em]',
                    chosen ? 'text-primary-ink' : 'text-ink',
                  )}
                >
                  {template.name}
                </span>
                <span className="text-sm text-muted">{template.description}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

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
