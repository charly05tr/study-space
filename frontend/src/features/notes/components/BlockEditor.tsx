import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import { cn } from '../../../components/ui/cn';
import { noteExtensions } from '../editorExtensions';
import { useNoteAutosave } from '../hooks/useNoteAutosave';
import type { NoteDocument } from '../types';
import { EditorToolbar } from './EditorToolbar';
import { SaveIndicator } from './SaveIndicator';

/**
 * Note.content defaults to `{}` on the backend, and a never-edited note still
 * carries that. TipTap rejects it — an object without `type` is not a document
 * — so it has to become `undefined` and let the schema build the empty doc.
 */
const toEditorContent = (content: NoteDocument | null | undefined) =>
  content && typeof content === 'object' && 'type' in content ? content : undefined;

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
      extensions: noteExtensions,
      content: toEditorContent(initialContent),
      editable,
      // The toolbar subscribes to what it needs through `useEditorState`;
      // re-rendering this tree on every transaction would re-render the whole
      // document for a cursor move.
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          class: cn(
            'prose prose-note max-w-none focus:outline-none',
            // Clicking the empty space below the last paragraph should land the
            // caret in the document, the way it does in a real page.
            'min-h-[60vh] px-6 py-10',
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
    <div className={cn('mx-auto w-full max-w-measure', className)}>
      {/* Translucent and sticky so the prose scrolls under the controls
          instead of the controls ever covering the line being written. */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-rule bg-page/85 px-4 py-1.5 backdrop-blur-sm">
        <EditorToolbar editor={editor} />
        <SaveIndicator status={status} />
      </div>

      <EditorContent editor={editor} />
    </div>
  );
};
