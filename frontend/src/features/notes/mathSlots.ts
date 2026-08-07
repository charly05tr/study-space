import { Extension, type Editor, type NodeViewRendererProps } from '@tiptap/core';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import { NodeSelection, Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import katex from 'katex';
import {
  BLOCK_MATH,
  MATH_SLOT,
  decorateTokens,
  exitMath,
  findSlot,
  nextToken,
  tokenRanges,
  type Direction,
  type TokenBox,
} from './mathNodes';

/**
 * Filling in a formula where the formula is.
 *
 * The palette can build the SHAPE of an expression — a fraction under an
 * integral, a matrix, a limit — but every one of those arrives full of holes,
 * and until this file existed the only place to fill them was a LaTeX line in a
 * floating panel. That asks the writer to hold two pictures at once: the formula
 * they can see, and the string that produces it. The box they want to type in is
 * right there on the page, and the answer to "how do I fill it" should be to
 * click it.
 *
 * So: every `\square` in a rendered equation is a target, and clicking one puts
 * a small input INSIDE it. What is typed goes straight into the node's `latex`
 * attribute, so the document — and the autosave, and the panel's source line —
 * stay in step with something the writer never had to look away from.
 *
 * The panel does not go away. It owns the palette, and it is still the only way
 * to write LaTeX the catalogue does not cover. What moved is the ordinary case.
 */

/**
 * Where the keyboard is, as far as formula holes are concerned.
 *
 * This lives in ProseMirror state rather than in either surface, and that is the
 * design: there are two editors for one string — the boxes in the note and the
 * source line in the panel — and they have to agree on which hole is being
 * worked on without either owning the other. The node view draws it lit, the
 * panel keeps its textarea selection on it, and the palette inserts into it.
 */
export interface SlotFocus {
  /** The formula the hole belongs to. */
  pos: number;
  /**
   * Which hole, counted in source order — what the note draws lit.
   *
   * Not derivable from the range below, which is why both are here: the moment
   * anything is typed into a hole it stops BEING a hole, so a box halfway
   * through being filled has no index in the current source at all. The number
   * stays pinned to the box on screen; the range follows the text.
   */
  index: number;
  /**
   * What the palette would replace, as offsets into the current source.
   *
   * This is the whole reason a snippet clicked while typing in the note lands in
   * the box being typed in, rather than at a stale offset.
   */
  start: number;
  end: number;
  /** True while the note's own box has the keyboard, rather than the panel. */
  inNote: boolean;
  /**
   * Where the caret goes when the box opens, which records how it was reached.
   *
   * `all` for a click or a Tab — the token is what is being changed, so the
   * first keystroke replaces it. `start` and `end` for an arrow, which is
   * passing THROUGH: the caret waits at the edge the writer came in by, and
   * carrying on in the same direction walks out the other side.
   */
  caret?: 'start' | 'end' | 'all';
}

const slotKey = new PluginKey<SlotFocus | null>('mathSlotFocus');

export const slotFocus = (state: EditorState): SlotFocus | null => slotKey.getState(state) ?? null;

/**
 * Moves the focus, without touching the document.
 *
 * `addToHistory: false` because this is not an edit: an undo that walked back
 * through every box the writer had clicked before undoing anything they typed
 * would be a broken undo.
 */
export const setSlotFocus = (editor: Editor, focus: SlotFocus | null): void => {
  const { tr } = editor.state;
  tr.setMeta(slotKey, focus);
  tr.setMeta('addToHistory', false);
  editor.view.dispatch(tr);
};

const MathSlotFocus = Extension.create({
  name: 'mathSlotFocus',

  addProseMirrorPlugins() {
    return [
      new Plugin<SlotFocus | null>({
        key: slotKey,
        state: {
          init: (): SlotFocus | null => null,
          /**
           * The focus survives edits to the formula and nothing else.
           *
           * Clearing it whenever the selection is no longer THIS node is what
           * keeps the two surfaces honest: a click into the prose, an arrow key
           * out of the equation, a deletion — all of them end with no hole being
           * edited, and neither surface has to notice on its own.
           */
          apply: (tr, value) => {
            const meta = tr.getMeta(slotKey) as SlotFocus | null | undefined;
            const next = meta === undefined ? value : meta;
            if (!next) return null;

            const pos = meta === undefined && tr.docChanged ? tr.mapping.map(next.pos) : next.pos;
            const { selection } = tr;
            if (!(selection instanceof NodeSelection) || selection.from !== pos) return null;

            return pos === next.pos ? next : { ...next, pos };
          },
        },
      }),
    ];
  },
});

/**
 * How a formula is drawn, everywhere.
 *
 * `trust` is the only line here that is not about typography, and it is one
 * command wide on purpose. KaTeX gates every markup-emitting command behind that
 * callback — `\href`, `\url`, `\includegraphics` and the `\html*` family — and
 * the only one this app has any use for is `\htmlData`, which does nothing but
 * put a data attribute on a span. That attribute is what turns a drawn box back
 * into a range in the source; see `decorateSlots`. Everything else a writer
 * types keeps rendering as untrusted red source, exactly as it did before.
 */
const KATEX_OPTIONS = {
  /**
   * The single most important option here, and it is about TYPING.
   *
   * The formula re-renders on every keystroke, and one halfway through being
   * typed is almost always invalid — `\fra`, `\frac{x}` — so throwing would
   * blank the block on most keystrokes and only show something on the few where
   * the string happens to parse. With this off, KaTeX renders what it understood
   * and leaves the offending command as red text in place, so the fraction you
   * already built stays on screen while you write the next one.
   */
  throwOnError: false,
  /**
   * A CSS variable, not a hex value: KaTeX drops this straight into an inline
   * `color:` style, so it goes through the same token as every other error in
   * the app — and flips with the dark theme, which a baked-in red would not.
   */
  errorColor: 'var(--color-danger)',
  /**
   * Off, because "strict" here does not mean "safer", it means WARN: the default
   * logs a console warning for perfectly renderable input like a Unicode minus
   * or an accented character pasted out of a PDF. Study notes are full of
   * exactly that.
   */
  strict: false,
  trust: (context: { command: string }) => context.command === '\\htmlData',
};

/** The class the field carries; the styling is in index.css with the boxes. */
const FIELD_CLASS = 'math-slot-field';

interface OpenField {
  index: number;
  /** The source as it stood when the box was opened, holes and all. */
  base: string;
  start: number;
  end: number;
  input: HTMLInputElement;
}

/**
 * The block formula, drawn with every hole as a place to type.
 *
 * Replaces the node view that ships with `@tiptap/extension-mathematics`, which
 * renders `node.attrs.latex` and stops. The rest of that node view's contract is
 * reproduced here — the wrapper classes, `data-type`, `data-latex`, the error
 * fallback — because index.css and the read-only renderer both target it.
 */
const blockMathView = ({ editor, node, getPos }: NodeViewRendererProps) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'tiptap-mathematics-render';
  if (editor.isEditable) wrapper.classList.add('tiptap-mathematics-render--editable');
  wrapper.dataset.type = 'block-math';

  const inner = document.createElement('div');
  inner.className = 'block-math-inner';
  wrapper.appendChild(inner);

  let current = node;
  let field: OpenField | null = null;
  /** The last value THIS view wrote, so its own keystrokes are not re-rendered
      out from under the input the writer is typing into. */
  let written: string | null = null;

  const focus = (): SlotFocus | null => {
    const at = getPos();
    const state = slotFocus(editor.state);
    return state && at !== undefined && state.pos === at ? state : null;
  };

  /**
   * Which box is drawn lit, and a guard against redrawing it.
   *
   * `reconcile` runs on every transaction in the note — a keystroke three
   * paragraphs away included — and every equation on the page runs its own. The
   * comparison is what keeps that down to a number check instead of a DOM query
   * per formula per keystroke.
   */
  let painted = -1;

  const paint = () => {
    const lit = focus()?.index ?? -1;
    if (lit === painted) return;

    painted = lit;
    inner.querySelectorAll<HTMLElement>('[data-slot]').forEach((box) => {
      box.toggleAttribute('data-slot-active', Number(box.dataset.slot) === lit);
    });
  };

  const render = () => {
    field = null;
    written = null;
    // The boxes it applied to are about to be replaced.
    painted = -1;
    wrapper.setAttribute('data-latex', current.attrs.latex);

    try {
      katex.render(decorateTokens(current.attrs.latex), inner, KATEX_OPTIONS);
      wrapper.classList.remove('block-math-error');
    } catch {
      inner.textContent = current.attrs.latex;
      wrapper.classList.add('block-math-error');
    }

    paint();
  };

  /**
   * What the writer has typed, as it goes into the document.
   *
   * Every keystroke, and not on some confirm: the note the formula lives in
   * autosaves, the panel's source line is a view of the same attribute, and a
   * box holding text that is not in the document yet is a box that can lose it.
   *
   * The rewrite is always computed from `base` — the source as it stood when the
   * box was opened — so it is one substitution rather than a running edit, and
   * a hundred keystrokes cannot drift.
   */
  const commit = () => {
    const at = getPos();
    if (!field || at === undefined) return;

    const typed = field.input.value;
    // An emptied box goes back to being a hole rather than closing up: the
    // formula has to stay valid LaTeX between keystrokes, and a writer who
    // deletes what they wrote is not asking to lose the slot.
    const filled = typed.length > 0 ? typed : MATH_SLOT;
    const next = field.base.slice(0, field.start) + filled + field.base.slice(field.end);
    const region = { start: field.start, end: field.start + filled.length, index: field.index };

    written = next;
    editor
      .chain()
      .updateBlockMath({ latex: next, pos: at })
      // On the SAME transaction, so the palette's target moves with the text
      // instead of trailing a keystroke behind it.
      .command(({ tr }) => {
        tr.setMeta(slotKey, { pos: at, inNote: true, ...region });
        return true;
      })
      .run();

    size();
  };

  /** The input grows with what is in it; an empty one still has to be hittable. */
  const size = () => {
    if (!field) return;
    field.input.style.width = `${Math.max(field.input.value.length, 1) + 0.4}ch`;
  };

  /**
   * Hands the keyboard to one token of the formula.
   *
   * The input opens holding what is ALREADY there — a `2` clicked on comes back
   * as a `2` that can be corrected, not as a blank to retype — and a hole opens
   * empty, because `\square` is the absence of a value rather than a value. That
   * is the only difference between filling in a formula and editing one.
   */
  const open = (index: number, caret: SlotFocus['caret']) => {
    const box = inner.querySelector<HTMLElement>(`[data-slot="${index}"]`);
    const range = tokenRanges(current.attrs.latex)[index];
    if (!box || !range) return;

    const source = current.attrs.latex.slice(range.start, range.end);
    const input = document.createElement('input');
    input.className = FIELD_CLASS;
    input.spellcheck = false;
    input.value = source === MATH_SLOT ? '' : source;
    input.setAttribute('aria-label', 'Edit this part of the formula');

    // The token steps aside for the input, in the span KaTeX already sized and
    // positioned — so what is typed appears exactly where the symbol was, in the
    // formula's own font, rather than floating over it.
    box.textContent = '';
    box.appendChild(input);

    field = { index, base: current.attrs.latex, start: range.start, end: range.end, input };
    size();
    input.focus();

    /**
     * Where the caret lands says how the box was ENTERED.
     *
     * Arrowing in from the left means carrying on rightwards, so the caret waits
     * at the near edge and the token stays as it was. A click means this is the
     * thing being changed, so it arrives selected and the first keystroke
     * replaces it — the same contract a hole has always had.
     */
    if (caret === 'start') input.setSelectionRange(0, 0);
    else if (caret === 'end') input.setSelectionRange(input.value.length, input.value.length);
    else input.setSelectionRange(0, input.value.length);

    input.addEventListener('input', commit);
    input.addEventListener('keydown', onFieldKey);
  };

  /** Where a token sits on the page, which is what the arrow keys navigate by. */
  const boxes = (): TokenBox[] =>
    Array.from(inner.querySelectorAll<HTMLElement>('[data-slot]')).map((box) => {
      const rect = box.getBoundingClientRect();
      return {
        index: Number(box.dataset.slot),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    });

  /**
   * A token index from the drawing, translated into the source as it stands now.
   *
   * The two disagree while a box is open, and they have to: the formula on
   * screen was rendered from `base`, but every keystroke since has gone into the
   * document, so a token drawn after the one being edited has moved by the
   * difference in length. Re-rendering first and asking afterwards is not an
   * option — the numbering the arrow key aimed at would be gone.
   */
  const sourceStart = (index: number): number | null => {
    if (!field) return null;

    const range = tokenRanges(field.base)[index];
    if (!range) return null;

    // What the edited token is worth in the document now — an emptied box is
    // back to being a `\square`, which is seven characters wide, not none.
    const typed = field.input.value;
    const filled = typed.length > 0 ? typed.length : MATH_SLOT.length;
    const shift = filled - (field.end - field.start);

    return range.start >= field.end ? range.start + shift : range.start;
  };

  /** Moves the keyboard to another token of this formula, if there is one. */
  const goTo = (start: number, caret: SlotFocus['caret']): boolean => {
    const at = getPos();
    if (at === undefined) return false;

    const latex = current.attrs.latex;
    const index = tokenRanges(latex).findIndex((range) => range.start === start);
    if (index === -1) return false;

    const range = tokenRanges(latex)[index];
    setSlotFocus(editor, {
      pos: at,
      index,
      start: range.start,
      end: range.end,
      inNote: true,
      caret,
    });

    return true;
  };

  /** Tab: the next HOLE, which is not the same as the next token. Tab is for
      filling a formula in, and stopping at every letter of one already written
      would make it useless for that. */
  const step = (): boolean => {
    if (!field) return false;

    // From the far side of what was just typed, so the box being left is not the
    // one Tab lands on.
    const after = field.start + Math.max(field.input.value.length, MATH_SLOT.length);
    const target = findSlot(current.attrs.latex, after);

    return target ? goTo(target.start, 'all') : false;
  };

  /**
   * An arrow key, answered with geometry rather than with source order.
   *
   * See `nextToken`: a formula is two-dimensional, and the string that produces
   * it is not. Down from a numerator has to find the denominator, which in the
   * source is the NEXT thing — while Right from that same numerator has to skip
   * the whole fraction, which in the source is also the next thing.
   */
  const move = (direction: Direction): void => {
    if (!field) return;

    const target = nextToken(boxes(), field.index, direction);
    if (target === null) {
      // Nothing that way inside the formula: the arrow means what it means
      // everywhere else in the note, and carries on out into the prose.
      leave(direction === 'left' || direction === 'up' ? -1 : 1);
      return;
    }

    const start = sourceStart(target);
    if (start === null) return;

    goTo(start, direction === 'right' || direction === 'down' ? 'start' : 'end');
  };

  /**
   * Done with the formula: the caret goes back to the prose.
   *
   * Not merely closing the input, and not the same as focusing the editor. The
   * node is an ATOM, so leaving it selected means the next character typed
   * replaces the whole formula with itself — `exitMath` is what puts the caret
   * on the far side of it instead. The focus state clears itself once the
   * selection is no longer this node.
   */
  const leave = (direction: 1 | -1 = 1) => {
    render();
    exitMath(editor.chain().focus(), direction).run();
  };

  function onFieldKey(event: KeyboardEvent) {
    const input = event.currentTarget as HTMLInputElement;

    if (event.key === 'Tab') {
      event.preventDefault();
      step();
      return;
    }

    if (event.key === 'Escape' || event.key === 'Enter') {
      event.preventDefault();
      leave(1);
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      // Always: an input is one line tall, so up and down have nothing to do
      // inside it and everything to do in the formula around it.
      event.preventDefault();
      move(event.key === 'ArrowUp' ? 'up' : 'down');
      return;
    }

    /**
     * Sideways only from the very edge, and only with nothing selected.
     *
     * Anywhere else the arrow is doing its ordinary job — walking through the
     * text in this box, or collapsing a selection — and hijacking it would make
     * a two-character token impossible to put a caret inside.
     */
    const collapsed = input.selectionStart === input.selectionEnd;
    if (event.key === 'ArrowLeft' && collapsed && input.selectionStart === 0) {
      event.preventDefault();
      move('left');
      return;
    }

    if (event.key === 'ArrowRight' && collapsed && input.selectionEnd === input.value.length) {
      event.preventDefault();
      move('right');
    }
  }

  /**
   * A click on a hole, which is the whole point of the file.
   *
   * `mousedown` and not `click`: by the time a click fires the browser has
   * already moved the selection, and ProseMirror has already decided what the
   * click meant. Both are prevented here — the transaction below says what it
   * meant instead.
   *
   * A click anywhere ELSE in the formula is left alone, so selecting the block
   * still works the way it always did.
   */
  const onMouseDown = (event: MouseEvent) => {
    if (!editor.isEditable) return;

    const target = event.target as HTMLElement | null;
    const box = target?.closest<HTMLElement>('[data-slot]');
    const at = getPos();
    if (!box || at === undefined) return;

    const index = Number(box.dataset.slot);
    const range = tokenRanges(current.attrs.latex)[index];
    if (!range) return;

    event.preventDefault();
    event.stopPropagation();

    const { tr } = editor.state;
    // Selecting the node too, because the panel is anchored to the selection:
    // clicking a box has to bring the palette with it, or filling in a formula
    // means clicking the formula twice.
    tr.setSelection(NodeSelection.create(editor.state.doc, at));
    tr.setMeta(slotKey, {
      pos: at,
      index,
      start: range.start,
      end: range.end,
      inNote: true,
      // Clicked, so this is the thing being changed: it arrives selected.
      caret: 'all',
    });
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  };

  /**
   * The focus state drives the input, and never the other way around.
   *
   * Every path that changes which hole is being worked on — a click here, a Tab,
   * a caret move in the panel, a snippet dropped into this box from the palette
   * — ends in a transaction, and this is the one place that reacts to it. The
   * alternative is four call sites each remembering to open and close an input,
   * which is four chances to leave one behind.
   */
  const reconcile = () => {
    const wanted = focus();
    paint();

    if (!wanted?.inNote) {
      if (field) render();
      return;
    }

    if (field?.index === wanted.index) return;

    if (field) render();
    open(wanted.index, wanted.caret);
  };

  editor.on('transaction', reconcile);
  wrapper.addEventListener('mousedown', onMouseDown);
  render();

  return {
    dom: wrapper,

    update: (updated: typeof node) => {
      if (updated.type.name !== BLOCK_MATH) return false;

      const changed = updated.attrs.latex !== current.attrs.latex;
      current = updated;
      wrapper.setAttribute('data-latex', updated.attrs.latex);

      // The writer's own keystroke, already on screen inside the input. Drawing
      // it again would destroy the element it was typed into.
      if (field && updated.attrs.latex === written) return true;
      if (changed) render();

      return true;
    },

    // While a box is open the input owns the keyboard and the mouse; PM handling
    // either would move the selection out from under it.
    stopEvent: (event: Event) =>
      field !== null && event.target instanceof Node && wrapper.contains(event.target),

    // An atom has no content for ProseMirror to read back, and everything in
    // here is drawn by KaTeX or by this file.
    ignoreMutation: () => true,

    destroy: () => {
      editor.off('transaction', reconcile);
      wrapper.removeEventListener('mousedown', onMouseDown);
    },
  };
};

/**
 * Formulas, as a study note needs them.
 *
 * The two nodes come from `@tiptap/extension-mathematics` (KaTeX) rather than
 * being hand-rolled, for the same reason as the tables: rendering LaTeX has a
 * hard, boring core — spacing rules, font metrics, six kinds of delimiter growth
 * — and none of it is what this app is for. Composed here rather than through
 * the package's own `Mathematics` wrapper only because the block node needs the
 * node view above; the wrapper does nothing else.
 *
 * Inline math keeps the stock rendering. A formula inside a sentence is a
 * fragment someone typed, not a form to fill in, and its boxes would be a few
 * millimetres across.
 */
export const NoteMath = Extension.create({
  name: 'noteMath',

  addExtensions: () => [
    BlockMath.extend({ addNodeView: () => blockMathView }).configure({
      katexOptions: KATEX_OPTIONS,
    }),
    InlineMath.configure({ katexOptions: KATEX_OPTIONS }),
    MathSlotFocus,
  ],
});
