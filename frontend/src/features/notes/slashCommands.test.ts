import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { noteExtensions } from './editorExtensions';
import { toEditorContent } from './noteDocument';
import { SLASH_ITEMS } from './slashMenuItems';

/**
 * Types prove the commands exist; they do not prove "Quote" produces a quote.
 * These run each catalogue entry against a real editor and read the resulting
 * document back, which is the only way a mislabelled item shows up.
 */

let editor: Editor | null = null;

/**
 * A document node, as these tests need to read it.
 *
 * `getJSON()` types every child as "block node OR text node", and a text node
 * carries neither `content` nor `attrs` — so descending into a table cell would
 * mean proving at every level that the thing in hand is not a run of text.
 * These tests only ever walk block structure, so they say it once here.
 */
interface JsonNode {
  type?: string;
  attrs?: Record<string, unknown> | null;
  content?: JsonNode[];
}

const runItem = (title: string): JsonNode[] => {
  const item = SLASH_ITEMS.find((candidate) => candidate.title === title);
  if (!item) throw new Error(`No slash item titled "${title}"`);

  // Seeded through the app's own preparation step, so the starting paragraph
  // already carries an id — exactly the state a note is in when opened.
  editor = new Editor({
    extensions: noteExtensions,
    content: toEditorContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    }),
  });
  item.run(editor.chain().focus()).run();

  return (editor.getJSON().content ?? []) as JsonNode[];
};

const firstNode = (title: string) => runItem(title)[0];

/**
 * The catalogue driven the way the menu actually drives it.
 *
 * `runItem` hands each item a bare `chain().focus()`, which is NOT what happens
 * in the app: SlashCommand builds `chain().focus().deleteRange(range)` so the
 * block replaces the `/query` that was typed. The difference is not cosmetic —
 * after deleteRange the chained transaction and `editor.state` disagree about
 * every position in the document, and a command that reads the editor instead
 * of its own transaction inserts at a position that no longer exists.
 *
 * That is a whole class of bug this suite could not see, and it is invisible
 * until someone types the command for real: the chain throws, nothing is
 * dispatched, and the menu item looks inert.
 */
const runTyped = (title: string): JsonNode[] => {
  const item = SLASH_ITEMS.find((candidate) => candidate.title === title);
  if (!item) throw new Error(`No slash item titled "${title}"`);

  const query = `/${title.toLowerCase()}`;
  editor = new Editor({
    extensions: noteExtensions,
    content: toEditorContent({ type: 'doc', content: [{ type: 'paragraph' }] }),
  });
  editor.chain().focus().insertContent(query).run();

  // The range the suggestion plugin reports: the `/` and everything after it.
  const to = editor.state.selection.from;
  item.run(editor.chain().focus().deleteRange({ from: to - query.length, to })).run();

  return (editor.getJSON().content ?? []) as JsonNode[];
};

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('slash item commands', () => {
  it('Text produces a paragraph', () => {
    expect(firstNode('Text').type).toBe('paragraph');
  });

  it.each([
    ['Heading 1', 1],
    ['Heading 2', 2],
    ['Heading 3', 3],
  ])('%s produces a heading at the right level', (title, level) => {
    const node = firstNode(title);
    expect(node.type).toBe('heading');
    expect(node.attrs?.level).toBe(level);
  });

  it('Bulleted list wraps the paragraph in a bulletList', () => {
    expect(firstNode('Bulleted list').type).toBe('bulletList');
  });

  it('Numbered list wraps the paragraph in an orderedList', () => {
    expect(firstNode('Numbered list').type).toBe('orderedList');
  });

  it('Quote produces a blockquote', () => {
    expect(firstNode('Quote').type).toBe('blockquote');
  });

  it('Code produces a codeBlock', () => {
    expect(firstNode('Code').type).toBe('codeBlock');
  });

  it('Divider inserts a horizontalRule', () => {
    const nodes = runItem('Divider');
    expect(nodes.some((node) => node.type === 'horizontalRule')).toBe(true);
  });

  it('Two columns inserts a split of exactly two', () => {
    const columns = runItem('Two columns').find((node) => node.type === 'columns');
    expect(columns?.content?.map((node) => node.type)).toEqual(['column', 'column']);
  });

  it('Table inserts a 3x3 grid with a header row', () => {
    const table = runItem('Table').find((node) => node.type === 'table');
    const rows = table?.content ?? [];

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.content?.length === 3)).toBe(true);
    // Header row first, body cells everywhere else — the shape a labelled study
    // table is almost always in, so nobody has to build it by hand.
    expect(rows[0].content?.map((cell) => cell.type)).toEqual([
      'tableHeader',
      'tableHeader',
      'tableHeader',
    ]);
    expect(rows[1].content?.every((cell) => cell.type === 'tableCell')).toBe(true);
  });

  /**
   * The items that produce no addressable block of their own.
   *
   * A rule carries no text to link. A column split and a table carry text, but
   * only their children's — they are structure, and an id on the container
   * would draw the same words on the map twice. The tests below cover what IS
   * addressable inside them.
   *
   * An equation is the odd one out: it is content, and it is not a container.
   * It has no TEXT. The whole formula lives in a `latex` attribute, so
   * `extract_blocks` would discard it on the empty-text check even if it were
   * in INDEXED_TYPES — see block_service.py. An id here would buy a node the
   * map cannot draw and a link nothing can point at.
   */
  const UNADDRESSABLE = new Set(['Divider', 'Two columns', 'Table', 'Equation']);

  it('every item keeps a UniqueID on the block it produces', () => {
    // The whole point of the editor: a block the 3D map cannot address is a
    // block that did not really get created.
    for (const item of SLASH_ITEMS) {
      if (UNADDRESSABLE.has(item.title)) continue;

      const node = firstNode(item.title);
      expect(node.attrs?.id, `${item.title} has no id`).toEqual(expect.any(String));
    }
  });

  it('a column split is unaddressable but everything written inside it is not', () => {
    const columns = runItem('Two columns').find((node) => node.type === 'columns');

    expect(columns?.attrs?.id).toBeUndefined();
    for (const column of columns?.content ?? []) {
      expect(column.attrs?.id).toBeUndefined();
      // The paragraph waiting for the caret. This is the node the map draws,
      // and extract_blocks reaches it by walking straight through the two
      // containers above.
      expect(column.content?.[0].attrs?.id).toEqual(expect.any(String));
    }
  });

  it('a table is unaddressable but every cell in it is not', () => {
    const table = runItem('Table').find((node) => node.type === 'table');

    expect(table?.attrs?.id).toBeUndefined();
    for (const row of table?.content ?? []) {
      expect(row.attrs?.id).toBeUndefined();
      for (const cell of row.content ?? []) {
        expect(cell.attrs?.id).toBeUndefined();
        // The paragraph inside the cell. This is the node extract_blocks keeps
        // — it walks straight through the three containers above it.
        expect(cell.content?.[0].attrs?.id).toEqual(expect.any(String));
      }
    }
  });

  it.each(SLASH_ITEMS.map((item) => item.title))(
    '%s survives the deleteRange the menu wraps it in',
    (title) => {
      // Two failures, one assertion. A command reading `editor.state` throws
      // RangeError on a position the chained document no longer has — that is
      // how `/equation` shipped inert. A command that merely returns false
      // leaves the typed query sitting in the paragraph, which is the same
      // symptom from the user's side: the menu closed and nothing happened.
      expect(() => runTyped(title)).not.toThrow();
      expect(editor?.getText()).not.toContain('/');
    },
  );

  it('converts the block in place and leaves room to keep writing', () => {
    const nodes = runItem('Heading 1');

    // The paragraph became the heading rather than gaining a sibling above it,
    // and StarterKit's TrailingNode keeps one empty paragraph at the end so
    // there is always a line below the last block to click into.
    expect(nodes.map((node) => node.type)).toEqual(['heading', 'paragraph']);
    // Read through the editor rather than indexing the JSON union: the point is
    // that the words survived, not the shape they survived in. getText() pads
    // block boundaries with newlines, hence the trim.
    expect(editor?.getText().trim()).toBe('hello');
  });
});
