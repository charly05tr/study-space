import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Input, useNotification } from '../../../components/ui';
import { getApiErrorMessage, getFieldErrors } from '../../../lib/apiError';
import { SOURCE_TYPE_LABEL } from '../../studyspaces/labels';
import type { SourceMinimal } from '../../studyspaces/types';
import { useRenameSource } from '../hooks/useSourceMutations';
import { SourceMenu } from './SourceMenu';

interface SourceRowProps {
  source: SourceMinimal;
  studyspaceId: number;
}

/**
 * One source in the studyspace's list.
 *
 * Read is the only action on the row. Everything else — converting, renaming,
 * deleting — lives behind the menu: those are things you do to a source once,
 * and reading is what you came for.
 */
export const SourceRow = ({ source, studyspaceId }: SourceRowProps) => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const rename = useRenameSource(studyspaceId);

  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(source.title);

  const isPdf = source.source_type === 'pdf';

  const handleRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    if (trimmed === source.title) {
      setRenaming(false);
      return;
    }

    rename.mutate(
      { sourceId: source.id, title: trimmed },
      {
        onSuccess: () => {
          notify({
            variant: 'success',
            title: 'Source renamed',
            message: `Now called "${trimmed}".`,
          });
          setRenaming(false);
        },
      },
    );
  };

  // A rejected title comes back as a field error; anything else (offline, 404)
  // has no field to hang off, and the row has no room for an ErrorState.
  const renameError = rename.isError
    ? (getFieldErrors(rename.error).title ?? getApiErrorMessage(rename.error))
    : undefined;

  // The form replaces the row instead of sitting under it: the title would
  // otherwise be on screen twice, and the one being typed is not the one saved.
  if (renaming) {
    return (
      <li className="border-b border-rule/60 py-2 last:border-b-0">
        <form onSubmit={handleRename} noValidate className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input
              label="Title"
              name="title"
              required
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              error={renameError}
            />
          </div>
          <Button
            variant="quiet"
            size="sm"
            onClick={() => {
              // Back to what is stored, not to what was half-typed: reopening
              // the form on a discarded draft reads as the rename having stuck.
              setTitle(source.title);
              setRenaming(false);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={rename.isPending} disabled={!title.trim()}>
            Save
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/60 py-2 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-ink">{source.title}</span>

      <span className="flex shrink-0 items-center gap-2">
        <Badge>{SOURCE_TYPE_LABEL[source.source_type] ?? source.source_type}</Badge>

        {/* Reading before conversion would silently trigger a full convert
            inside the reader, with no progress feedback. Only PDFs get here at
            all: the reader renders converted HTML and nothing else. */}
        {isPdf && (
          <Button
            variant="secondary"
            size="sm"
            disabled={!source.is_converted}
            onClick={() => navigate(`/source/${source.id}`)}
          >
            Read
          </Button>
        )}

        <SourceMenu
          source={source}
          studyspaceId={studyspaceId}
          onRename={() => setRenaming(true)}
        />
      </span>
    </li>
  );
};
