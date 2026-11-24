import { NodeSelection, Selection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../../components/ui/cn';
import { useStudyspaceAnnotations } from '../../annotations/hooks/useAnnotations';
import type { Annotation } from '../../annotations/types';
import { noteExtensions } from '../editorExtensions';
import { WritingReviewPanel } from '../../ai/components/WritingReviewPanel';
import { useNoteAutosave } from '../hooks/useNoteAutosave';
import { useNoteDrawingAutosave } from '../hooks/useNoteDrawingAutosave';
import { normalizeDrawing } from '../drawing';
import { extractPlainText, toEditorContent } from '../noteDocument';
import { NoteEditorContext } from '../noteEditorContext';
import { BlockLinkCommand } from '../blockLinkCommand';
import { SlashCommand } from '../slashCommand';
import { annotationToNodeAttrs } from '../slashMenuItems';
import type { NoteDocument, SaveStatus } from '../types';
import { AnnotationPicker } from './AnnotationPicker';
import { DrawingLayer } from './DrawingLayer';
import { FormatBubbleMenu } from './FormatBubbleMenu';
import { MathMenu } from './MathMenu';
import { SaveIndicator } from './SaveIndicator';
import { TableMenu } from './TableMenu';

/** Stable identity: `?? []` inline would rebuild the picker's list every render. */
const NO_ANNOTATIONS: Annotation[] = [];

const SAVE_PRIORITY: Record<SaveStatus, number> = { saved: 0, dirty: 1, saving: 2, error: 3 };

interface BlockEditorProps {
  noteId: number;
  /** Scopes the citations the `/` menu offers. */
  studyspaceId: number;
  /** Note.content as returned by the API. `{}` for a fresh note. */
  initialContent: NoteDocument | null;
  /** Note.drawing as returned by the API. `{}` for a note never drawn on. */
  initialDrawing?: unknown;
  editable?: boolean;
  /** Override persistence. Only meant for tests and stories. */
  onSave?: (content: NoteDocument) => Promise<unknown>;
  className?: string;
}

export const BlockEditor = ({
  noteId,
  studyspaceId,
  initialContent,
  initialDrawing,
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

  // `null` while closed. The text is a snapshot taken on open: the review
  // describes the note as it was when asked for, even if typing continues.
  // `seq` is bumped on every open and used as the panel's `key`, so each open
  // starts from a fresh snapshot. The review run itself lives in a store keyed
  // by note, so remounting reconnects to a run in progress instead of restarting.
  // `noteId` ties the review to its note.
  const [reviewState, setReviewState] = useState<{
    noteId: number;
    text: string;
    seq: number;
  } | null>(null);
  const review = reviewState?.noteId === noteId ? reviewState : null;
  const editorRef = useRef<Editor | null>(null);

  // Pen mode. The drawing has its own autosave and its own PATCH field, so it
  // can never overwrite the text (or the reverse).
  const [penActive, setPenActive] = useState(false);
  const drawingSave = useNoteDrawingAutosave(noteId);
  const seedDrawing = useMemo(() => normalizeDrawing(initialDrawing), [initialDrawing]);
  const startDrawing = useCallback(() => setPenActive(true), []);
  const stopDrawing = useCallback(() => setPenActive(false), []);

  // Ctrl/Cmd+Shift+D toggles the pen. `code`, not `key`: Shift changes `key` to
  // "D" and other layouts move the letter. Esc and Ctrl+Z are handled by the
  // layer itself, only while the pen is on.
  useEffect(() => {
    if (!editable) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyD' && event.shiftKey && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setPenActive((current) => !current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editable]);

  const openAiReview = useCallback(
    () =>
      setReviewState((previous) => ({
        noteId,
        text: extractPlainText(editorRef.current?.getJSON()),
        seq: (previous?.seq ?? 0) + 1,
      })),
    [noteId],
  );

  // Reaches the `/` menu through the portal Tiptap renders it in, so the menu
  // can load its own citations instead of having them threaded in as options.
  const editorContext = useMemo(
    () => ({ studyspaceId, openAnnotationPicker, openAiReview, startDrawing }),
    [studyspaceId, openAnnotationPicker, openAiReview, startDrawing],
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

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Text editing is paused while drawing: the overlay already swallows the
  // pointer, this stops keystrokes from typing into a document nobody is
  // looking at. `false` = do not emit `update`, or entering pen mode would look
  // like an edit and trigger a pointless save.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable && !penActive, false);
    if (penActive) editor.commands.blur();
  }, [editor, editable, penActive]);

  if (!editor) return null;

  // One indicator for both writers; the worst state wins.
  const saveStatus: SaveStatus = [status, drawingSave.status].reduce((worst, next) =>
    SAVE_PRIORITY[next] > SAVE_PRIORITY[worst] ? next : worst,
  );

  return (
    // Width and centring belong to the page, not here: when this owned its own
    // measure it drifted out of line with the note title above it.
    <NoteEditorContext value={editorContext}>
      <div className={cn('w-full', className)}>
        {/* No formatting bar: blocks come from `/` and marks from the selection,
            so the only persistent chrome is the save state. Translucent and
            sticky so the prose scrolls under it and stays legible. */}
        <div className="sticky top-0 z-10 flex justify-end bg-page/85 py-2 backdrop-blur-sm">
          <SaveIndicator status={saveStatus} />
        </div>

        <FormatBubbleMenu editor={editor} />
        {/* All three are mutually exclusive — see their `shouldShow`. */}
        <TableMenu editor={editor} />
        <MathMenu editor={editor} />
        <DrawingLayer
          initialDrawing={seedDrawing}
          active={penActive}
          onExit={stopDrawing}
          onChange={drawingSave.scheduleSave}
        >
          <EditorContent editor={editor} />
        </DrawingLayer>

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

        {review && (
          <WritingReviewPanel
            key={review.seq}
            text={review.text}
            noteId={noteId}
            onClose={() => setReviewState(null)}
          />
        )}
      </div>
    </NoteEditorContext>
  );
};
