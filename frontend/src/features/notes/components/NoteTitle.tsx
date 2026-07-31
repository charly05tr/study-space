import { useEffect, useRef, useState } from 'react';
import { useNotification } from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useRenameNote } from '../hooks/useNoteMutations';
import { renameTo } from '../noteTitle';

/** Note.title is a CharField(max_length=200). */
const MAX_LENGTH = 200;

interface NoteTitleProps {
  noteId: number;
  studyspaceId: number;
  title: string;
}

/**
 * The note's title, renamed in place.
 *
 * The heading is real markup until the moment it is being edited, rather than
 * an input dressed as one: an `<input>` has a value, not text content, so a
 * permanently-swapped title would leave the page with an `<h1>` that reads as
 * empty to a screen reader and to anything walking the document outline.
 *
 * Saved on blur and on Enter, not on a debounce like the body. A title is a
 * short, deliberate edit, and a rename that fired mid-word would put half a
 * word in the sidebar and in the studyspace list.
 */
export const NoteTitle = ({ noteId, studyspaceId, title }: NoteTitleProps) => {
  const { notify } = useNotification();
  const rename = useRenameNote(noteId, studyspaceId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const input = useRef<HTMLInputElement>(null);

  /**
   * Seeded at the click rather than kept in sync with the prop.
   *
   * Outside edit mode `draft` is not rendered at all — the button prints
   * `title` straight from the query — so there is nothing to keep in step, and
   * an effect mirroring one into the other would only add a render and a way
   * for a rename landing mid-edit to overwrite what is being typed.
   */
  const startEditing = () => {
    setDraft(title);
    setEditing(true);
  };

  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);

    const next = renameTo(draft, title);
    if (next === null) {
      setDraft(title);
      return;
    }

    rename.mutate(next, {
      onError: (error) => {
        setDraft(title);
        notify({
          variant: 'error',
          title: 'Could not rename the note',
          message: getApiErrorMessage(error),
        });
      },
    });
  };

  return (
    <h1 className="font-display text-4xl text-ink">
      {editing ? (
        <input
          ref={input}
          aria-label="Note title"
          maxLength={MAX_LENGTH}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            // Blur rather than commit directly, so both ways out of the field
            // go through exactly one path.
            if (event.key === 'Enter') input.current?.blur();
            if (event.key === 'Escape') {
              setDraft(title);
              setEditing(false);
            }
          }}
          className="w-full rounded-xs border-b border-primary bg-transparent font-display text-4xl text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          // A real button, so the rename is reachable by keyboard and announces
          // itself. The border only appears on hover: a permanent box around
          // the title would make the page look like a form.
          className="w-full rounded-xs border-b border-transparent text-left transition-colors duration-150 hover:border-rule"
        >
          {title}
        </button>
      )}
    </h1>
  );
};
