import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, ErrorState, Input, Select, useNotification } from '../../../components/ui';
import { getApiErrorMessage, getFieldErrors } from '../../../lib/apiError';
import { REFERENCE_TYPE_LABEL } from '../../studyspaces/labels';
import type { Reference, ReferenceType } from '../../studyspaces/types';
import { useCreateReference, useUpdateReference } from '../hooks/useReferenceMutations';
import { REFERENCE_TYPES } from '../types';

interface ReferenceFormProps {
  studyspaceId: number;
  /** Present when editing an existing citation, absent when adding one. */
  reference?: Reference;
  onDone: () => void;
}

/**
 * Add or correct one citation.
 *
 * One form for both because the fields are the same ones and the difference is
 * a single verb — and because a separate edit form is exactly the kind of
 * duplicate that drifts the day someone adds a field to only one of the two.
 */
export const ReferenceForm = ({ studyspaceId, reference, onDone }: ReferenceFormProps) => {
  const { notify } = useNotification();
  const createReference = useCreateReference(studyspaceId);
  const updateReference = useUpdateReference(studyspaceId);

  const [title, setTitle] = useState(reference?.title ?? '');
  const [url, setUrl] = useState(reference?.url ?? '');
  const [type, setType] = useState<ReferenceType>(reference?.reference_type ?? 'BOOK');
  const [authors, setAuthors] = useState(reference?.authors ?? '');
  const [publicationDate, setPublicationDate] = useState(reference?.publication_date ?? '');

  const isEditing = reference !== undefined;
  const mutation = isEditing ? updateReference : createReference;
  const fieldErrors = getFieldErrors(mutation.error);

  const trimmedTitle = title.trim();
  const trimmedUrl = url.trim();
  const trimmedAuthors = authors.trim();
  const canSubmit = trimmedTitle !== '' && trimmedUrl !== '';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    // Blank means "not known", and the model stores that as null. An empty
    // string would come back as an author whose name is the empty string.
    const fields = {
      title: trimmedTitle,
      url: trimmedUrl,
      reference_type: type,
      authors: trimmedAuthors || null,
      publication_date: publicationDate || null,
    };

    const onSuccess = (saved: Reference) => {
      notify({
        variant: 'success',
        title: isEditing ? 'Reference updated' : 'Reference added',
        message: `"${saved.title}" is saved.`,
      });
      onDone();
    };

    if (reference) {
      updateReference.mutate({ id: reference.id, payload: fields }, { onSuccess });
    } else {
      createReference.mutate({ ...fields, studyspace: studyspaceId }, { onSuccess });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-xs border border-rule p-4"
    >
      {mutation.isError && (
        <ErrorState
          title={isEditing ? 'Could not save the changes' : 'Could not add the reference'}
          message={getApiErrorMessage(mutation.error)}
        />
      )}

      <Input
        label="Title"
        name="title"
        required
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={fieldErrors.title}
      />

      <Input
        label="URL"
        name="url"
        type="url"
        required
        placeholder="https://"
        hint="Where the source can be found"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        error={fieldErrors.url}
      />

      <Select
        label="Type"
        name="reference_type"
        value={type}
        onChange={(event) => setType(event.target.value as ReferenceType)}
        error={fieldErrors.reference_type}
      >
        {REFERENCE_TYPES.map((option) => (
          <option key={option} value={option}>
            {REFERENCE_TYPE_LABEL[option]}
          </option>
        ))}
      </Select>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Authors (optional)"
          name="authors"
          value={authors}
          onChange={(event) => setAuthors(event.target.value)}
          error={fieldErrors.authors}
        />

        <Input
          label="Published (optional)"
          name="publication_date"
          type="date"
          value={publicationDate}
          onChange={(event) => setPublicationDate(event.target.value)}
          error={fieldErrors.publication_date}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="quiet" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={mutation.isPending} disabled={!canSubmit}>
          {isEditing ? 'Save changes' : 'Add reference'}
        </Button>
      </div>
    </form>
  );
};
