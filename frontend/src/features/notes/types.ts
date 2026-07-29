import type { JSONContent } from '@tiptap/core';

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
}

/**
 * NoteCreateSerializer. `content` is left out on purpose: a note is born empty
 * and Note.content defaults to `{}` — the editor fills it in afterwards.
 */
export interface CreateNotePayload {
  title: string;
  studyspace: number;
}

/**
 * `dirty` means the user typed and the debounce has not fired yet — it is a
 * distinct state from `saving`, because only `saving` has a request in flight.
 */
export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';
