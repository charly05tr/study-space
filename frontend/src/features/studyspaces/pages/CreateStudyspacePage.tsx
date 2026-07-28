import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ErrorState,
  Input,
  Textarea,
  useNotification,
} from '../../../components/ui';
import { getApiErrorMessage, getFieldErrors } from '../../../lib/apiError';
import { useCreateStudyspace } from '../hooks/useCreateStudyspace';
import { parseTags } from '../parseTags';

// Model limits: title CharField(200), description CharField(1000).
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;

export const CreateStudyspacePage = () => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const createStudyspace = useCreateStudyspace();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rawTags, setRawTags] = useState('');

  const { tags, error: tagsError } = parseTags(rawTags);
  const fieldErrors = getFieldErrors(createStudyspace.error);
  const canSubmit = title.trim() !== '' && description.trim() !== '' && !tagsError;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    createStudyspace.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        // Omitted when empty: the field is optional on the serializer.
        ...(tags.length > 0 ? { tags } : {}),
      },
      {
        onSuccess: (studyspace) => {
          notify({
            variant: 'success',
            title: 'Studyspace created',
            message: `"${studyspace.title}" is ready.`,
          });
          navigate('/studyspaces', { replace: true });
        },
      },
    );
  };

  return (
    <div className="max-w-measure">
      <Card>
        <CardHeader>
          <CardTitle>New studyspace</CardTitle>
          <CardDescription>
            One studyspace per subject. Sources, notes and references live inside it.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit} noValidate>
          <CardBody className="flex flex-col gap-4">
            {createStudyspace.isError && (
              <ErrorState
                title="Could not create it"
                message={getApiErrorMessage(createStudyspace.error)}
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
              rows={5}
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
                hint="Separated by commas"
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
          </CardBody>

          <CardFooter className="justify-end">
            <Button variant="quiet" onClick={() => navigate('/studyspaces')}>
              Cancel
            </Button>
            <Button type="submit" loading={createStudyspace.isPending} disabled={!canSubmit}>
              Create studyspace
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
