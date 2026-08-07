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

/**
 * A hole in the formula AS DRAWN IN THE NOTE, by index and never by DOM
 * position.
 *
 * KaTeX does not lay a formula out in the order it is written: a fraction is a
 * vertical list built bottom-up, so the denominator's span comes first in the
 * document. Reading the boxes in tree order would pair every click with the
 * wrong half of the source — which is the whole reason each one carries the
 * index of the `\square` it stands for.
 */
const box = (index: number) =>
  document.body.querySelector<HTMLElement>(`[data-type="block-math"] [data-slot="${index}"]`);

/** The input that appears inside a clicked box. */
const field = () => document.body.querySelector<HTMLInputElement>('.math-slot-field');

/** Types into the note's box the way a person does: one native input event. */
const type = async (text: string) => {
  const input = field()!;
  await act(async () => {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
};

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

  it('puts an input in the box that was clicked, in the note', async () => {
    /**
     * The interaction the source line cannot offer: `\square` is a word someone
     * has to learn to read, and a formula with two of them is two identical
     * strings among the backslashes. The formula on the page already shows the
     * writer where the holes are — this makes them the place to type.
     */
    await addEquation();
    await press(button('Fraction'));

    expect(document.body.querySelectorAll('[data-type="block-math"] [data-slot]')).toHaveLength(2);
    expect(field()).toBeNull();

    await press(box(1));

    expect(field()).not.toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it('writes what is typed in the box into the formula, keystroke by keystroke', async () => {
    await addEquation();
    await press(button('Fraction'));
    await press(box(1));
    await type('2');

    // The document, not the input: the note autosaves from the node, and a box
    // holding text the document has not got is a box that can lose it.
    expect(editor.state.doc.firstChild?.attrs.latex).toBe(`\\frac{${MATH_SLOT}}{2}`);
  });

  it('gives an emptied box its hole back', async () => {
    // The formula stays valid LaTeX between keystrokes, and someone deleting
    // what they wrote is not asking to lose the slot.
    await addEquation();
    await press(button('Fraction'));
    await press(box(0));
    await type('x');
    await type('');

    expect(editor.state.doc.firstChild?.attrs.latex).toBe(
      `\\frac{${MATH_SLOT}}{${MATH_SLOT}}`,
    );
  });

  it('lights the hole being worked on', async () => {
    await addEquation();
    await press(button('Fraction'));

    // The insertion left the first hole selected in the panel, and the note
    // draws that one lit — the two surfaces are views of one string.
    expect(box(0)?.hasAttribute('data-slot-active')).toBe(true);
    expect(box(1)?.hasAttribute('data-slot-active')).toBe(false);

    await press(box(1));

    expect(box(0)?.hasAttribute('data-slot-active')).toBe(false);
    expect(box(1)?.hasAttribute('data-slot-active')).toBe(true);
  });

  it('lands a palette snippet in the box being typed in', async () => {
    // The panel keeps its selection on whatever the note's box covers, so the
    // palette stays usable without the keyboard leaving the formula.
    await addEquation();
    await press(button('Fraction'));
    await press(box(1));
    await press(button('Square root'));

    expect(editor.state.doc.firstChild?.attrs.latex).toBe(
      `\\frac{${MATH_SLOT}}{\\sqrt{${MATH_SLOT}}}`,
    );
  });

  it('opens a written token holding what is already there', async () => {
    // The difference between filling a formula in and EDITING one: a 2 clicked
    // on comes back as a 2 that can be corrected, not as a blank to retype.
    await addEquation();
    await press(button('Fraction'));
    await press(box(0));
    await type('12');
    await press(box(1));
    await press(box(0));

    expect(field()?.value).toBe('12');
    // Selected, because clicking a token says it is the thing being changed.
    expect(field()?.selectionStart).toBe(0);
    expect(field()?.selectionEnd).toBe(2);
  });

  it('rewrites a number that was already written', async () => {
    await addEquation();
    await press(button('Fraction'));
    await press(box(0));
    await type('12');
    await press(box(1));
    await press(box(0));
    await type('7');

    expect(editor.state.doc.firstChild?.attrs.latex).toBe(`\\frac{7}{${MATH_SLOT}}`);
  });

  it('marks holes apart from written tokens, so only holes look fillable', async () => {
    await addEquation();
    await press(button('Fraction'));
    await press(box(0));
    await type('9');
    await press(box(1));

    // Every part of the formula is a target; only the empty one advertises it.
    expect(box(0)?.hasAttribute('data-hole')).toBe(false);
    expect(box(1)?.hasAttribute('data-hole')).toBe(true);
  });

  it('walks out of the formula when an arrow runs out of boxes', async () => {
    /**
     * The edge case, which in jsdom is the ONLY case: there is no layout here,
     * so every box reports a zero rect and `nextToken` finds nothing in any
     * direction. The geometry itself is tested against real coordinates in
     * mathNodes.test.ts; what this covers is that a formula is never a keyboard
     * trap — an arrow with nowhere to go inside means what it means in prose.
     */
    await addEquation();
    await press(button('Fraction'));
    await press(box(0));

    const input = field()!;
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      );
    });
    await settle();

    expect(field()).toBeNull();
    expect(source()).toBeNull();
    expect(editor.state.selection.empty).toBe(true);
  });

  it('keeps the source line in step with the box', async () => {
    await addEquation();
    await press(button('Fraction'));
    await press(box(0));
    await type('a');

    expect(source()?.value).toBe(`\\frac{a}{${MATH_SLOT}}`);
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
