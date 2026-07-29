import type { Extensions } from '@tiptap/core';
import UniqueID from '@tiptap/extension-unique-id';
// Placeholder is not part of StarterKit in Tiptap v3; it lives in the
// @tiptap/extensions utility bundle.
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';

/**
 * Block types that receive a stable `id` attribute.
 *
 * This list is the contract with the future 3D map. Anything named here becomes
 * addressable on its own — a row in a `NoteBlock` table, a node in the graph.
 * Anything left out is only reachable by walking its parent's JSON, so adding a
 * type later is cheap but removing one orphans every edge that pointed at it.
 *
 * `listItem` is in on purpose: a concept map links to a single bullet, not to
 * the whole list. The list containers keep ids too so a link can target the
 * group.
 */
export const ID_BEARING_BLOCKS = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'codeBlock',
  'blockquote',
] as const;

/**
 * The single source of truth for how a note is parsed and serialized.
 *
 * Exported as one array rather than inlined in the component because the ids
 * are only meaningful if every consumer agrees on them: a read-only renderer
 * built with a different extension set would strip the attribute on parse and
 * silently break the links.
 */
export const noteExtensions: Extensions = [
  StarterKit.configure({
    // Notes are a document outline, not a web page: three levels is the depth a
    // study note actually uses, and capping it keeps the graph hierarchy shallow.
    heading: { levels: [1, 2, 3] },
  }),

  /**
   * Stamps `attrs.id` (a UUID v4) onto every block listed above.
   *
   * Where the id ends up:
   *   - saved JSON  -> `node.attrs.id`, which is what lands in Note.content
   *   - rendered DOM -> `data-id`, which is what a Three.js click handler reads
   *
   * The extension only regenerates an id when it detects a duplicate (a split
   * or a paste), so an id that already reached the database keeps pointing at
   * the same block across sessions. That stability is the whole reason this can
   * back a relational `NoteBlock` row and a graph edge.
   */
  UniqueID.configure({
    types: [...ID_BEARING_BLOCKS],
    // Explicit even though it is the default: this attribute name is a
    // persisted contract, not a styling detail.
    attributeName: 'id',
  }),

  // Writes `data-placeholder` and an `is-empty` class; the visible text is
  // drawn by the `.prose-note` rule in index.css.
  Placeholder.configure({
    // The empty line is the only place the `/` menu is discoverable, so the
    // placeholder has to teach it — there is no toolbar to find it in.
    placeholder: ({ node }) =>
      node.type.name === 'heading' ? 'Heading' : "Write, or press '/' for blocks",
  }),
];
