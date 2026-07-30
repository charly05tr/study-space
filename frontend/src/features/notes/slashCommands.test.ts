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

const runItem = (title: string) => {
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

  return editor.getJSON().content ?? [];
};

const firstNode = (title: string) => runItem(title)[0];

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

  /**
   * The two items that produce no addressable block of their own.
   *
   * A rule carries no text to link. A column split carries text, but only its
   * children's — it is layout, and an id on the container would draw the same
   * words on the map twice. The test below covers what IS addressable inside it.
   */
  const LAYOUT_ONLY = new Set(['Divider', 'Two columns']);

  it('every item keeps a UniqueID on the block it produces', () => {
    // The whole point of the editor: a block the 3D map cannot address is a
    // block that did not really get created.
    for (const item of SLASH_ITEMS) {
      if (LAYOUT_ONLY.has(item.title)) continue;

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
