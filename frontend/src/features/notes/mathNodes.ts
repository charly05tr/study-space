import type { ChainedCommands } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, Selection, type EditorState } from '@tiptap/pm/state';

/**
 * Formulas, as a study note needs them.
 *
 * This file is the part with no DOM in it: the placeholder slots, the snippet
 * catalogue behind the palette, the string arithmetic that decides where the
 * caret lands, and the commands for entering and leaving a formula. Three
 * different surfaces share it — the boxes in the note (mathSlots.ts), the panel
 * (MathMenu.tsx), and the `/equation` item — and none of them owns it.
 *
 * The nodes themselves come from `@tiptap/extension-mathematics` (KaTeX), wired
 * up in mathSlots.ts. Both are ATOMS holding a single `latex` string attribute;
 * the package renders them and offers insert/update/delete commands, and stops
 * there. Everything that makes a formula editable is ours.
 *
 * Deliberately absent from ID_BEARING_BLOCKS: a formula is one opaque string,
 * not prose. The graph has nothing to link to inside it, and a node whose whole
 * content is `\frac{a}{b}` would draw a concept-map bubble reading "\frac{a}{b}".
 */
export const BLOCK_MATH = 'blockMath';
export const INLINE_MATH = 'inlineMath';

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
 * Every hole in the formula, in the order they are written.
 *
 * The boundary guard is what separates a hole from a command that merely starts
 * with one: `\squarecup` is a real LaTeX symbol, and a plain substring search
 * would offer its first eight characters as somewhere to type — then cut the
 * command in half the moment anything was typed there.
 *
 * Source order is not an implementation detail either: it is the contract
 * between the two ways of pointing at a hole. The rendered preview labels its
 * boxes by position in this list, so the third box drawn is the third `\square`
 * written, and a click on one can be turned back into a range in the source.
 */
const SLOT_PATTERN = /\\square(?![a-zA-Z])/g;

export const slotRanges = (latex: string): TextRange[] => {
  const ranges: TextRange[] = [];

  // A fresh regex per call rather than a module constant reused: `g` regexes
  // carry `lastIndex` across calls, so a shared one would resume mid-string.
  const pattern = new RegExp(SLOT_PATTERN.source, 'g');

  for (let match = pattern.exec(latex); match !== null; match = pattern.exec(latex)) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }

  return ranges;
};

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
  const ranges = slotRanges(latex);
  if (ranges.length === 0) return null;

  return ranges.find((range) => range.start >= from) ?? ranges[0];
};

/**
 * The commands that stand for a thing rather than do something to one.
 *
 * Only these are offered as somewhere to type, and the line is drawn where
 * KaTeX draws it: an "ord" is an ordinary atom, the same class as a letter or a
 * digit, so wrapping one changes nothing about how the formula is set. Wrapping
 * a `+` would — a binary operator inside a group stops being a binary operator,
 * and the space either side of it collapses.
 *
 * So relations and operators are edited in the panel's source line, and the
 * boxes in the note are the things a formula is FILLED IN with.
 */
const ORD_COMMANDS = new Set([
  MATH_SLOT,
  '\\alpha',
  '\\beta',
  '\\gamma',
  '\\delta',
  '\\theta',
  '\\lambda',
  '\\mu',
  '\\pi',
  '\\sigma',
  '\\phi',
  '\\omega',
  '\\Delta',
  '\\infty',
  '\\emptyset',
  '\\partial',
]);

/**
 * Commands whose braced argument is a NAME, not maths.
 *
 * `\begin{pmatrix}` is the one that matters: scanned as maths, the environment
 * name reads as seven separate letters, and tagging them would rewrite the
 * command into `\begin{\htmlData{slot=0}{p}matrix}` — which is not an
 * environment at all. `\text` is the same problem with a different symptom:
 * `\square` and the `\html*` family are math-mode only, so a tag inside prose
 * is a parse error.
 */
const OPAQUE_COMMANDS = new Set([
  '\\begin',
  '\\end',
  '\\text',
  '\\textbf',
  '\\textit',
  '\\operatorname',
  '\\mathrm',
  '\\mathbf',
  '\\mathbb',
  '\\mathcal',
]);

const LETTER = /[a-zA-Z]/;
const DIGIT = /[0-9]/;

/**
 * Every part of the formula a person can point at, in source order.
 *
 * A SCANNER and deliberately not a parser: it walks the string looking for the
 * leaves — a number, a letter, a symbol command, a hole — and steps over
 * everything that is structure. It does not need to know what `\frac` means to
 * find the `2` and the `3` inside it, which is the whole trick. What it does
 * need is to keep out of the two places where text is not maths (see
 * OPAQUE_COMMANDS), and that is the only special-casing here.
 *
 * A run of digits is ONE token, because `3.14` is a number rather than four
 * things — clicking it should offer the number, not the `1`.
 */
export const tokenRanges = (latex: string): TextRange[] => {
  const ranges: TextRange[] = [];
  let at = 0;

  while (at < latex.length) {
    const char = latex[at];

    if (char === '\\') {
      // `\\` is a row break in a matrix, not the start of a command.
      if (latex[at + 1] === '\\') {
        at += 2;
        continue;
      }

      let end = at + 1;
      while (end < latex.length && LETTER.test(latex[end])) end += 1;
      const command = latex.slice(at, end);

      if (OPAQUE_COMMANDS.has(command)) {
        // Past the command AND its argument, braces and all.
        at = end;
        if (latex[at] === '{') {
          let depth = 0;
          while (at < latex.length) {
            if (latex[at] === '{') depth += 1;
            else if (latex[at] === '}') {
              depth -= 1;
              if (depth === 0) {
                at += 1;
                break;
              }
            }
            at += 1;
          }
        }
        continue;
      }

      if (ORD_COMMANDS.has(command)) ranges.push({ start: at, end });
      at = end;
      continue;
    }

    if (DIGIT.test(char)) {
      let end = at + 1;
      while (end < latex.length && (DIGIT.test(latex[end]) || latex[end] === '.')) end += 1;
      // A trailing dot is punctuation ending a sentence, not part of the number.
      while (end > at + 1 && latex[end - 1] === '.') end -= 1;
      ranges.push({ start: at, end });
      at = end;
      continue;
    }

    if (LETTER.test(char)) {
      // One letter at a time, because `xy` is x times y in maths — two things a
      // reader would point at separately, not the word "xy".
      ranges.push({ start: at, end: at + 1 });
      at += 1;
      continue;
    }

    at += 1;
  }

  return ranges;
};

/**
 * Which token the caret is in, or -1.
 *
 * Inside wins over adjacent: a caret at offset 2 of `12\square` is against the
 * end of the number AND at the start of the hole, and the hole is the answer —
 * otherwise Tab would land on the token before the one it just found.
 */
export const tokenIndexAt = (latex: string, caret: number): number => {
  const ranges = tokenRanges(latex);
  const inside = ranges.findIndex((range) => caret >= range.start && caret < range.end);

  return inside === -1 ? ranges.findIndex((range) => range.end === caret) : inside;
};

/**
 * The same formula, with every token tagged so the rendering can be clicked.
 *
 * `\htmlData` and not a post-pass over the rendered DOM, which is the obvious
 * alternative and the wrong one: KaTeX emits no source map, so matching spans
 * to tokens afterwards means finding every span that happens to draw a `2` and
 * trusting that document order matches source order — which nothing guarantees
 * for scripts, fractions or matrices. Tagging before the render makes the
 * mapping KaTeX's job instead of a guess.
 *
 * The tag is the token's INDEX, not its offset: offsets move on every keystroke,
 * and the formula is re-rendered from the source anyway.
 *
 * The braces around the wrapper are not decoration. `x^\htmlData{a=b}{2}` is a
 * PARSE ERROR — a superscript takes the next group, and a two-argument command
 * is not one — so an exponent would blank the formula the moment it was tagged.
 */
export const decorateTokens = (latex: string): string => {
  const ranges = tokenRanges(latex);
  if (ranges.length === 0) return latex;

  let out = '';
  let cursor = 0;

  ranges.forEach((range, index) => {
    const body = latex.slice(range.start, range.end);
    // Holes are marked so they can be drawn as holes: a formula where every
    // number wears a tinted box is a formula nobody can read.
    const hole = body === MATH_SLOT ? ',hole=1' : '';

    out += latex.slice(cursor, range.start);
    out += `{\\htmlData{slot=${index}${hole}}{${body}}}`;
    cursor = range.end;
  });

  return out + latex.slice(cursor);
};

export type Direction = 'left' | 'right' | 'up' | 'down';

/** A tagged token as it was actually laid out, in viewport coordinates. */
export interface TokenBox {
  index: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The token an arrow key should move to, or null at the edge of the formula.
 *
 * Geometry rather than source order, and that is the entire point: a formula is
 * TWO-DIMENSIONAL. `\frac{a}{b}` writes the numerator first, so "next in the
 * source" from `a` is `b` — but on the page `b` is DOWN, and whatever follows
 * the fraction is what lies to the right. Source order gets that backwards, and
 * exponents, limits and matrices are all the same shape of problem. KaTeX has
 * already solved the layout; this reads the answer off it.
 *
 * The cross-axis weight is what makes the movement feel deliberate: a candidate
 * three times as far off the line of travel as it is along it loses to one
 * sitting straight ahead, so Down from a numerator finds its own denominator
 * rather than something nearer but sideways.
 */
const CROSS_AXIS_WEIGHT = 3;

export const nextToken = (boxes: TokenBox[], from: number, direction: Direction): number | null => {
  const current = boxes.find((box) => box.index === from);
  if (!current) return null;

  const hereX = (current.left + current.right) / 2;
  const hereY = (current.top + current.bottom) / 2;
  const horizontal = direction === 'left' || direction === 'right';

  let best: number | null = null;
  let bestScore = Infinity;

  boxes.forEach((box) => {
    if (box.index === from) return;

    const dx = (box.left + box.right) / 2 - hereX;
    const dy = (box.top + box.bottom) / 2 - hereY;

    const along = direction === 'right' ? dx : direction === 'left' ? -dx : direction === 'down' ? dy : -dy;
    // Strictly ahead. A box level with this one is not in that direction, which
    // is what keeps Right out of the denominator sitting under the caret.
    if (along <= 0) return;

    const score = along + Math.abs(horizontal ? dy : dx) * CROSS_AXIS_WEIGHT;
    if (score < bestScore) {
      bestScore = score;
      best = box.index;
    }
  });

  return best;
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
