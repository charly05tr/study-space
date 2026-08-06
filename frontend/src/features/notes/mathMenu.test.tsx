import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlockLinkCommand } from './blockLinkCommand';
import { FormatBubbleMenu } from './components/FormatBubbleMenu';
import { MathMenu } from './components/MathMenu';
import { TableMenu } from './components/TableMenu';
import { noteExtensions } from './editorExtensions';
import { insertEquation, MATH_SLOT, selectedMath } from './mathNodes';
import { SlashCommand } from './slashCommand';

/**
 * The formula panel, mounted for real.
 *
 * mathNodes.test.ts covers the string arithmetic; this covers the wiring, which
 * is where the surprises live. Two of them are specific to this editor:
 *
 * 1. Three BubbleMenus now share one editor. They may not share a ProseMirror
 *    plugin key, and a collision is a mount-time CRASH, not a layout bug — so
 *    all three are mounted here even though only one is asserted on. The slash
 *    menu suite learned the same lesson the hard way.
 * 2. The panel has to stay open while the editor is not focused, because the
 *    caret the user is typing with is inside a textarea of its own. Every
 *    default in BubbleMenu points the other way.
 *
 * jsdom has no layout, so Floating UI parks everything at 0,0. Placement is the
 * plugin's business and is not asserted.
 */

const Harness = ({ onReady }: { onReady: (editor: Editor) => void }) => {
  const editor = useEditor({ extensions: [...noteExtensions, SlashCommand, BlockLinkCommand] });

  useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);

  if (!editor) return null;

  return (
    <>
      <FormatBubbleMenu editor={editor} />
      <TableMenu editor={editor} />
      <MathMenu editor={editor} />
      <EditorContent editor={editor} />
    </>
  );
};

let container: HTMLDivElement;
let root: Root;
let editor: Editor;

/**
 * Two deferrals sit between a command and a settled panel, and both have to be
 * waited out or an assertion reads the DOM a step behind: the menu plugin shows
 * its element from a timer, and the focus handoff happens a frame after that —
 * deliberately, because Tiptap's own `focus()` is queued in a frame too.
 */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });

const source = () => document.body.querySelector<HTMLTextAreaElement>('#math-source');

/** Palette buttons carry their name as an aria-label; the footer's do not. */
const button = (label: string) =>
  document.body.querySelector<HTMLElement>(`button[aria-label="${label}"]`) ??
  Array.from(document.body.querySelectorAll<HTMLElement>('button')).find(
    (candidate) => candidate.textContent === label,
  ) ??
  null;

/** mousedown, not click: the buttons act on a caret a click would have moved. */
const press = async (element: HTMLElement | null) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
  await settle();
};

const addEquation = async () => {
  await act(async () => {
    insertEquation(editor.chain().focus()).run();
  });
  await settle();
};

beforeEach(async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root.render(<Harness onReady={(instance) => { editor = instance; }} />);
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('the formula panel', () => {
  it('stays closed until a formula is selected', () => {
    expect(source()).toBeNull();
  });

  it('opens on the equation the slash menu just inserted', async () => {
    await addEquation();

    expect(source()).not.toBeNull();
    expect(source()?.value).toBe(MATH_SLOT);
  });

  it('takes the keyboard, so typing cannot swallow the formula', async () => {
    // A selected atom is replaced by the next character typed. The panel taking
    // focus is what makes that impossible — and the whole source is selected, so
    // the first keystroke rewrites the placeholder instead of appending to it.
    await addEquation();

    expect(document.activeElement).toBe(source());
    expect(source()?.selectionStart).toBe(0);
    expect(source()?.selectionEnd).toBe(MATH_SLOT.length);
  });

  it('writes what the palette says it writes', async () => {
    await addEquation();
    await press(button('Square root'));

    expect(selectedMath(editor.state)?.latex).toBe(`\\sqrt{${MATH_SLOT}}`);
  });

  it('nests one snippet inside another, which is the point of the palette', async () => {
    /**
     * The behaviour no arrangement of slash commands can produce: a fraction
     * INSIDE an integral, in two clicks, because each insertion leaves the next
     * hole selected for the following one to replace.
     */
    await addEquation();
    await press(button('Definite integral'));
    await press(button('Fraction'));

    expect(selectedMath(editor.state)?.latex).toBe(
      `\\int_{\\frac{${MATH_SLOT}}{${MATH_SLOT}}}^{${MATH_SLOT}} ${MATH_SLOT} \\, d${MATH_SLOT}`,
    );
  });

  it('leaves the caret on a hole, ready for the next thing typed', async () => {
    await addEquation();
    await press(button('Fraction'));

    const input = source();
    expect(input?.value.slice(input.selectionStart, input.selectionEnd)).toBe(MATH_SLOT);
  });

  it('keeps the note in step with the source on every keystroke', async () => {
    await addEquation();

    const input = source()!;
    await act(async () => {
      // Through the native setter, because React tracks the last value it wrote
      // and swallows an `input` event whose value it believes it already has.
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set;
      setter?.call(input, '\\frac{1}{2}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();

    // The document, not just the input: the preview IS the stored node, so if
    // these ever drift the user is editing something they cannot see.
    expect(editor.state.doc.firstChild?.attrs.latex).toBe('\\frac{1}{2}');
  });

  it('closes and takes the empty formula with it', async () => {
    await addEquation();
    await press(button('Remove'));

    expect(source()).toBeNull();
    expect(editor.state.doc.firstChild?.type.name).not.toBe('blockMath');
  });

  it('never opens beside the formatting menu', async () => {
    // Both would claim the same coordinates: a selected atom reads as a
    // non-empty selection, which is exactly FormatBubbleMenu's condition.
    await addEquation();

    expect(document.body.querySelector('button[aria-label="Bold"]')).toBeNull();
  });
});
