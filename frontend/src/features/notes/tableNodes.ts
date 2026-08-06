import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import type { EditorState } from '@tiptap/pm/state';
import { isInTable, selectedRect } from '@tiptap/pm/tables';

/**
 * Tables, as a study note needs them.
 *
 * Built on `@tiptap/extension-table` rather than a hand-rolled node: a table is
 * the one block whose editing rules are genuinely hard — adding a column has to
 * touch every row, deleting one has to respect colspans, and a selection can
 * span cells in two dimensions. prosemirror-tables solves all of that and ships
 * inside `@tiptap/pm` already, so rolling our own would mean reimplementing a
 * dependency we are shipping anyway.
 *
 * Deliberately absent from ID_BEARING_BLOCKS and from INDEXED_TYPES on the
 * backend, for the same reason as the column split: these four nodes are
 * structure, not content. A cell's text lives in the paragraph inside it, and
 * `extract_blocks` keeps the INNERMOST indexed block — so every cell reaches the
 * map on its own, and the table around them never draws the same words twice.
 */
export const TABLE_NODE = 'table';

/**
 * How narrow a column may get, in pixels.
 *
 * Also the width the layout reserves for a column nobody has sized yet, so it
 * doubles as the table's own minimum: three untouched columns cannot squeeze
 * below 3 x this before the wrapper starts scrolling instead. Wide enough for a
 * short word plus its padding — below that a column stops being a column and
 * becomes a vertical stack of single letters.
 */
const CELL_MIN_WIDTH = 80;

export const NoteTable = Table.configure({
  /** Drag the boundary between two columns to decide the split. */
  resizable: true,

  /**
   * The one option that makes a drag REDISTRIBUTE instead of grow.
   *
   * prosemirror-tables writes a pixel `colwidth` onto the column being dragged
   * and leaves the others null, and its table view only pins the table's own
   * width once EVERY column has one. So the last column is deliberately left
   * unresizable: it can never be given a width, the table therefore never
   * becomes fixed-width, and the `width: 100%` in the stylesheet keeps holding.
   * Widening one column then necessarily narrows what is left — which is what a
   * divider between two columns is supposed to mean.
   *
   * Turn this on and the behaviour changes silently: after the user has dragged
   * every boundary once, the table pins itself and further drags push its right
   * edge out into a horizontal scroll instead of trading space.
   */
  lastColumnResizable: false,

  cellMinWidth: CELL_MIN_WIDTH,

  /**
   * How close the pointer has to get to a boundary before the handle appears,
   * in pixels. The default 5 is a hairline to aim at; 8 is still narrow enough
   * that it never steals a click meant for the text.
   */
  handleWidth: 8,

  /**
   * Wraps every table in `div.tableWrapper`, which is what the CSS scrolls.
   *
   * Without it a table wider than the measure pushes the whole document
   * sideways: the prose gets a horizontal scrollbar and every paragraph above it
   * starts drifting off-screen. The resizing table view builds this wrapper
   * itself while the note is editable — this option is what puts it there for
   * the static render, so a read-only note scrolls its tables the same way.
   */
  renderWrapper: true,
});

export const NoteTableRow = TableRow;
export const NoteTableHeader = TableHeader;
export const NoteTableCell = TableCell;

/**
 * The shape `/table` inserts.
 *
 * Three by three with a header row: small enough to see whole, big enough that
 * the first thing you do is type rather than build. The header row is on
 * because a table in a study note is almost always labelled — and turning one
 * off is one click, while noticing you needed one is a re-type.
 */
export const DEFAULT_TABLE = { rows: 3, cols: 3, withHeaderRow: true } as const;

/**
 * Whether deleting the selected rows would actually delete anything.
 *
 * `editor.can().deleteRow()` cannot answer this, and that is a quirk of
 * prosemirror-tables rather than a mistake here: its refusal to empty a table
 * sits INSIDE `if (dispatch)`, so a dry run never reaches it and reports true
 * for a table with one row left. Trusting it lights up a delete button that
 * does nothing — the worst kind of control, because the user concludes the
 * editor is broken rather than that the action is impossible.
 *
 * The condition below is the same one, read out of the same rect: a selection
 * that spans from the first row to the last is a request to delete the table,
 * and `deleteTable` is the button for that.
 */
export const canDeleteRow = (state: EditorState): boolean => {
  if (!isInTable(state)) return false;

  const rect = selectedRect(state);
  return !(rect.top === 0 && rect.bottom === rect.map.height);
};

/** The same guard, one axis over. */
export const canDeleteColumn = (state: EditorState): boolean => {
  if (!isInTable(state)) return false;

  const rect = selectedRect(state);
  return !(rect.left === 0 && rect.right === rect.map.width);
};
