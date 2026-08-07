import type { Extensions } from '@tiptap/core';
import type { ResolvedPos } from '@tiptap/pm/model';
import UniqueID from '@tiptap/extension-unique-id';
// Placeholder is not part of StarterKit in Tiptap v3; it lives in the
// @tiptap/extensions utility bundle.
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import { AnnotationNode } from './annotationNode';
import { BlockLinkNode } from './blockLinkNode';
import { Column, Columns } from './columnsNode';
import { NoteMath } from './mathSlots';
import { NoteTable, NoteTableCell, NoteTableHeader, NoteTableRow } from './tableNodes';

/**
 * Block types that receive a stable `id` attribute.
 *
 * This list is the contract with the map: anything named here is addressable,
 * anything left out is only reachable by walking its parent's JSON. Adding a
 * type later is cheap; removing one orphans every edge that pointed at it.
 *
 * It is deliberately WIDER than what the backend actually turns into graph
 * nodes. `INDEXED_TYPES` in block_service.py starts from this same set and then
 * drops two kinds of noise: blocks with no text, and containers that hold
 * another indexed block. A list keeps its id here — cheap, and stable if we
 * ever want to address the group — while the map draws one node per bullet
 * rather than one per bullet, per item and per list.
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
  // An embedded annotation is the clearest graph node of all: it is already an
  // edge between a source and a note, so it needs its own address.
  'annotation',
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

  // Part of the schema, not of the UI: a note containing a citation must parse
  // the same wherever it is read, including in a read-only renderer.
  AnnotationNode,

  // Same reasoning. The backend reads these mentions straight out of the stored
  // JSON to build the graph, so they have to survive any parse.
  // See extract_links in apps/studyspace/services/block_service.py
  BlockLinkNode,

  // Layout, but still schema: a note stored with a two-column split has to come
  // back as one. Parsed by any consumer, indexed by none — see columnsNode.ts.
  Columns,
  Column,

  // Structure too, and for the same reason: a note stored as a grid has to come
  // back as a grid, cell for cell, in any consumer. See tableNodes.ts.
  NoteTable,
  NoteTableRow,
  NoteTableHeader,
  NoteTableCell,

  // Schema for the third time, and the strictest case of the three: a formula
  // is stored as a LaTeX string on an atom, so a consumer parsing without this
  // does not degrade to plain text — it drops the node and loses the equation.
  // See mathSlots.ts for the wiring, mathNodes.ts for the slot arithmetic.
  NoteMath,

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
    placeholder: ({ editor, node, pos }) => {
      if (node.type.name === 'heading') return 'Heading';
      // Nothing inside a table cell. The lesson has already been given by the
      // time someone is filling in a grid, and a cell is a few characters wide:
      // a sentence about the `/` menu does not fit, it just overflows the one
      // cell holding the caret and shoves the column open.
      if (isInsideCell(editor.state.doc.resolve(pos))) return '';

      return "Write, or press '/' for blocks";
    },
  }),
];

/** Cell node names, kept next to the only place that has to recognise them. */
const CELL_TYPES = new Set(['tableCell', 'tableHeader']);

const isInsideCell = ($pos: ResolvedPos): boolean => {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (CELL_TYPES.has($pos.node(depth).type.name)) return true;
  }

  return false;
};
