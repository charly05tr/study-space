import { useState } from 'react';
import { Badge, Button, useNotification } from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { formatDateOnly } from '../../../lib/formatDate';
import { REFERENCE_TYPE_LABEL } from '../../studyspaces/labels';
import type { Reference } from '../../studyspaces/types';
import { useDeleteReference } from '../hooks/useReferenceMutations';
import { ReferenceForm } from './ReferenceForm';

interface ReferenceRowProps {
  reference: Reference;
  studyspaceId: number;
}

export const ReferenceRow = ({ reference, studyspaceId }: ReferenceRowProps) => {
  const { notify } = useNotification();
  const deleteReference = useDeleteReference(studyspaceId);
  const [editing, setEditing] = useState(false);

  const published = formatDateOnly(reference.publication_date);

  const handleDelete = () => {
    deleteReference.mutate(reference.id, {
      onSuccess: () => {
        notify({
          variant: 'success',
          title: 'Reference removed',
          message: `"${reference.title}" is no longer cited here.`,
        });
      },
      onError: (error) => {
        notify({
          variant: 'error',
          title: 'Could not remove it',
          message: getApiErrorMessage(error),
        });
      },
    });
  };

  // The form replaces the row rather than sitting under it: two titles for the
  // same citation, one of them stale, is a worse read than one form.
  if (editing) {
    return (
      <li className="border-b border-rule/60 py-2 last:border-b-0">
        <ReferenceForm
          studyspaceId={studyspaceId}
          reference={reference}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule/60 py-2 last:border-b-0">
      <span className="flex min-w-0 flex-1 flex-col">
        <a
          href={reference.url}
          target="_blank"
          rel="noreferrer"
          className="truncate text-primary-ink underline underline-offset-4"
        >
          {reference.title}
        </a>
        {(reference.authors || published) && (
          <span className="truncate text-sm text-muted">
            {reference.authors}
            {reference.authors && published && ' · '}
            {published}
          </span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-2">
        <Badge>
          {REFERENCE_TYPE_LABEL[reference.reference_type] ?? reference.reference_type}
        </Badge>
        <Button variant="quiet" size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          variant="danger"
          size="sm"
          loading={deleteReference.isPending}
          onClick={handleDelete}
        >
          Delete
        </Button>
      </span>
    </li>
  );
};
