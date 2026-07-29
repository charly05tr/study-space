import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { noteExtensions } from './editorExtensions';
import { BlockLinkCommand } from './blockLinkCommand';
import { SlashCommand } from './slashCommand';

/**
 * Exercises the real wiring — suggestion plugin -> ReactRenderer -> mounted
 * popup — rather than the catalogue, which slashCommands.test.ts covers.
 *
 * Two things this had to learn the hard way:
 *
 * 1. It has to run through React, not a headless `new Editor()`. ReactRenderer
 *    paints the popup through a portal owned by `EditorContent`, so without a
 *    mounted React editor the menu element appears but stays empty.
 * 2. `act` has to be awaited. The portal registration lands in a microtask, and
 *    a synchronous act() returns before React has flushed it.
 *
 * jsdom has no layout, so Floating UI puts everything at 0,0. Placement is the
 * plugin's job and is not what these assert.
 */

const Harness = ({ onReady }: { onReady: (editor: Editor) => void }) => {
  /**
   * The same extension list BlockEditor mounts, not just the one under test.
   *
   * This used to load SlashCommand alone, and so never noticed that both
   * suggestion extensions were claiming ProseMirror's default plugin key — the
   * suite stayed green while the real editor refused to mount at all.
   */
  const editor = useEditor({ extensions: [...noteExtensions, SlashCommand, BlockLinkCommand] });

  useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);

  return editor ? <EditorContent editor={editor} /> : null;
};

let container: HTMLDivElement;
let root: Root;
let editor: Editor;

/** The popup is appended to document.body by the plugin's managed mount. */
const menu = () => document.body.querySelector('[aria-label="Insert block"]');
const options = () =>
  Array.from(document.body.querySelectorAll('[role="option"]')).map(
    (node) => node.querySelector('span')?.textContent ?? '',
  );

const type = async (text: string) => {
  await act(async () => {
    editor.commands.insertContent(text);
  });
};

const selected = () =>
  document.body.querySelector('[role="option"][aria-selected="true"]')?.querySelector('span')
    ?.textContent ?? null;

/** Goes through the editor's own keydown path, the way the plugin receives it. */
const press = async (key: string) => {
  const surface = document.querySelector('.ProseMirror');
  await act(async () => {
    surface?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
};

const clickOption = async (index: number) => {
  const option = document.body.querySelectorAll<HTMLElement>('[role="option"]')[index];
  await act(async () => {
    // mousedown, not click: click fires after the editor has lost the selection
    // the command needs — the component listens for mousedown for that reason.
    option?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
};

beforeEach(async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom implements no layout, so it ships no scrollIntoView. The menu calls it
  // to keep the highlighted row visible; stubbing the environment is right here,
  // because every real browser has it.
  Element.prototype.scrollIntoView = () => {};
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  // SlashMenu loads its own citations, so it needs a query client. No
  // NoteEditorContext is provided: these cover the blocks half of the menu, and
  // without a studyspace the annotation query stays disabled.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Harness onReady={(instance) => { editor = instance; }} />
      </QueryClientProvider>,
    );
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('slash menu', () => {
  it('stays closed until the trigger is typed', async () => {
    await type('hello');

    expect(menu()).toBeNull();
  });

  it('opens on "/" and lists the whole catalogue', async () => {
    await type('/');

    expect(menu()).not.toBeNull();
    expect(options()).toContain('Heading 1');
    expect(options()).toContain('Bulleted list');
    expect(options()).toContain('Divider');
  });

  it('narrows the list as the query is typed', async () => {
    await type('/head');

    expect(options()).toEqual(['Heading 1', 'Heading 2', 'Heading 3']);
  });

  it('does not offer a paragraph under "/h"', async () => {
    // Guards the prefix-vs-substring filter through the real popup, not just
    // the pure function.
    await type('/h');

    expect(options()).not.toContain('Text');
  });

  it('matches keywords, not just titles', async () => {
    await type('/ul');

    expect(options()).toEqual(['Bulleted list']);
  });

  it('says so when nothing matches, instead of showing an empty list', async () => {
    await type('/zzz');

    expect(options()).toEqual([]);
    expect(document.body.textContent).toContain('No blocks match');
  });

  it('does not trigger on a slash inside a word', async () => {
    // A URL or a fraction must never open a block menu.
    await type('and/or');

    expect(menu()).toBeNull();
  });

  it('replaces the typed query with the chosen block', async () => {
    await type('/head');
    await clickOption(0);

    const nodes = editor.getJSON().content ?? [];
    expect(nodes[0]?.type).toBe('heading');
    expect(nodes[0]?.attrs?.level).toBe(1);
    // The "/head" text is gone, not left sitting inside the new heading.
    expect(editor.getText().trim()).toBe('');
  });

  it('gives the inserted block a UniqueID', async () => {
    await type('/quote');
    await clickOption(0);

    expect(editor.getJSON().content?.[0]?.attrs?.id).toEqual(expect.any(String));
  });

  it('closes once a block has been chosen', async () => {
    await type('/quote');
    await clickOption(0);

    expect(menu()).toBeNull();
  });

  it('highlights the first item when it opens', async () => {
    await type('/');

    expect(selected()).toBe('Text');
  });

  it('moves the highlight with the arrow keys', async () => {
    await type('/head');

    await press('ArrowDown');
    expect(selected()).toBe('Heading 2');

    await press('ArrowDown');
    expect(selected()).toBe('Heading 3');

    await press('ArrowUp');
    expect(selected()).toBe('Heading 2');
  });

  it('wraps the highlight at both ends', async () => {
    await type('/head');

    // Up from the first item lands on the last, not on nothing.
    await press('ArrowUp');
    expect(selected()).toBe('Heading 3');

    await press('ArrowDown');
    expect(selected()).toBe('Heading 1');
  });

  it('inserts the highlighted block on Enter', async () => {
    await type('/head');
    await press('ArrowDown');
    await press('Enter');

    const nodes = editor.getJSON().content ?? [];
    expect(nodes[0]?.type).toBe('heading');
    expect(nodes[0]?.attrs?.level).toBe(2);
    expect(menu()).toBeNull();
  });

  it('resets the highlight when the query narrows the list', async () => {
    await type('/');
    await press('ArrowDown');
    await press('ArrowDown');
    expect(selected()).toBe('Heading 2');

    // The old index would now point at a block the user is no longer seeing.
    await type('head');
    expect(selected()).toBe('Heading 1');
  });

  it('leaves Enter to the editor when nothing matches', async () => {
    await type('/zzz');
    await press('Enter');

    // No block was inserted and the query text is still there to be corrected.
    expect(editor.getText()).toContain('/zzz');
  });
});
