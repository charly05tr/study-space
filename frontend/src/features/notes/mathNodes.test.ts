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
  decorateTokens,
  deleteMath,
  exitMath,
  findSlot,
  insertEquation,
  insertSnippet,
  selectedMath,
  nextToken,
  slotRanges,
  tokenIndexAt,
  tokenRanges,
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

  it('does not mistake a longer command for a hole', () => {
    // `\squarecup` is a real symbol. Offering its first eight characters as
    // somewhere to type would cut the command in half on the first keystroke.
    expect(findSlot('a \\squarecup b')).toBeNull();
  });
});

describe('slotRanges', () => {
  it('lists the holes in the order they are written', () => {
    const latex = `\\frac{${MATH_SLOT}}{x + ${MATH_SLOT}}`;
    const ranges = slotRanges(latex);

    expect(ranges).toHaveLength(2);
    expect(ranges[0].start).toBeLessThan(ranges[1].start);
    ranges.forEach((range) => {
      expect(latex.slice(range.start, range.end)).toBe(MATH_SLOT);
    });
  });

  it('starts from the beginning on every call', () => {
    // A `g` regex kept between calls resumes at its last match, which would make
    // the second reader of the same formula see fewer holes than the first.
    const latex = `${MATH_SLOT} + ${MATH_SLOT}`;

    expect(slotRanges(latex)).toEqual(slotRanges(latex));
  });
});

describe('tokenRanges', () => {
  /** The text each token covers, which is what a reader would point at. */
  const tokensOf = (latex: string) =>
    tokenRanges(latex).map((range) => latex.slice(range.start, range.end));

  it('finds the leaves and steps over the structure', () => {
    expect(tokensOf('\\frac{2}{3}')).toEqual(['2', '3']);
  });

  it('keeps a number whole', () => {
    // `3.14` is a number, not four things. Clicking it has to offer the number.
    expect(tokensOf('3.14 + 20')).toEqual(['3.14', '20']);
  });

  it('splits letters, because xy is x times y', () => {
    expect(tokensOf('xy')).toEqual(['x', 'y']);
  });

  it('offers symbols but not operators', () => {
    // A binary operator inside a group stops being one, and the space either
    // side of it collapses — so `+` is edited in the source line, not in a box.
    expect(tokensOf('\\alpha + \\beta')).toEqual(['\\alpha', '\\beta']);
    expect(tokensOf('a \\leq b')).toEqual(['a', 'b']);
  });

  it('leaves an environment name alone', () => {
    // Scanned as maths, `pmatrix` is seven letters — and tagging them would
    // rewrite `\begin{pmatrix}` into something that is not an environment.
    expect(tokensOf('\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}')).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
  });

  it('leaves prose alone', () => {
    // `\square` and the `\html*` family are math-mode only: a tag inside `\text`
    // is a parse error, not a box.
    expect(tokensOf('\\text{if} x')).toEqual(['x']);
  });

  it('counts a hole as somewhere to type', () => {
    expect(tokensOf(`\\sqrt{${MATH_SLOT}}`)).toEqual([MATH_SLOT]);
  });
});

describe('tokenIndexAt', () => {
  const latex = `\\frac{${MATH_SLOT}}{${MATH_SLOT}}`;

  it('reports the token the caret is sitting in', () => {
    const [first, second] = slotRanges(latex);

    expect(tokenIndexAt(latex, first.start)).toBe(0);
    // Against the end counts too: a Tab that has just filled a hole leaves the
    // caret on its edge, and that is still the box being worked on.
    expect(tokenIndexAt(latex, second.end)).toBe(1);
  });

  it('prefers the token the caret is inside to the one it is against', () => {
    // Offset 2 of `12□` is the end of the number AND the start of the hole. The
    // hole is the answer, or Tab lands one box behind where it just went.
    const run = `12${MATH_SLOT}`;
    expect(tokenIndexAt(run, 2)).toBe(1);
  });

  it('reports nothing when the caret is in the structure', () => {
    expect(tokenIndexAt(latex, 0)).toBe(-1);
  });
});

describe('decorateTokens', () => {
  it('tags every token with its position, so a click can be traced back', () => {
    expect(decorateTokens('\\sqrt{2}')).toBe('\\sqrt{{\\htmlData{slot=0}{2}}}');
  });

  it('marks the holes, so only they are drawn as holes', () => {
    // A formula where every number wears a tinted box is a formula nobody reads.
    const decorated = decorateTokens(`\\frac{2}{${MATH_SLOT}}`);

    expect(decorated).toContain('\\htmlData{slot=0}{2}');
    expect(decorated).toContain(`\\htmlData{slot=1,hole=1}{${MATH_SLOT}}`);
  });

  it('leaves a formula with nothing to point at exactly as it was', () => {
    expect(decorateTokens('+ - =')).toBe('+ - =');
  });

  it('braces the wrapper, or an exponent stops rendering', () => {
    /**
     * The one that would fail silently.
     *
     * `x^\htmlData{a=b}{2}` is a PARSE ERROR: a superscript takes the next
     * group, and a two-argument command is not one. Unbraced, tagging a power
     * blanks the formula — so this asserts the round trip through KaTeX rather
     * than the string.
     */
    const html = katex.renderToString(decorateTokens('x^2'), {
      throwOnError: false,
      strict: false,
      trust: (context) => context.command === '\\htmlData',
    });

    expect(html).toContain('data-slot="0"');
    expect(html).toContain('data-slot="1"');
  });

  it('renders a hole inside a script too', () => {
    const html = katex.renderToString(decorateTokens(`x^{${MATH_SLOT}}`), {
      throwOnError: false,
      strict: false,
      trust: (context) => context.command === '\\htmlData',
    });

    expect(html).toContain('data-hole="1"');
  });
});

describe('nextToken', () => {
  /**
   * A fraction, laid out the way KaTeX lays one out: numerator above
   * denominator, and a `+ 1` to the right of the whole thing.
   *
   * Written out by hand because jsdom has no layout — every rect it reports is
   * zero — so the geometry is tested where it is decided rather than through the
   * DOM. These are the numbers a browser would give.
   */
  const boxes = [
    { index: 0, left: 10, right: 20, top: 0, bottom: 10 }, // numerator
    { index: 1, left: 10, right: 20, top: 20, bottom: 30 }, // denominator
    { index: 2, left: 40, right: 50, top: 10, bottom: 20 }, // the 1 beside it
  ];

  it('goes down into the denominator, which the source order cannot tell it', () => {
    // In the string the denominator IS the next thing — and so is everything
    // after the fraction. Only the layout says which is which.
    expect(nextToken(boxes, 0, 'down')).toBe(1);
    expect(nextToken(boxes, 1, 'up')).toBe(0);
  });

  it('goes right past the whole fraction', () => {
    expect(nextToken(boxes, 0, 'right')).toBe(2);
    expect(nextToken(boxes, 1, 'right')).toBe(2);
  });

  it('prefers what is straight ahead to what is merely near', () => {
    // The denominator is closer to the numerator than the 1 is, but it is not
    // to the RIGHT of it — the cross-axis weight is what settles that.
    expect(nextToken(boxes, 0, 'right')).not.toBe(1);
  });

  it('reports the edge of the formula rather than wrapping', () => {
    // Wrapping would trap the caret: an arrow at the edge has to be able to mean
    // "leave", the way it does everywhere else in the note.
    expect(nextToken(boxes, 2, 'right')).toBeNull();
    expect(nextToken(boxes, 0, 'up')).toBeNull();
  });

  it('reports nothing for a box it does not know', () => {
    expect(nextToken(boxes, 9, 'left')).toBeNull();
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
