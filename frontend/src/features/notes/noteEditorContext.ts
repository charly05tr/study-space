import { createContext } from 'react';

export interface NoteEditorContextValue {
  /** Scopes the citations the `/` menu offers. */
  studyspaceId: number;
  /**
   * Hands off to the full-screen picker, seeded with whatever was typed after
   * the slash. The `/` menu cannot host the browsing case itself: it is
   * anchored to the caret with a capped height, and an unbounded list there
   * would bury the blocks it also has to show.
   */
  openAnnotationPicker: (query: string) => void;
  /** Opens the AI writing review for the note as it is right now. */
  openAiReview: () => void;
  /** Turns the pointer into a pen so the user can draw over the note. */
  startDrawing: () => void;
}

/**
 * Lets the menus rendered by Tiptap reach the note they belong to.
 *
 * This works because `ReactRenderer` paints through a portal owned by
 * `EditorContent`, so anything provided above the editor is in scope inside the
 * popup — which is what keeps data loading in React instead of being threaded
 * through extension options.
 */
export const NoteEditorContext = createContext<NoteEditorContextValue | null>(null);
