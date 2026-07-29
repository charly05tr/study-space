import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import { cn } from '../../../components/ui/cn';
import { noteExtensions } from '../editorExtensions';
import { useNoteAutosave } from '../hooks/useNoteAutosave';
import { toEditorContent } from '../noteDocument';
import { SlashCommand } from '../slashCommand';
import type { NoteDocument } from '../types';
import { FormatBubbleMenu } from './FormatBubbleMenu';
import { SaveIndicator } from './SaveIndicator';

/**
 * `noteExtensions` stays the schema contract; SlashCommand is appended here
 * because it is UI, not document shape. See the note in slashCommand.ts.
 */
const editorExtensions = [...noteExtensions, SlashCommand];

interface BlockEditorProps {
  noteId: number;
  /** Note.content as returned by the API. `{}` for a fresh note. */
  initialContent: NoteDocument | null;
  editable?: boolean;
  /** Override persistence. Only meant for tests and stories. */
  onSave?: (content: NoteDocument) => Promise<unknown>;
  className?: string;
}

export const BlockEditor = ({
  noteId,
  initialContent,
  editable = true,
  onSave,
  className,
}: BlockEditorProps) => {
  const { status, scheduleSave } = useNoteAutosave(noteId, { save: onSave });

  // The editor is rebuilt only when the note changes, so `onUpdate` must not
  // close over `scheduleSave` directly: a new identity would either remount the
  // editor mid-typing or leave a stale closure writing to the previous note.
  // Synced in an effect rather than during render: `onUpdate` only fires from a
  // user interaction, which is always after commit, so it never reads a stale
  // value — and a discarded render never leaks into the ref.
  const scheduleRef = useRef(scheduleSave);
  useEffect(() => {
    scheduleRef.current = scheduleSave;
  });

  const editor = useEditor(
    {
      extensions: editorExtensions,
      content: toEditorContent(initialContent),
      editable,
      // The bubble menu subscribes to what it needs through `useEditorState`;
      // re-rendering this tree on every transaction would re-render the whole
      // document for a cursor move.
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          // No horizontal padding: the page owns the measure, and any inset
          // here would push the prose off the heading's left edge.
          class: cn(
            'prose prose-note max-w-none focus:outline-none',
            // Clicking the empty space below the last paragraph should land the
            // caret in the document, the way it does in a real page.
            'min-h-[60vh] py-6',
          ),
        },
      },
      /**
       * `getJSON()` and not `getHTML()`: the JSON tree is the only form that
       * still carries `attrs.id` per block. HTML would flatten it to a `data-id`
       * string that the backend would have to re-parse to index a block.
       */
      onUpdate: ({ editor: instance }) => scheduleRef.current(instance.getJSON()),
    },
    [noteId],
  );

  if (!editor) return null;

  return (
    // Width and centring belong to the page, not here: when this owned its own
    // measure it drifted out of line with the note title above it.
    <div className={cn('w-full', className)}>
      {/* No formatting bar: blocks come from `/` and marks from the selection,
          so the only persistent chrome is the save state. Translucent and
          sticky so the prose scrolls under it and stays legible. */}
      <div className="sticky top-0 z-10 flex justify-end bg-page/85 py-2 backdrop-blur-sm">
        <SaveIndicator status={status} />
      </div>

      <FormatBubbleMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
};
