import { NodeSelection, Selection } from '@tiptap/pm/state';
import { EditorContent, useEditor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../../components/ui/cn';
import { useStudyspaceAnnotations } from '../../annotations/hooks/useAnnotations';
import type { Annotation } from '../../annotations/types';
import { noteExtensions } from '../editorExtensions';
import { useNoteAutosave } from '../hooks/useNoteAutosave';
import { toEditorContent } from '../noteDocument';
import { NoteEditorContext } from '../noteEditorContext';
import { BlockLinkCommand } from '../blockLinkCommand';
import { SlashCommand } from '../slashCommand';
import { annotationToNodeAttrs } from '../slashMenuItems';
import type { NoteDocument } from '../types';
import { AnnotationPicker } from './AnnotationPicker';
import { FormatBubbleMenu } from './FormatBubbleMenu';
import { SaveIndicator } from './SaveIndicator';

/** Stable identity: `?? []` inline would rebuild the picker's list every render. */
const NO_ANNOTATIONS: Annotation[] = [];

interface BlockEditorProps {
  noteId: number;
  /** Scopes the citations the `/` menu offers. */
  studyspaceId: number;
  /** Note.content as returned by the API. `{}` for a fresh note. */
  initialContent: NoteDocument | null;
  editable?: boolean;
  /** Override persistence. Only meant for tests and stories. */
  onSave?: (content: NoteDocument) => Promise<unknown>;
  className?: string;
}

export const BlockEditor = ({
  noteId,
  studyspaceId,
  initialContent,
  editable = true,
  onSave,
  className,
}: BlockEditorProps) => {
  const { status, scheduleSave } = useNoteAutosave(noteId, { save: onSave });

  // `null` while closed; the string is the query carried over from the `/` menu.
  const [pickerQuery, setPickerQuery] = useState<string | null>(null);

  // The picker lives here rather than inside SlashMenu because the suggestion
  // popup unmounts the moment the menu closes — which is exactly when the
  // picker has to appear.
  const openAnnotationPicker = useCallback((query: string) => setPickerQuery(query), []);

  // Reaches the `/` menu through the portal Tiptap renders it in, so the menu
  // can load its own citations instead of having them threaded in as options.
  const editorContext = useMemo(
    () => ({ studyspaceId, openAnnotationPicker }),
    [studyspaceId, openAnnotationPicker],
  );

  // Shares react-query's cache with the menu's own hook, so opening the picker
  // costs no extra request.
  const annotationsQuery = useStudyspaceAnnotations(studyspaceId);

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
      /**
       * `noteExtensions` stays the schema contract; SlashCommand is appended
       * here because it is UI, not document shape. See slashCommand.ts.
       */
      extensions: [...noteExtensions, SlashCommand, BlockLinkCommand],
      content: toEditorContent(initialContent),
      editable,
      // The bubble menu subscribes to what it needs through `useEditorState`;
      // re-rendering this tree on every transaction would re-render the whole
      // document for a cursor move.
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          /**
           * Study notes are full of proper nouns, code, and whatever language
           * the source is in. The browser's dictionary knows none of it, so the
           * red underlines are noise on almost every line — and noise that
           * looks like an error is worse than no signal at all.
           */
          spellcheck: 'false',
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
       * A note must not open with a block already selected.
       *
       * ProseMirror seeds the state with `Selection.atStart`, which looks for a
       * text position and settles for a NodeSelection when it cannot find one.
       * A note whose first block is an atom — an embedded annotation — gives it
       * nothing to land on, so the card came up highlighted before the reader
       * had touched anything.
       *
       * Nudged to the nearest text position instead. The transaction changes no
       * content, and Tiptap only emits `update` when the document actually
       * changed, so this cannot trip the autosave on load.
       *
       * `Selection.findFrom` with textOnly, NOT `TextSelection.near`: that name
       * is inherited straight from `Selection` — TextSelection defines no `near`
       * of its own — so it happily hands back the very NodeSelection being
       * replaced.
       */
      onCreate: ({ editor: instance }) => {
        const { state } = instance;
        if (!(state.selection instanceof NodeSelection)) return;

        const text = Selection.findFrom(state.doc.resolve(state.selection.from), 1, true);
        if (text) instance.view.dispatch(state.tr.setSelection(text));
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
    <NoteEditorContext value={editorContext}>
      <div className={cn('w-full', className)}>
        {/* No formatting bar: blocks come from `/` and marks from the selection,
            so the only persistent chrome is the save state. Translucent and
            sticky so the prose scrolls under it and stays legible. */}
        <div className="sticky top-0 z-10 flex justify-end bg-page/85 py-2 backdrop-blur-sm">
          <SaveIndicator status={status} />
        </div>

        <FormatBubbleMenu editor={editor} />
        <EditorContent editor={editor} />

        {pickerQuery !== null && (
          <AnnotationPicker
            annotations={annotationsQuery.data ?? NO_ANNOTATIONS}
            loading={annotationsQuery.isPending}
            initialQuery={pickerQuery}
            onClose={() => setPickerQuery(null)}
            onSelect={(annotation) => {
              setPickerQuery(null);
              editor
                .chain()
                .focus()
                .insertContent({ type: 'annotation', attrs: annotationToNodeAttrs(annotation) })
                .run();
            }}
          />
        )}
      </div>
    </NoteEditorContext>
  );
};
