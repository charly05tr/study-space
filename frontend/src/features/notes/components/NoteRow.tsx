import { useNavigate } from 'react-router-dom';
import { ActionMenu, Button, ConfirmButton, useNotification } from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { NoteMinimal } from '../../studyspaces/types';
import { useDeleteNote } from '../hooks/useNoteMutations';

interface NoteRowProps {
  note: NoteMinimal;
  studyspaceId: number;
}

/**
 * One note in the studyspace's list.
 *
 * Open is the only action on the row, the way Read is for a source. Delete
 * lives behind the menu — for now the only thing in there, but it is the same
 * gesture in the same place across every row on the page.
 */
export const NoteRow = ({ note, studyspaceId }: NoteRowProps) => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const remove = useDeleteNote(studyspaceId);

  const handleDelete = () => {
    remove.mutate(note.id, {
      onSuccess: () => {
        notify({
          variant: 'success',
          title: 'Note deleted',
          message: `"${note.title}" and its place on the map are gone.`,
        });
      },
      onError: (error) => {
        notify({
          variant: 'error',
          title: 'Could not delete it',
          message: getApiErrorMessage(error),
        });
      },
    });
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/60 py-2 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-ink">{note.title}</span>

      <span className="flex shrink-0 items-center gap-2">
        {/* No "converted" gate like a source: a note is readable the moment it
            exists, even while still empty. */}
        <Button variant="secondary" size="sm" onClick={() => navigate(`/note/${note.id}`)}>
          Open
        </Button>

        <ActionMenu label={`Actions for ${note.title}`} width="w-52">
          {() => (
            /* Renaming is not in here: it lives on the note's own page, where
               the title is the heading you are already editing. Deleting cannot
               go there — from in there you would be standing on the page you
               just removed.

               Two clicks, because this takes the note's blocks and every
               relation drawn from them: a region of the map, not just a row. */
            <ConfirmButton
              confirmLabel="Delete for good"
              className="w-full"
              loading={remove.isPending}
              onConfirm={handleDelete}
            >
              Delete
            </ConfirmButton>
          )}
        </ActionMenu>
      </span>
    </li>
  );
};
