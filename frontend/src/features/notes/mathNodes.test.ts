import { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import katex from 'katex';
import { afterEach, describe, expect, it } from 'vitest';
import { noteExtensions } from './editorExtensions';
import {
  BLOCK_MATH,
  MATH_GROUPS,
  MATH_SLOT,
  MATH_SNIPPETS,
  deleteMath,
  exitMath,
  findSlot,
  insertEquation,
  insertSnippet,
  selectedMath,
  snippetPreview,
} from './mathNodes';
import { toEditorContent } from './noteDocument';

/**
 * The formula block.
 *
 * Three separate things are worth guarding here, and only one of them is code
 * anyone wrote: the catalogue has to be VALID LaTeX, the slot arithmetic has to
 * put the caret where the next keystroke belongs, and a formula has to be
 * enterable and leavable without eating itself. The KaTeX rendering underneath
 * is the library's problem.
 */

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

/** A fresh note holding one equation, with that equation selected. */
const withEquation = () => {
  editor = new Editor({ extensions: noteExtensions });
  insertEquation(editor.chain().focus()).run();
  return editor;
};

const latexOf = (instance: Editor) => selectedMath(instance.state)?.latex;

describe('the snippet catalogue', () => {
  /**
   * The test that pays for itself.
   *
   * Every entry is a hand-typed LaTeX string, and the failure mode of a typo is
   * not an exception at build time — it is a button that quietly writes garbage
   * into a student's note. `throwOnError` is deliberately ON here, unlike in the
   * editor: mid-typing input is expected to be broken, a catalogue entry is not.
   */
  it.each(MATH_SNIPPETS.map((snippet) => [snippet.label, snippet] as const))(
    'renders %s',
    (_label, snippet) => {
      expect(() => katex.renderToString(snippet.latex, { throwOnError: true })).not.toThrow();
      expect(() => katex.renderToString(snippetPreview(snippet), { throwOnError: true })).not.toThrow();
    },
  );

  it('gives every snippet a unique key', () => {
    const keys = MATH_SNIPPETS.map((snippet) => snippet.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('draws a base for the postfix operators', () => {
    // Power and subscript insert `^{□}` alone — the base is whatever the user
    // already typed — so their buttons would otherwise show a floating,
    // unreadable exponent. The preview is what stops that.
    const power = MATH_SNIPPETS.find((snippet) => snippet.key === 'sup');
    expect(power?.latex).toBe(`^{${MATH_SLOT}}`);
    expect(snippetPreview(power!)).toBe(`${MATH_SLOT}^{${MATH_SLOT}}`);
  });

  it('keeps every group non-empty', () => {
    // A heading with nothing under it is dead space in a panel that is already
    // the tallest thing in the editor.
    expect(MATH_GROUPS.every((group) => group.snippets.length > 0)).toBe(true);
  });
});

describe('findSlot', () => {
  it('finds the first hole', () => {
    expect(findSlot(`\\frac{${MATH_SLOT}}{${MATH_SLOT}}`)).toEqual({ start: 6, end: 6 + 7 });
  });

  it('finds the next one after a position', () => {
    const latex = `\\frac{${MATH_SLOT}}{${MATH_SLOT}}`;
    const first = findSlot(latex)!;
    const second = findSlot(latex, first.end)!;

    expect(second.start).toBeGreaterThan(first.start);
  });

  it('wraps around rather than dead-ending', () => {
    // Tab through the last cell of a matrix has to return to the first, or the
    // key stops responding and the user concludes it never worked.
    const latex = `\\sqrt{${MATH_SLOT}}`;
    const only = findSlot(latex)!;

    expect(findSlot(latex, only.end)).toEqual(only);
  });

  it('reports nothing when the formula is filled in', () => {
    expect(findSlot('\\frac{1}{2}')).toBeNull();
  });
});

describe('insertSnippet', () => {
  it('lands the caret on the first hole of what it inserted', () => {
    const result = insertSnippet('', { start: 0, end: 0 }, `\\sqrt{${MATH_SLOT}}`);

    expect(result.latex).toBe(`\\sqrt{${MATH_SLOT}}`);
    expect(result.latex.slice(result.select.start, result.select.end)).toBe(MATH_SLOT);
  });

  it('nests, by replacing the selected hole rather than inserting beside it', () => {
    /**
     * The behaviour the whole palette rests on.
     *
     * A fraction inside an integral is not reachable from a flat list of
     * commands — this is the step that makes it a single click, and the reason
     * `/fraction` is a keyword on one block instead of a block of its own.
     */
    const integral = `\\int ${MATH_SLOT} \\, d${MATH_SLOT}`;
    const hole = findSlot(integral)!;

    const result = insertSnippet(integral, hole, `\\frac{${MATH_SLOT}}{${MATH_SLOT}}`);

    expect(result.latex).toBe(`\\int \\frac{${MATH_SLOT}}{${MATH_SLOT}} \\, d${MATH_SLOT}`);
    expect(result.latex.slice(result.select.start, result.select.end)).toBe(MATH_SLOT);
    // And what it produced is still valid LaTeX, which is the point of nesting
    // structures rather than concatenating strings.
    expect(() => katex.renderToString(result.latex, { throwOnError: true })).not.toThrow();
  });

  it('leaves the caret after a snippet with nothing to fill', () => {
    const result = insertSnippet('x ', { start: 2, end: 2 }, '\\pi');

    expect(result.latex).toBe('x \\pi');
    expect(result.select).toEqual({ start: 5, end: 5 });
  });

  it('replaces a selected range, so a hole is never left behind', () => {
    const result = insertSnippet('\\alpha', { start: 0, end: 6 }, '\\beta');
    expect(result.latex).toBe('\\beta');
  });
});

describe('the equation block', () => {
  it('inserts a formula and leaves it selected, ready to be typed into', () => {
    // Without the selection the palette never opens and the user is left with
    // an empty box on the page and no way into it.
    const instance = withEquation();

    expect(instance.state.selection).toBeInstanceOf(NodeSelection);
    expect(selectedMath(instance.state)?.type).toBe(BLOCK_MATH);
    expect(latexOf(instance)).toBe(MATH_SLOT);
  });

  it('opens on a hole, so the first Tab has somewhere to go', () => {
    expect(findSlot(latexOf(withEquation())!)).not.toBeNull();
  });

  it('updates the stored latex in place', () => {
    const instance = withEquation();
    const { pos } = selectedMath(instance.state)!;

    instance.commands.updateBlockMath({ latex: '\\frac{1}{2}', pos });

    expect(latexOf(instance)).toBe('\\frac{1}{2}');
    // Still selected, so the panel does not close mid-edit.
    expect(instance.state.selection).toBeInstanceOf(NodeSelection);
  });

  it('carries the formula through a save and a reload', () => {
    // The contract under everything else: the latex is the ONLY copy of the
    // equation. A schema change that drops the attribute does not degrade the
    // formula, it deletes it, and nobody notices until they reopen the note.
    const saved = withEquation().getJSON();
    editor?.destroy();

    editor = new Editor({ extensions: noteExtensions, content: toEditorContent(saved) });

    const math = editor.state.doc.firstChild;
    expect(math?.type.name).toBe(BLOCK_MATH);
    expect(math?.attrs.latex).toBe(MATH_SLOT);
  });
});

describe('leaving a formula', () => {
  it('puts the caret in the prose, not on the node', () => {
    /**
     * The trap this prevents: a NodeSelection is a SELECTED node, so a confirm
     * that only restored focus would leave the next typed character replacing
     * the whole equation.
     */
    const instance = withEquation();
    exitMath(instance.chain().focus(), 1).run();

    expect(instance.state.selection).not.toBeInstanceOf(NodeSelection);
    expect(instance.state.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('always has a line to land on, even with the formula last in the note', () => {
    // Two things race to provide it: StarterKit's TrailingNode, which keeps an
    // empty paragraph at the end of every document, and exitMath's own fallback
    // for when there is none. Which one wins is an implementation detail; that
    // the caret never ends up stranded on the atom is not.
    editor = new Editor({
      extensions: noteExtensions,
      content: { type: 'doc', content: [{ type: BLOCK_MATH, attrs: { latex: '\\pi' } }] },
    });

    editor.commands.setNodeSelection(0);
    exitMath(editor.chain().focus(), 1).run();

    expect(editor.state.doc.lastChild?.type.name).toBe('paragraph');
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(editor.state.selection.from).toBeGreaterThan(0);
  });

  it('goes backwards into the line above', () => {
    editor = new Editor({
      extensions: noteExtensions,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
          { type: BLOCK_MATH, attrs: { latex: '\\pi' } },
        ],
      },
    });

    const at = editor.state.doc.child(0).nodeSize;
    editor.commands.setNodeSelection(at);
    expect(selectedMath(editor.state)).not.toBeNull();

    exitMath(editor.chain().focus(), -1).run();

    expect(editor.state.selection.$from.parent.textContent).toBe('before');
    // At the END of it: arrowing back off a formula should continue the
    // sentence, not jump to the start of the line above it.
    expect(editor.state.selection.from).toBe(at - 1);
  });

  it('removes the formula on demand, block and all', () => {
    const instance = withEquation();
    deleteMath(instance.chain().focus()).run();

    expect(instance.state.doc.textContent).toBe('');
    expect(
      instance.state.doc.content.content.some((node) => node.type.name === BLOCK_MATH),
    ).toBe(false);
  });
});
