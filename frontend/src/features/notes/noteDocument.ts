import { generateUniqueIds } from '@tiptap/extension-unique-id';
import { noteExtensions } from './editorExtensions';
import type { NoteDocument } from './types';

/**
 * Turns a stored `Note.content` into something Tiptap can be seeded with.
 *
 * Two problems, both invisible until they bite:
 *
 * 1. `Note.content` defaults to `{}` on the backend, and a never-edited note
 *    still carries that. Tiptap rejects it — an object without `type` is not a
 *    document — so it becomes `undefined` and the schema builds the empty doc.
 *
 * 2. UniqueID assigns ids from `appendTransaction`, which only runs on a
 *    document change. A freshly loaded document therefore sits at `attrs.id:
 *    null` until the first keystroke. Nothing breaks today, because a save can
 *    only follow an edit and that edit stamps every null id first — but the
 *    whole point of this editor is that a block is addressable, and "addressable
 *    as soon as someone types" is not the same guarantee. `generateUniqueIds`
 *    is the package's own way to do that pass without an editor instance; it
 *    fills the gaps and leaves ids that already exist alone, so ids that reached
 *    the database keep pointing at the same block.
 */
export const toEditorContent = (
  content: NoteDocument | null | undefined,
): NoteDocument | undefined => {
  if (!content || typeof content !== 'object' || !('type' in content)) return undefined;

  return generateUniqueIds(content, noteExtensions);
};

/**
 * Stamps a template's blocks before the note is created.
 *
 * The same pass as above, for the same reason and one more: a templated note is
 * saved with real content by a request that never went through an editor, so
 * without this its blocks would reach the database with `attrs.id: null` and
 * `extract_blocks` would skip every one of them. The note would sit in the
 * studyspace and be absent from the map until someone typed in it.
 */
export const seedTemplate = (document: NoteDocument): NoteDocument =>
  generateUniqueIds(document, noteExtensions);
