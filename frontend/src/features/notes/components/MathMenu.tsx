import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import katex from 'katex';
import { useCallback, useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { cn } from '../../../components/ui/cn';
import {
  BLOCK_MATH,
  MATH_GROUPS,
  deleteMath,
  exitMath,
  findSlot,
  insertSnippet,
  selectedMath,
  tokenIndexAt,
  snippetPreview,
  type MathSnippet,
  type TextRange,
} from '../mathNodes';
import { setSlotFocus, slotFocus } from '../mathSlots';

/**
 * Rendered previews, built once per snippet and kept.
 *
 * A button reading `\frac` teaches nothing to the person who needed the button;
 * a button showing a fraction is read without being explained. The catalogue is
 * a module constant, so every one of these is computed at most once for the
 * lifetime of the tab.
 */
const previews = new Map<string, string>();

const previewHtml = (snippet: MathSnippet): string => {
  const cached = previews.get(snippet.key);
  if (cached !== undefined) return cached;

  const html = katex.renderToString(snippetPreview(snippet), {
    throwOnError: false,
    // The buttons are one line tall. Display style would set integrals and sums
    // at full height with their limits stacked, and the row would triple.
    displayMode: false,
  });

  previews.set(snippet.key, html);
  return html;
};

interface SnippetButtonProps {
  snippet: MathSnippet;
  onInsert: (snippet: MathSnippet) => void;
}

const SnippetButton = ({ snippet, onInsert }: SnippetButtonProps) => (
  <button
    type="button"
    aria-label={snippet.label}
    // The drawing says what the shape is; the tooltip says what it is called.
    // Someone hunting for "piecewise" cannot recognise it from the braces alone.
    title={snippet.label}
    // mousedown with the default prevented, so the click never reaches focus:
    // the source input has to keep both the caret and the selection, because
    // WHERE the snippet lands is decided by them.
    onMouseDown={(event) => {
      event.preventDefault();
      onInsert(snippet);
    }}
    className={cn(
      // A FLOOR and not a fixed height. An integral with both limits, or a
      // fraction, draws taller than a row of relations does — pinned to 2.75rem
      // those previews overflow their cell and collide with the heading of the
      // next group, which is what made the palette look like it was printed
      // twice. Auto rows let each group be as tall as its tallest symbol.
      'flex min-h-11 items-center justify-center rounded-xs px-1 py-1 text-ink',
      // A hairline that only appears under the pointer: fifty framed cells read
      // as a spreadsheet, and the symbols are what the eye is meant to scan.
      'border border-transparent transition-colors duration-150',
      'hover:border-primary-200 hover:bg-primary-50',
    )}
  >
    {/*
      KaTeX markup, injected. The input is never user text: it is
      `snippetPreview` over a constant catalogue, rendered with KaTeX's `trust`
      option left at its default false — which is what disables \href, \url and
      \includegraphics, the only commands that can emit a URL or a tag.
    */}
    <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: previewHtml(snippet) }} />
  </button>
);

interface MathMenuProps {
  editor: Editor;
}

/**
 * The formula editor: LaTeX source, a palette, and the note itself as preview.
 *
 * Why the source is visible and editable, rather than a grid of buttons that
 * builds it invisibly: a formula is a TREE, and the palette can only ever offer
 * the shapes someone thought to add. LaTeX is the escape hatch that keeps the
 * ceiling off — the student who knows it types straight through, the one who
 * does not clicks, and both are editing the same string. A button-only editor
 * would have to answer "how do I write ℵ₀" with "you cannot".
 *
 * Why it is anchored to the node rather than sitting in a fixed bar: the same
 * reason as TableMenu. Every action here is relative to the caret INSIDE the
 * formula, and a control that acts on the cursor has to be able to see it.
 */
export const MathMenu = ({ editor }: MathMenuProps) => {
  /**
   * Primitives only. `useEditorState` compares the selector's result shallowly,
   * and a ProseMirror node is a new object on every transaction — returning one
   * would re-render this tree on every keystroke anywhere in the note.
   */
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => {
      const math = selectedMath(instance.state);
      const focus = slotFocus(instance.state);

      return {
        type: math?.type ?? null,
        pos: math?.pos ?? -1,
        latex: math?.latex ?? '',
        // Where the note says it is being typed into, so this panel can keep out
        // of the way and still aim the palette at the right place.
        inNote: focus?.inNote ?? false,
        start: focus?.start ?? -1,
        end: focus?.end ?? -1,
      };
    },
  });

  const inputRef = useRef<HTMLTextAreaElement>(null);

  /**
   * A selection waiting for the value that justifies it.
   *
   * The input is controlled by the document, so a snippet click cannot set the
   * caret itself: at that moment the textarea still holds the OLD string, and
   * an offset into the new one would land somewhere arbitrary. The range is
   * parked here and applied by the effect below, which runs after React has
   * rendered the updated value.
   */
  const pending = useRef<TextRange | null>(null);

  /**
   * Moves the caret here, and tells the note where it went.
   *
   * The second half is what keeps the two surfaces from being two editors: the
   * hole this lands on is the one the note draws lit, and the one the palette
   * inserts into. Reading the position out of `editor.state` rather than closing
   * over it is what keeps this callback stable — it is a dependency of the focus
   * handoff below, which the menu plugin re-applies through a transaction every
   * time its identity changes.
   */
  const select = useCallback(
    (input: HTMLTextAreaElement, range: TextRange) => {
      input.setSelectionRange(range.start, range.end);

      const math = selectedMath(editor.state);
      if (!math) return;

      setSlotFocus(editor, {
        pos: math.pos,
        index: tokenIndexAt(math.latex, range.start),
        start: range.start,
        end: range.end,
        // Preserved, never asserted: a snippet dropped into a box the writer is
        // typing in must not yank the keyboard back out of the note.
        inNote: slotFocus(editor.state)?.inNote ?? false,
      });
    },
    [editor],
  );

  useEffect(() => {
    const range = pending.current;
    if (!range || !inputRef.current) return;

    pending.current = null;
    // Focus only when the keyboard was already here. While a box in the note has
    // it, this input is a display of the same string and must stay one.
    if (!state.inNote) inputRef.current.focus();
    select(inputRef.current, range);
  });

  /**
   * The note is being typed into: keep this input's selection on the same text.
   *
   * The palette works by replacing whatever is selected here, so without this
   * the first snippet clicked after filling in a box would land at whatever
   * offset the caret was last left at.
   */
  useEffect(() => {
    const input = inputRef.current;
    if (!input || !state.inNote || state.start < 0) return;

    input.setSelectionRange(state.start, state.end);
  }, [state.inNote, state.start, state.end]);

  /**
   * Hands the keyboard to the source, with everything selected.
   *
   * Both nodes are atoms, so a selected formula is a SELECTED NODE — and the
   * next character typed over one replaces it. Arrowing onto an equation and
   * continuing to type would silently delete it; keeping the keystrokes in this
   * input instead makes that impossible.
   *
   * Selecting the whole string is what makes both intentions cheap: a formula
   * you meant to rewrite is gone on the first keystroke, and one you meant to
   * extend is one End key away.
   */
  const frame = useRef<number | null>(null);

  const takeKeyboard = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);

    /**
     * On the next frame, and this is the one line that makes the panel usable.
     *
     * Tiptap's own `focus()` command does not focus the editor when it runs: it
     * schedules `view.focus()` in a requestAnimationFrame. Any command chain
     * that begins `.chain().focus()` — which is every insertion path there is,
     * including the `/` menu's — therefore has a focus grab in flight AFTER it
     * has finished. Claiming the keyboard synchronously wins for one frame and
     * then silently loses it, leaving the caret back on a selected atom, which
     * is exactly the state this panel exists to prevent.
     *
     * Frame callbacks run in the order they were queued, so going one frame
     * later is enough to come last.
     */
    frame.current = requestAnimationFrame(() => {
      frame.current = null;

      const input = inputRef.current;
      // `isConnected`, not just null: the menu plugin attaches its element on a
      // tick of its own, and focus() on a node outside the document does
      // nothing at all — silently.
      if (!input?.isConnected) return;

      // Unless the panel was opened BY a click on a box in the note, in which
      // case the keyboard belongs there and this would take it away one frame
      // after the writer put it where they wanted it.
      if (slotFocus(editor.state)?.inNote) return;

      input.focus();
      select(input, { start: 0, end: input.value.length });
    });
  }, [editor, select]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  /**
   * The panel is already open and the user moved to another formula.
   *
   * Guarded on the position rather than run on every render, because the value
   * changes on every keystroke and re-focusing there would fight the caret the
   * user is moving. The first open is not this path — see `onShow` below, which
   * fires at the one moment the element exists to be focused.
   */
  const focused = useRef(-1);
  useEffect(() => {
    if (state.pos === -1) {
      focused.current = -1;
      return;
    }

    if (focused.current === state.pos) return;
    focused.current = state.pos;
    takeKeyboard();
  }, [state.pos, takeKeyboard]);

  /**
   * Positioning options, memoized because they are not really props: the menu
   * plugin reads them once at mount and re-applies them through a transaction
   * whenever their identity changes. A fresh object per render would mean a
   * transaction per render.
   */
  const options = useMemo(
    () => ({
      // Below, unlike the other two menus. This is a panel rather than a strip
      // of buttons, and above the formula it would cover the lines that explain
      // what the formula is for — which is what you check while writing it.
      placement: 'bottom-start' as const,
      // The one hook that fires AFTER the element is in the document. Focusing
      // from a React effect is too early: the panel is still detached then.
      onShow: takeKeyboard,
    }),
    [takeKeyboard],
  );

  const commit = (latex: string) => {
    if (state.pos === -1) return;

    if (state.type === BLOCK_MATH) editor.commands.updateBlockMath({ latex, pos: state.pos });
    else editor.commands.updateInlineMath({ latex, pos: state.pos });
  };

  /** Back to the prose. An empty formula is removed rather than left invisible. */
  const leave = (direction: 1 | -1) => {
    const chain = editor.chain().focus();
    if (state.latex.trim()) exitMath(chain, direction).run();
    else deleteMath(chain).run();
  };

  const insert = (snippet: MathSnippet) => {
    const input = inputRef.current;
    if (!input) return;

    const next = insertSnippet(
      state.latex,
      { start: input.selectionStart, end: input.selectionEnd },
      snippet.latex,
    );

    pending.current = next.select;
    commit(next.latex);
  };

  /**
   * The caret moved in here, so the note's box is no longer the one being typed
   * in — and the hole under this caret is the one it should draw lit.
   *
   * Guarded on the input actually having focus, because `setSelectionRange`
   * fires this event too: the effect above sets the selection from the note on
   * every keystroke made there, and reacting to that would hand the keyboard
   * back to a panel nobody is typing in.
   */
  const trackCaret = (input: HTMLTextAreaElement) => {
    if (document.activeElement !== input || state.pos === -1) return;

    const index = tokenIndexAt(state.latex, input.selectionStart);
    const focus = slotFocus(editor.state);
    if (focus && !focus.inNote && focus.index === index && focus.start === input.selectionStart) {
      return;
    }

    setSlotFocus(editor, {
      pos: state.pos,
      index,
      start: input.selectionStart,
      end: input.selectionEnd,
      inNote: false,
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const input = event.currentTarget;

    if (event.key === 'Tab') {
      // Only when there is somewhere to go. A formula with no holes left has to
      // let Tab move focus onward, or the panel becomes a keyboard trap.
      const slot = findSlot(state.latex, input.selectionEnd);
      if (!slot) return;

      // Set straight on the element rather than through `pending`: nothing here
      // changes the document, so there is no render coming to apply it in.
      event.preventDefault();
      select(input, slot);
      return;
    }

    if (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey)) {
      // Shift+Enter still breaks the line: `cases` and `pmatrix` are written
      // across several, and a confirm that ate the newline would make them
      // unwritable here.
      event.preventDefault();
      leave(1);
      return;
    }

    /**
     * Only from a collapsed caret sitting on the very edge.
     *
     * With a range selected, an arrow key means "collapse this", which is what
     * the textarea already does — hijacking it would make the formula
     * impossible to leave a selection out of. `\square` arrives selected on
     * every insertion, so this is the common case, not the rare one.
     */
    const collapsed = input.selectionStart === input.selectionEnd;
    const atStart = collapsed && input.selectionStart === 0;
    const atEnd = collapsed && input.selectionEnd === input.value.length;

    if ((event.key === 'ArrowLeft' || event.key === 'ArrowUp') && atStart) {
      event.preventDefault();
      leave(-1);
      return;
    }

    if ((event.key === 'ArrowRight' || event.key === 'ArrowDown') && atEnd) {
      event.preventDefault();
      leave(1);
    }
  };

  return (
    <BubbleMenu
      editor={editor}
      // Third menu, third plugin key — two BubbleMenus may not share one, and
      // the collision is a mount-time crash rather than a layout bug.
      pluginKey="mathMenu"
      shouldShow={({ editor: instance }) =>
        instance.isEditable && selectedMath(instance.state) !== null
      }
      options={options}
      /**
       * No debounce. The default quarter second is tuned for a toolbar chasing
       * a dragged text selection; this panel is the editor for the node that
       * was just clicked, and it also has to be in the document before the
       * caret can be put in it.
       */
      updateDelay={0}
      /*
        Wide enough for the palette to draw at a size worth clicking, and capped
        against the viewport rather than at a fixed width: this panel is anchored
        to a node that can sit anywhere on the line, so on a narrow screen a
        rigid 34rem would hang off the edge with its buttons on the outside.
      */
      /*
        `z-20` because the note's save indicator is a `sticky top-0 z-10` strip
        (BlockEditor.tsx), and this panel is a positioned element with no z-index
        of its own — so the SAVED badge won the paint order and sat ON TOP of the
        palette. Anything that floats over the prose has to clear that strip.
      */
      className={cn(
        'z-20 w-[min(34rem,calc(100vw-2rem))] rounded-xs border border-rule bg-page p-3 shadow-sm',
      )}
    >
      <label className="sr-only" htmlFor="math-source">
        LaTeX source
      </label>
      <textarea
        id="math-source"
        ref={inputRef}
        rows={3}
        spellCheck={false}
        value={state.latex}
        onChange={(event) => commit(event.target.value)}
        // Both, because they answer different questions: `focus` says the
        // keyboard has come back from the note, `select` says where it went.
        onFocus={(event) => trackCaret(event.currentTarget)}
        onSelect={(event) => trackCaret(event.currentTarget)}
        onKeyDown={onKeyDown}
        placeholder="\frac{a}{b}"
        className={cn(
          'w-full resize-none rounded-xs border border-rule bg-primary-50/40 px-2.5 py-2',
          'font-mono text-sm leading-relaxed text-ink placeholder:text-muted/70',
          'focus:border-primary focus:outline-none',
        )}
      />

      {/*
        The palette gives way, and it is the only part that can: the preview and
        the source line are what the panel IS, so on a short viewport the height
        has to come out of the scroller instead of pushing the whole thing off
        the screen — which is what a fixed max-height does on a laptop with the
        formula halfway down the note.
      */}
      <div className="mt-2 max-h-[min(16rem,32vh)] overflow-y-auto pr-1">
        {MATH_GROUPS.map((group) => (
          <section key={group.title} className="mb-2 last:mb-0">
            <h3 className="px-0.5 font-heading text-xs tracking-wide text-muted uppercase">
              {group.title}
            </h3>
            {/*
              Six across, at a fixed count rather than auto-fill. The previews
              are wildly different widths — a lone π against a definite integral
              — and a flowing grid would reshuffle every group into a different
              rhythm, so nothing would ever be in the place you last saw it.
            */}
            {/* `items-stretch` on auto rows: every cell in a row is as tall as
                the tallest preview in it, so the hover target is a rectangle
                rather than a shape that changes with the symbol. */}
            <div className="grid grid-cols-6 items-stretch gap-1">
              {group.snippets.map((snippet) => (
                <SnippetButton key={snippet.key} snippet={snippet} onInsert={insert} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-rule pt-2">
        {/* The three moves that are not guessable, and nothing else: a legend
            long enough to read is a legend nobody reads. The first one names
            the interaction the drawing above cannot advertise on its own. */}
        <p className="font-heading text-xs text-muted">
          Click a box · Tab or arrows to move · Esc: done
        </p>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            deleteMath(editor.chain().focus()).run();
          }}
          className="font-heading text-xs text-danger hover:underline"
        >
          Remove
        </button>
      </div>
    </BubbleMenu>
  );
};
