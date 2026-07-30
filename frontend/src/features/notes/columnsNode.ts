import { mergeAttributes, Node } from '@tiptap/core';

/**
 * A note split into two columns.
 *
 * Two, not N. Every layout this is for — cues beside notes, term beside
 * definition, claim beside evidence — is a pair, and `content: 'column column'`
 * makes that a schema guarantee rather than a convention: ProseMirror will not
 * let a document exist with one column or three, so no paste, undo or partial
 * delete can leave a half-built grid on screen.
 *
 * Deliberately absent from ID_BEARING_BLOCKS and from INDEXED_TYPES on the
 * backend. These two nodes are layout, not content — their text is only the sum
 * of the paragraphs inside them, and `extract_blocks` already keeps the
 * INNERMOST indexed block, so the paragraphs still reach the map on their own.
 * Giving the container an address would draw the same words twice.
 */
export const COLUMNS_NODE = 'columns';
export const COLUMN_NODE = 'column';

export const Column = Node.create({
  name: COLUMN_NODE,

  content: 'block+',

  /**
   * Isolating, so editing stays inside the column it started in: without it a
   * backspace at the top of the right column pulls its first paragraph into the
   * left one, and a select-all-then-type collapses the whole grid.
   */
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-column]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-column': '', class: 'note-column' }),
      0,
    ];
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      /** Replaces the current block with a two-column split. */
      setTwoColumns: () => ReturnType;
    };
  }
}

export const Columns = Node.create({
  name: COLUMNS_NODE,

  group: 'block',

  content: `${COLUMN_NODE} ${COLUMN_NODE}`,

  /**
   * Defining, so pasting into a column replaces the paragraph inside it rather
   * than the grid around it.
   */
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-columns]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-columns': '', class: 'note-columns' }),
      0,
    ];
  },

  addCommands() {
    return {
      setTwoColumns:
        () =>
        ({ commands }) =>
          commands.insertContent(emptyColumns()),
    };
  },
});

/** A blank two-column block, ready for the caret. */
export const emptyColumns = () => ({
  type: COLUMNS_NODE,
  content: [
    { type: COLUMN_NODE, content: [{ type: 'paragraph' }] },
    { type: COLUMN_NODE, content: [{ type: 'paragraph' }] },
  ],
});
