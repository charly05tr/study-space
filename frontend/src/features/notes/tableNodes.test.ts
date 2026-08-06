import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { noteExtensions } from './editorExtensions';
import { toEditorContent } from './noteDocument';
import { canDeleteColumn, canDeleteRow, DEFAULT_TABLE } from './tableNodes';

/**
 * The commands behind the table toolbar.
 *
 * The buttons are thin — every one of them is a single chained command — so
 * what is worth testing is not the React, it is that the grid stays a grid:
 * adding a column has to touch EVERY row, and prosemirror-tables has to refuse
 * to delete the last one rather than leave an empty table behind.
 */

let editor: Editor | null = null;

interface JsonNode {
  type?: string;
  attrs?: Record<string, unknown> | null;
  content?: JsonNode[];
}

/** A fresh editor with the caret parked in the table's first body cell. */
const withTable = () => {
  editor = new Editor({ extensions: noteExtensions });
  editor.chain().focus().insertTable(DEFAULT_TABLE).run();
  return editor;
};

/** The grid as row lengths: [3, 3, 3] is three rows of three cells. */
const shape = () => {
  const table = ((editor?.getJSON().content ?? []) as JsonNode[]).find(
    (node) => node.type === 'table',
  );
  return (table?.content ?? []).map((row) => row.content?.length ?? 0);
};

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('table row and column commands', () => {
  it('starts at the shape /table promises', () => {
    withTable();
    expect(shape()).toEqual([3, 3, 3]);
  });

  it('adds a row above and below the one holding the caret', () => {
    withTable().chain().addRowBefore().addRowAfter().run();
    expect(shape()).toEqual([3, 3, 3, 3, 3]);
  });

  it('adds a column to either side, across every row', () => {
    // The failure this guards against is a ragged table: a column added to the
    // first row only, which no longer parses as a grid.
    withTable().chain().addColumnBefore().addColumnAfter().run();
    expect(shape()).toEqual([5, 5, 5]);
  });

  it('deletes the row and the column the caret is in', () => {
    withTable().chain().deleteRow().run();
    expect(shape()).toEqual([3, 3]);

    editor?.chain().deleteColumn().run();
    expect(shape()).toEqual([2, 2]);
  });

  it('refuses to delete the last row, and says so before it is asked', () => {
    const instance = withTable();
    instance.chain().deleteRow().deleteRow().run();
    expect(shape()).toEqual([3]);

    // The regression this guards: `can()` returns TRUE here, because
    // prosemirror-tables only refuses once it is actually dispatching. The
    // toolbar reads canDeleteRow instead, which is why its button greys out
    // rather than doing nothing when clicked.
    expect(instance.can().chain().deleteRow().run()).toBe(true);
    expect(canDeleteRow(instance.state)).toBe(false);
  });

  it('refuses to delete the last column, on the same terms', () => {
    const instance = withTable();
    instance.chain().deleteColumn().deleteColumn().run();
    expect(shape()).toEqual([1, 1, 1]);

    expect(canDeleteColumn(instance.state)).toBe(false);
    instance.chain().deleteColumn().run();
    expect(shape()).toEqual([1, 1, 1]);
  });

  it('deleting the table takes the whole block, not just its rows', () => {
    withTable().chain().deleteTable().run();
    expect(shape()).toEqual([]);
  });

  it('carries a dragged column width through a save and a reload', () => {
    // Not a UI test of the drag — that is the editor's own plugin. This is the
    // contract underneath it: the width the user chose lives in `colwidth` on
    // the cell, so it has to survive the round trip through Note.content. If a
    // schema change ever drops the attribute, every table in the studyspace
    // silently resets to even columns and nobody finds out until they look.
    const sized = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colwidth: [220] }, content: [{ type: 'paragraph' }] },
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
              ],
            },
          ],
        },
      ],
    };

    editor = new Editor({ extensions: noteExtensions, content: toEditorContent(sized) });

    const table = ((editor.getJSON().content ?? []) as JsonNode[]).find(
      (node) => node.type === 'table',
    );
    const cells = table?.content?.[0].content ?? [];

    expect(cells[0].attrs?.colwidth).toEqual([220]);
    // The last column stays null on purpose — that is what keeps the table at
    // the measure's width instead of pinning it. See tableNodes.ts.
    expect(cells[1].attrs?.colwidth).toBeNull();
  });

  it('turns the header row into body cells and back', () => {
    const instance = withTable();
    const firstRowTypes = () => {
      const table = ((instance.getJSON().content ?? []) as JsonNode[]).find(
        (node) => node.type === 'table',
      );
      return table?.content?.[0].content?.map((cell) => cell.type);
    };

    expect(firstRowTypes()).toEqual(['tableHeader', 'tableHeader', 'tableHeader']);

    instance.chain().toggleHeaderRow().run();
    expect(firstRowTypes()).toEqual(['tableCell', 'tableCell', 'tableCell']);

    instance.chain().toggleHeaderRow().run();
    expect(firstRowTypes()).toEqual(['tableHeader', 'tableHeader', 'tableHeader']);
  });
});
