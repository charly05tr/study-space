import type { ChainedCommands } from '@tiptap/core';
import { Mathematics } from '@tiptap/extension-mathematics';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, Selection, type EditorState } from '@tiptap/pm/state';

/**
 * Formulas, as a study note needs them.
 *
 * Built on `@tiptap/extension-mathematics` (KaTeX) rather than a hand-rolled
 * node, and the reason is the same one behind the tables: rendering LaTeX is a
 * solved problem with a hard, boring core — spacing rules, font metrics, six
 * different kinds of delimiter growth — and none of it is what this app is for.
 *
 * What the extension does NOT give us is the editing experience. Both nodes are
 * ATOMS holding a single `latex` string attribute; the package renders them and
 * offers insert/update/delete commands, and stops there. Everything below is
 * ours: the placeholder slots, the snippet catalogue behind the palette, and the
 * way out of a formula once it is written. See MathMenu.tsx for the surface.
 *
 * Deliberately absent from ID_BEARING_BLOCKS: a formula is one opaque string,
 * not prose. The graph has nothing to link to inside it, and a node whose whole
 * content is `\frac{a}{b}` would draw a concept-map bubble reading "\frac{a}{b}".
 */
export const BLOCK_MATH = 'blockMath';
export const INLINE_MATH = 'inlineMath';

export const NoteMath = Mathematics.configure({
  katexOptions: {
    /**
     * The single most important option here, and it is about TYPING.
     *
     * The preview re-renders on every keystroke, and a formula halfway through
     * being typed is almost always invalid — `\fra`, `\frac{x}` — so throwing
     * would blank the block on most keystrokes and only show something on the
     * few where the string happens to parse. With this off, KaTeX renders what
     * it understood and leaves the offending command as red text in place, so
     * the fraction you already built stays on screen while you write the next
     * one.
     */
    throwOnError: false,
    /**
     * A CSS variable, not a hex value: KaTeX drops this straight into an inline
     * `color:` style, so it goes through the same token as every other error in
     * the app — and flips with the dark theme, which a baked-in red would not.
     */
    errorColor: 'var(--color-danger)',
    /**
     * Off, because "strict" here does not mean "safer", it means WARN: the
     * default logs a console warning for perfectly renderable input like a
     * Unicode minus or an accented character pasted out of a PDF. Study notes
     * are full of exactly that.
     */
    strict: false,
  },
});

/**
 * The placeholder that stands in for "something goes here".
 *
 * `\square` and not a literal `□` or an empty `{}`, and this one choice is what
 * makes the palette work at all:
 *
 *   - it RENDERS, as an empty box, so a fraction inserted from the palette
 *     looks like a fraction with two holes rather than like nothing at all;
 *   - it is a normal LaTeX command, so a formula left half-filled still parses
 *     and still saves — no invalid state ever reaches the database;
 *   - it is a plain substring of the source, so "jump to the next hole" is a
 *     string search rather than a parser.
 *
 * One token, three jobs. Changing it means changing all three.
 */
export const MATH_SLOT = '\\square';

export interface MathSnippet {
  key: string;
  /** The button's accessible name — what this is, not what it types. */
  label: string;
  /** Inserted at the caret. Holes are MATH_SLOT. */
  latex: string;
  /**
   * What the button draws, when that differs from what it inserts.
   *
   * The two come apart for the postfix operators. `x²` inserts `^{\square}`
   * ALONE, because the base is whatever the user already typed — inserting a
   * leading slot too would hand them `□^{□}` next to their `x`. The button still
   * has to draw a base, though: a lone floating exponent is unreadable.
   */
  preview?: string;
}

export interface MathGroup {
  title: string;
  snippets: MathSnippet[];
}

const slot = MATH_SLOT;

/**
 * The catalogue behind the palette.
 *
 * Grouped the way a formula is BUILT rather than the way LaTeX documents it:
 * the first group is the shapes that hold other things, the last ones are the
 * single characters you drop into them. Order inside a group is by how often a
 * study note reaches for it.
 *
 * This is deliberately not exhaustive — LaTeX has thousands of symbols and a
 * palette that lists them is a font viewer, not a tool. Anything missing is one
 * typed backslash away in the same input, which is the whole point of keeping
 * the source editable instead of hiding it behind buttons.
 */
export const MATH_GROUPS: MathGroup[] = [
  {
    title: 'Fractions and powers',
    snippets: [
      { key: 'frac', label: 'Fraction', latex: `\\frac{${slot}}{${slot}}` },
      // Postfix: the base is already on the line. See MathSnippet.preview.
      { key: 'sup', label: 'Power', latex: `^{${slot}}`, preview: `${slot}^{${slot}}` },
      { key: 'sub', label: 'Subscript', latex: `_{${slot}}`, preview: `${slot}_{${slot}}` },
      { key: 'sqrt', label: 'Square root', latex: `\\sqrt{${slot}}` },
      { key: 'nthroot', label: 'Nth root', latex: `\\sqrt[${slot}]{${slot}}` },
      { key: 'abs', label: 'Absolute value', latex: `\\left|${slot}\\right|` },
    ],
  },
  {
    title: 'Calculus',
    snippets: [
      {
        key: 'int',
        label: 'Definite integral',
        latex: `\\int_{${slot}}^{${slot}} ${slot} \\, d${slot}`,
      },
      { key: 'int-indef', label: 'Indefinite integral', latex: `\\int ${slot} \\, d${slot}` },
      { key: 'sum', label: 'Summation', latex: `\\sum_{${slot}}^{${slot}} ${slot}` },
      { key: 'prod', label: 'Product', latex: `\\prod_{${slot}}^{${slot}} ${slot}` },
      { key: 'lim', label: 'Limit', latex: `\\lim_{${slot} \\to ${slot}} ${slot}` },
      { key: 'deriv', label: 'Derivative', latex: `\\frac{d${slot}}{d${slot}}` },
      {
        key: 'partial',
        label: 'Partial derivative',
        latex: `\\frac{\\partial ${slot}}{\\partial ${slot}}`,
      },
    ],
  },
  {
    title: 'Relations',
    snippets: [
      { key: 'neq', label: 'Not equal', latex: '\\neq' },
      { key: 'leq', label: 'Less than or equal', latex: '\\leq' },
      { key: 'geq', label: 'Greater than or equal', latex: '\\geq' },
      { key: 'approx', label: 'Approximately', latex: '\\approx' },
      { key: 'pm', label: 'Plus or minus', latex: '\\pm' },
      { key: 'times', label: 'Times', latex: '\\times' },
      { key: 'cdot', label: 'Dot product', latex: '\\cdot' },
      { key: 'div', label: 'Divided by', latex: '\\div' },
      { key: 'infty', label: 'Infinity', latex: '\\infty' },
      { key: 'to', label: 'Tends to', latex: '\\to' },
    ],
  },
  {
    title: 'Sets and logic',
    snippets: [
      { key: 'in', label: 'Element of', latex: '\\in' },
      { key: 'notin', label: 'Not an element of', latex: '\\notin' },
      { key: 'subset', label: 'Subset of', latex: '\\subset' },
      { key: 'cup', label: 'Union', latex: '\\cup' },
      { key: 'cap', label: 'Intersection', latex: '\\cap' },
      { key: 'emptyset', label: 'Empty set', latex: '\\emptyset' },
      { key: 'forall', label: 'For all', latex: '\\forall' },
      { key: 'exists', label: 'There exists', latex: '\\exists' },
      { key: 'implies', label: 'Implies', latex: '\\Rightarrow' },
      { key: 'iff', label: 'If and only if', latex: '\\iff' },
    ],
  },
  {
    title: 'Greek',
    snippets: [
      { key: 'alpha', label: 'Alpha', latex: '\\alpha' },
      { key: 'beta', label: 'Beta', latex: '\\beta' },
      { key: 'gamma', label: 'Gamma', latex: '\\gamma' },
      { key: 'delta', label: 'Delta', latex: '\\delta' },
      { key: 'theta', label: 'Theta', latex: '\\theta' },
      { key: 'lambda', label: 'Lambda', latex: '\\lambda' },
      { key: 'mu', label: 'Mu', latex: '\\mu' },
      { key: 'pi', label: 'Pi', latex: '\\pi' },
      { key: 'sigma', label: 'Sigma', latex: '\\sigma' },
      { key: 'phi', label: 'Phi', latex: '\\phi' },
      { key: 'omega', label: 'Omega', latex: '\\omega' },
      { key: 'Delta', label: 'Capital delta', latex: '\\Delta' },
    ],
  },
  {
    title: 'Structures',
    snippets: [
      {
        key: 'matrix',
        label: 'Matrix',
        latex: `\\begin{pmatrix} ${slot} & ${slot} \\\\ ${slot} & ${slot} \\end{pmatrix}`,
      },
      {
        key: 'cases',
        label: 'Piecewise',
        latex: `\\begin{cases} ${slot} & ${slot} \\\\ ${slot} & ${slot} \\end{cases}`,
      },
      { key: 'binom', label: 'Binomial coefficient', latex: `\\binom{${slot}}{${slot}}` },
      { key: 'vec', label: 'Vector', latex: `\\vec{${slot}}` },
      { key: 'bar', label: 'Mean', latex: `\\overline{${slot}}` },
      { key: 'hat', label: 'Hat', latex: `\\hat{${slot}}` },
      /*
        No `\text{}` button, and it is not an oversight.

        `\square` is a math-mode symbol, so `\text{\square}` is a parse error —
        the one place in the catalogue where a snippet cannot carry a hole. A
        button that inserts `\text{}` with the caret parked outside the braces
        is worse than no button, and typing `\text{...}` in the source works
        perfectly. The catalogue test is what will catch this if anyone re-adds
        it.
      */
    ],
  },
];

/** Flat view, for the tests and for anything that needs a lookup by key. */
export const MATH_SNIPPETS: MathSnippet[] = MATH_GROUPS.flatMap((group) => group.snippets);

/** What a button draws: its own preview if it has one, otherwise what it types. */
export const snippetPreview = (snippet: MathSnippet): string => snippet.preview ?? snippet.latex;

export interface TextRange {
  start: number;
  end: number;
}

/**
 * The next hole to fill, searching forward from `from` and wrapping once.
 *
 * Wrapping is what makes Tab a cycle rather than a dead end: someone filling in
 * a matrix works left to right, hits the last cell, and expects the next Tab to
 * take them back to the first — not to do nothing while they wonder whether the
 * key is broken.
 *
 * Returns null only when the formula has no holes left, which is the signal to
 * leave the input rather than to move inside it.
 */
export const findSlot = (latex: string, from = 0): TextRange | null => {
  const ahead = latex.indexOf(MATH_SLOT, from);
  const at = ahead === -1 ? latex.indexOf(MATH_SLOT) : ahead;

  return at === -1 ? null : { start: at, end: at + MATH_SLOT.length };
};

export interface SnippetInsertion {
  latex: string;
  /** Where the input's selection has to land once the new value is in. */
  select: TextRange;
}

/**
 * Drops a snippet into the source at the current selection.
 *
 * Replaces the selection rather than inserting beside it, which is what makes
 * the palette compose: with a hole selected — and one always is, right after
 * the previous insertion — clicking "fraction" puts the fraction INSIDE the
 * integral instead of after it. That single behaviour is the whole reason the
 * palette is a palette and not fifteen separate slash commands, none of which
 * could ever nest.
 *
 * The caret then lands on the snippet's first hole, so the next thing typed
 * goes where it belongs. A snippet with no holes — a lone `\pi` — leaves the
 * caret after itself, because there is nothing to fill.
 */
export const insertSnippet = (
  latex: string,
  range: TextRange,
  snippet: string,
): SnippetInsertion => {
  const next = latex.slice(0, range.start) + snippet + latex.slice(range.end);
  const inserted = findSlot(snippet);

  if (!inserted) {
    const caret = range.start + snippet.length;
    return { latex: next, select: { start: caret, end: caret } };
  }

  return {
    latex: next,
    select: {
      start: range.start + inserted.start,
      end: range.start + inserted.end,
    },
  };
};

export interface SelectedMath {
  /** Which of the two nodes it is — they differ only in how they lay out. */
  type: typeof BLOCK_MATH | typeof INLINE_MATH;
  pos: number;
  node: PMNode;
  latex: string;
}

/**
 * The formula the user is editing, or null.
 *
 * A NodeSelection is the contract, not the caret being nearby: both nodes are
 * atoms, so selecting one is exactly what clicking it or arrowing onto it does,
 * and it is unambiguous in a way "the caret is next to something" is not.
 */
export const selectedMath = (state: EditorState): SelectedMath | null => {
  const { selection } = state;
  if (!(selection instanceof NodeSelection)) return null;

  const { node, from } = selection;
  const type = node.type.name;
  if (type !== BLOCK_MATH && type !== INLINE_MATH) return null;

  return { type, pos: from, node, latex: node.attrs.latex ?? '' };
};

/**
 * Inserts an equation block and leaves it selected.
 *
 * `insertContent` and NOT the extension's own `insertBlockMath`, which is the
 * fix for `/equation` doing nothing at all. That command resolves its insertion
 * point from `editor.state.selection`, and inside a chain the editor still
 * holds the state from BEFORE the chain started. The `/` menu always chains:
 * `chain().focus().deleteRange(range)` removes the typed `/equation` first, so
 * by the time the insert runs, the position it read from the editor is past the
 * end of the transaction's document — a RangeError that aborts the whole chain
 * and leaves the menu item looking inert. `insertContent` reads `tr.selection`,
 * which is the only position that means anything mid-chain.
 *
 * The second half is not a nicety either. Insertion parks the caret AFTER the
 * new node, and for an atom that means the editor is holding a formula nobody
 * is editing: the palette never opens and the user gets an empty box on the
 * page with no way in except to go back and click it.
 *
 * The node is found by scanning back from the caret rather than by arithmetic
 * on the insertion point, because what `insertContentAt` does to the paragraph
 * it was called in varies: an empty one is replaced, a written one is split, and
 * the offset differs by a node boundary between the two cases.
 */
export const insertEquation = (chain: ChainedCommands): ChainedCommands =>
  chain
    .insertContent({ type: BLOCK_MATH, attrs: { latex: MATH_SLOT } })
    .command(({ tr, dispatch }) => {
      if (!dispatch) return true;

      let at: number | null = null;
      tr.doc.nodesBetween(0, tr.selection.from, (node, pos) => {
        if (node.type.name === BLOCK_MATH) at = pos;
      });

      if (at === null) return true;

      tr.setSelection(NodeSelection.create(tr.doc, at));
      return true;
    });

/**
 * Leaves the formula and puts the caret back in the prose, on the side asked for.
 *
 * Not optional, and not the same as focusing the editor. A NodeSelection is a
 * SELECTED node: the next character typed would replace the whole formula with
 * itself. So a confirm that only restored focus would be a trap — press Escape,
 * type a word, watch the equation vanish.
 *
 * The direction is what keeps the formula inside the document rather than beside
 * it: arrowing past the end of the source moves on to the next line, arrowing
 * back off its start returns to the one above, exactly as it would through a
 * paragraph. Without that the panel is a modal you have to dismiss.
 *
 * `Selection.findFrom` with textOnly is the same idiom BlockEditor uses on
 * load, for the mirror-image reason: there it nudges off an atom the document
 * opened on, here it nudges off one the user is finished with. When there is
 * nothing on that side to land in — the usual case going forward, since the
 * equation was just added at the end — a paragraph is created to receive it.
 */
export const exitMath = (chain: ChainedCommands, direction: 1 | -1 = 1): ChainedCommands =>
  chain.command(({ tr, state, dispatch }) => {
    const math = selectedMath(state);
    if (!math || !dispatch) return true;

    const edge = direction === 1 ? math.pos + math.node.nodeSize : math.pos;
    const target = Selection.findFrom(tr.doc.resolve(edge), direction, true);

    if (target) {
      tr.setSelection(target);
      return true;
    }

    // Inline math always has a paragraph around it, so this is the block case:
    // an equation with no line on that side of it — first or last in the note.
    tr.insert(edge, state.schema.nodes.paragraph.create());
    // `edge + 1`, not `edge`, and the same either way: inserting AT the edge
    // puts the new paragraph's opening token there, so its inside — the only
    // place a caret can sit — is one position further in.
    tr.setSelection(Selection.near(tr.doc.resolve(edge + 1), 1));
    return true;
  });

/** Removes the formula entirely, caret landing where the prose continues. */
export const deleteMath = (chain: ChainedCommands): ChainedCommands =>
  chain.command(({ tr, state, dispatch }) => {
    const math = selectedMath(state);
    if (!math) return false;
    if (dispatch) tr.delete(math.pos, math.pos + math.node.nodeSize);
    return true;
  });
