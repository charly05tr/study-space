import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { noteExtensions } from './editorExtensions';
import { toEditorContent } from './noteDocument';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const paragraph = (text: string, id?: string) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      ...(id ? { attrs: { id } } : {}),
      content: [{ type: 'text', text }],
    },
  ],
});

describe('toEditorContent', () => {
  it('maps a never-edited note to undefined so the schema builds the empty doc', () => {
    // Note.content defaults to {} on the backend.
    expect(toEditorContent({})).toBeUndefined();
    expect(toEditorContent(null)).toBeUndefined();
    expect(toEditorContent(undefined)).toBeUndefined();
  });

  it('gives every block an id before the editor is even created', () => {
    const prepared = toEditorContent(paragraph('hello'));

    expect(prepared?.content?.[0]?.attrs?.id).toEqual(expect.any(String));
  });

  it('leaves ids that already reached the database untouched', () => {
    // Regenerating these would orphan every graph edge pointing at the block.
    const stored = '0f7d9a2c-1b44-4f0e-9c1a-2b3c4d5e6f70';
    const prepared = toEditorContent(paragraph('hello', stored));

    expect(prepared?.content?.[0]?.attrs?.id).toBe(stored);
  });

  it('an id from the database survives being loaded and then edited', () => {
    // The load-bearing guarantee of the whole editor: if a reload renumbered
    // the blocks, every edge in the future concept map would point at nothing.
    const stored = '11111111-2222-3333-4444-555555555555';
    editor = new Editor({
      extensions: noteExtensions,
      content: toEditorContent(paragraph('hello', stored)),
    });

    editor.commands.insertContent('!');

    expect(editor.getJSON().content?.[0]?.attrs?.id).toBe(stored);
  });

  it('the editor reports ids at rest, with no edit made', () => {
    // The regression this guards: UniqueID stamps ids from appendTransaction,
    // so a document seeded straight from the API sat at attrs.id null until the
    // first keystroke.
    editor = new Editor({
      extensions: noteExtensions,
      content: toEditorContent(paragraph('hello')),
    });

    const first = editor.getJSON().content?.[0];
    expect(first?.attrs?.id).toEqual(expect.any(String));
  });
});
