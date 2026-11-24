import type { JSONContent } from '@tiptap/core';
import type { NoteDrawing } from './drawing';

/**
 * Note.content is a JSONField (migration 0009), so it stores the TipTap
 * document verbatim instead of a rendered HTML string.
 *
 * That choice is what makes the future 3D map possible: HTML would force us to
 * re-parse the note to find a block, while this tree already carries one
 * `attrs.id` per block. See `editorExtensions.ts`.
 */
export type NoteDocument = JSONContent;

/** Shape of NoteImageSerializer. */
export interface NoteImage {
  id: number;
  alt: string | null;
  url: string;
}

/** Shape of NoteDetailSerializer — what GET /notes/:id/ returns. */
export interface NoteDetail {
  id: number;
  title: string;
  content: NoteDocument;
  /** Freehand strokes over the note. `{}` until the first stroke is saved. */
  drawing: NoteDrawing | Record<string, never>;
  studyspace: number;
  created_at: string;
  updated_at: string;
  images: NoteImage[];
}

/**
 * Writable fields of NoteUpdateSerializer. Both are optional because autosave
 * only ever sends `content`, and a title rename only ever sends `title`.
 */
export interface NoteUpdatePayload {
  title?: string;
  content?: NoteDocument;
  /** Sent alone by the drawing autosave, so it never carries the body. */
  drawing?: NoteDrawing;
}

/**
 * NoteCreateSerializer.
 *
 * `content` is optional because a blank note still arrives empty and lets
 * Note.content keep its `{}` default. A template sends the tree it wants the
 * note to be born as — already stamped with block ids, so the note is
 * addressable from the map before anyone has typed in it.
 */
export interface CreateNotePayload {
  title: string;
  studyspace: number;
  content?: NoteDocument;
}

/**
 * `dirty` means the user typed and the debounce has not fired yet — it is a
 * distinct state from `saving`, because only `saving` has a request in flight.
 */
export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';
