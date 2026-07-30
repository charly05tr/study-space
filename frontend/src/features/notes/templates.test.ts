import { Editor, type JSONContent } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { noteExtensions } from './editorExtensions';
import { COLUMN_NODE, COLUMNS_NODE } from './columnsNode';
import { seedTemplate } from './noteDocument';
import { BLANK_TEMPLATE, CORNELL_TEMPLATE, NOTE_TEMPLATES, templateById } from './templates';

/** Every node of a document, in reading order. */
const walk = (node: JSONContent): JSONContent[] => [
  node,
  ...(node.content ?? []).flatMap(walk),
];

const typesOf = (node: JSONContent) => walk(node).map((entry) => entry.type);

describe('templates', () => {
  it('resolves by id and falls back to blank for anything unknown', () => {
    expect(templateById('cornell')).toBe(CORNELL_TEMPLATE);
    // The id round-trips through component state; an unrecognised one must
    // still produce a usable note rather than throw on create.
    expect(templateById('nope')).toBe(BLANK_TEMPLATE);
  });

  it('builds a fresh tree every time', () => {
    // The document is handed to Tiptap, which mutates it. A shared constant
    // would come back edited on the second note.
    const first = CORNELL_TEMPLATE.build();
    const second = CORNELL_TEMPLATE.build();
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it('produces a valid document root', () => {
    for (const template of NOTE_TEMPLATES) {
      expect(template.build().type).toBe('doc');
    }
  });
});

describe('the Cornell template', () => {
  const document = CORNELL_TEMPLATE.build();

  it('splits the top into exactly two columns', () => {
    const columns = walk(document).filter((node) => node.type === COLUMNS_NODE);
    expect(columns).toHaveLength(1);
    // The schema declares `column column`; a template that disagreed would be
    // rejected on parse and the note would open empty.
    expect(columns[0].content?.map((node) => node.type)).toEqual([COLUMN_NODE, COLUMN_NODE]);
  });

  it('labels the columns cues and notes', () => {
    const [cues, notes] = document.content?.[0].content ?? [];
    expect(cues.content?.[0].content?.[0].text).toBe('Ideas');
    expect(notes.content?.[0].content?.[0].text).toBe('Notes');
  });

  it('closes with a divider and a summary', () => {
    const top = document.content?.map((node) => node.type) ?? [];
    expect(top).toEqual([COLUMNS_NODE, 'horizontalRule', 'heading', 'paragraph']);
  });

  it('carries no prompt copy the writer would have to delete', () => {
    // Placeholder sentences inside the document are content: they reach the
    // concept map as real blocks and have to be cleared before writing.
    const written = walk(document)
      .filter((node) => node.type === 'text')
      .map((node) => node.text);
    expect(written).toEqual(['Ideas', 'Notes', 'Summary']);
  });
});

describe('seedTemplate', () => {
  const seeded = seedTemplate(CORNELL_TEMPLATE.build());

  it('gives every indexable block an id', () => {
    // Without this the note reaches the database with null ids, and
    // extract_blocks skips every one of them — the note would be missing from
    // the map until someone typed in it.
    const indexable = walk(seeded).filter(
      (node) => node.type === 'heading' || node.type === 'paragraph',
    );

    expect(indexable.length).toBeGreaterThan(0);
    for (const node of indexable) {
      expect(node.attrs?.id).toEqual(expect.any(String));
    }
  });

  it('gives each block a distinct id', () => {
    const ids = walk(seeded)
      .map((node) => node.attrs?.id)
      .filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leaves the layout containers unaddressed', () => {
    // Columns are layout, not content. An id here would draw the same words
    // twice on the map — see columnsNode.ts.
    const containers = walk(seeded).filter(
      (node) => node.type === COLUMNS_NODE || node.type === COLUMN_NODE,
    );
    expect(containers).toHaveLength(3);
    for (const node of containers) {
      expect(node.attrs?.id).toBeUndefined();
    }
  });

  it('does not change the shape of the document', () => {
    expect(typesOf(seeded)).toEqual(typesOf(CORNELL_TEMPLATE.build()));
  });
});

/**
 * The one that matters most.
 *
 * A template is JSON written by hand against a schema declared somewhere else.
 * When the two disagree ProseMirror does not complain — it drops what it cannot
 * place and keeps going, so a single wrong node name turns "create a Cornell
 * note" into "create an empty note" with nothing anywhere saying why.
 */
describe('a template opened in a real editor', () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  const parse = (document: JSONContent) => {
    editor = new Editor({ extensions: noteExtensions, content: document });
    return editor.getJSON();
  };

  it('comes back with every region intact', () => {
    const stored = parse(seedTemplate(CORNELL_TEMPLATE.build()));

    // TrailingNode adds the empty line below the last block, so compare the
    // opening of the document rather than all of it.
    expect(stored.content?.slice(0, 4).map((node) => node.type)).toEqual([
      COLUMNS_NODE,
      'horizontalRule',
      'heading',
      'paragraph',
    ]);
  });

  it('keeps both columns and their headings', () => {
    const stored = parse(seedTemplate(CORNELL_TEMPLATE.build()));
    const columns = stored.content?.[0];

    expect(columns?.content).toHaveLength(2);
    expect(editor?.getText()).toContain('Ideas');
    expect(editor?.getText()).toContain('Notes');
    expect(editor?.getText()).toContain('Summary');
  });

  it('keeps the ids the note was created with', () => {
    // They are already in the database by the time the note is first opened;
    // a parse that reassigned them would orphan every block on the map.
    const seededDocument = seedTemplate(CORNELL_TEMPLATE.build());
    const before = walk(seededDocument)
      .map((node) => node.attrs?.id)
      .filter(Boolean);

    const after = walk(parse(seededDocument))
      .map((node) => node.attrs?.id)
      .filter(Boolean);

    expect(after).toEqual(expect.arrayContaining(before));
  });
});
