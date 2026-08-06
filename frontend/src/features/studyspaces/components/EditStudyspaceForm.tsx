import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  Badge,
  Button,
  ErrorState,
  Input,
  Textarea,
  useNotification,
} from '../../../components/ui';
import { getApiErrorMessage, getFieldErrors } from '../../../lib/apiError';
import { useUpdateStudyspace } from '../hooks/useUpdateStudyspace';
import { parseTags } from '../parseTags';
import type { StudyspaceDetail, StudyspaceUpdatePayload } from '../types';

// Model limits: title CharField(200), description CharField(1000).
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;

interface EditStudyspaceFormProps {
  studyspace: StudyspaceDetail;
  onDone: () => void;
}

/**
 * The metadata of a studyspace, editable in place.
 *
 * Only the fields that actually changed travel. That is not an optimisation:
 * the backend reads a `tags` array as the complete new set, so resending the
 * same labels on every title fix would churn the join table for nothing.
 */
export const EditStudyspaceForm = ({ studyspace, onDone }: EditStudyspaceFormProps) => {
  const { notify } = useNotification();
  const updateStudyspace = useUpdateStudyspace(studyspace.id);

  const [title, setTitle] = useState(studyspace.title);
  const [description, setDescription] = useState(studyspace.description);
  // Tags are commas away from each other by definition of parseTags, so joining
  // them back is lossless.
  const [rawTags, setRawTags] = useState(studyspace.tags.join(', '));

  const { tags, error: tagsError } = parseTags(rawTags);
  const fieldErrors = getFieldErrors(updateStudyspace.error);

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const canSubmit = trimmedTitle !== '' && trimmedDescription !== '' && !tagsError;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    const payload: StudyspaceUpdatePayload = {};
    if (trimmedTitle !== studyspace.title) payload.title = trimmedTitle;
    if (trimmedDescription !== studyspace.description) payload.description = trimmedDescription;
    // A tag can never contain a comma, so the joined strings compare cleanly.
    if (tags.join(',') !== studyspace.tags.join(',')) payload.tags = tags;

    if (Object.keys(payload).length === 0) {
      onDone();
      return;
    }

    updateStudyspace.mutate(payload, {
      onSuccess: (updated) => {
        notify({
          variant: 'success',
          title: 'Studyspace updated',
          message: `"${updated.title}" is saved.`,
        });
        onDone();
      },
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-xs border border-rule p-4"
    >
      {updateStudyspace.isError && (
        <ErrorState
          title="Could not save the changes"
          message={getApiErrorMessage(updateStudyspace.error)}
        />
      )}

      <Input
        label="Title"
        name="title"
        required
        maxLength={TITLE_MAX}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={fieldErrors.title}
      />

      <Textarea
        label="Description"
        name="description"
        required
        rows={4}
        maxLength={DESCRIPTION_MAX}
        hint={`${description.length}/${DESCRIPTION_MAX}`}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        error={fieldErrors.description}
      />

      <div className="flex flex-col gap-2">
        <Input
          label="Tags"
          name="tags"
          hint="Separated by commas. Emptying the field removes them all."
          value={rawTags}
          onChange={(event) => setRawTags(event.target.value)}
          error={tagsError ?? fieldErrors.tags}
        />
        {tags.length > 0 && !tagsError && (
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li key={tag}>
                <Badge variant="primary">{tag}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="quiet" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          loading={updateStudyspace.isPending}
          disabled={!canSubmit}
        >
          Save changes
        </Button>
      </div>
    </form>
  );
};
