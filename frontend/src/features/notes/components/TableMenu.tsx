import type { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { ReactNode } from 'react';
import { cn } from '../../../components/ui/cn';
import { canDeleteColumn, canDeleteRow } from '../tableNodes';

/**
 * Which third of the 3x3 grid an action touches.
 *
 * The icon is drawn once and parameterized rather than traced six times: the
 * six commands differ only in WHICH band they act on and whether they add or
 * remove, so that is exactly what the drawing takes as arguments.
 */
type Band = 'top' | 'row' | 'bottom' | 'left' | 'column' | 'right';

/** The table is 14 units wide over three even tracks of 4.67. */
const BANDS: Record<Band, { x: number; y: number; width: number; height: number }> = {
  top: { x: 0.5, y: 0.5, width: 14, height: 4.67 },
  row: { x: 0.5, y: 5.17, width: 14, height: 4.67 },
  bottom: { x: 0.5, y: 9.83, width: 14, height: 4.67 },
  left: { x: 0.5, y: 0.5, width: 4.67, height: 14 },
  column: { x: 5.17, y: 0.5, width: 4.67, height: 14 },
  right: { x: 9.83, y: 0.5, width: 4.67, height: 14 },
};

interface GridIconProps {
  band: Band;
  /** The badge in the corner: what the action does to the shaded band. */
  sign: 'plus' | 'minus';
}

/**
 * A grid with one band shaded and a signed badge.
 *
 * The shading says WHERE — above, below, left, right, or the row you are in —
 * and the badge says WHAT. Together they carry the whole meaning of a button
 * that has no room for a label, which is why every one of these still ships an
 * `aria-label` beside it: the drawing is a shorthand, not a substitute.
 */
const GridIcon = ({ band, sign }: GridIconProps) => (
  <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
    {/*
      Solid, not a tint. A shaded band is the only thing telling these six
      buttons apart, and at 18px a translucent fill over a hairline grid is
      indistinguishable from the grid — the icon reads as "a table" six times
      and answers nothing. Filled against hollow is legible at any size.
    */}
    <rect {...BANDS[band]} fill="currentColor" />

    <g stroke="currentColor" strokeWidth="1" fill="none">
      <rect x="0.5" y="0.5" width="14" height="14" />
      <path d="M0.5 5.17h14M0.5 9.83h14M5.17 0.5v14M9.83 0.5v14" opacity="0.55" />
    </g>

    {/*
      The badge, as a chip punched out of the drawing.

      Page-coloured disc with no outline of its own: an outlined circle costs
      two more strokes inside a 7px space, and at this size every extra stroke
      is what turns a glyph into a smudge. The disc alone separates the sign
      from whatever it lands on — including a solid band.
    */}
    <circle cx="15.5" cy="15.5" r="4.5" fill="var(--color-page)" />
    <path
      d={sign === 'plus' ? 'M13.2 15.5h4.6M15.5 13.2v4.6' : 'M13.2 15.5h4.6'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

interface TableButtonProps {
  label: string;
  disabled: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}

const TableButton = ({ label, disabled, danger = false, onClick, children }: TableButtonProps) => (
  <button
    type="button"
    aria-label={label}
    // The icons carry no text, so hovering has to be able to answer "which one
    // adds below?" without a trip to the docs.
    title={label}
    disabled={disabled}
    // mousedown, not click: click lands after the editor has already lost the
    // cell selection, and every command here is relative to it.
    onMouseDown={(event) => {
      event.preventDefault();
      onClick();
    }}
    className={cn(
      'flex h-8 min-w-8 items-center justify-center border-b-2 border-transparent px-1.5',
      'font-heading text-sm transition-colors duration-150',
      'disabled:pointer-events-none disabled:opacity-40',
      danger
        ? 'text-danger hover:border-danger'
        : 'text-muted hover:border-rule hover:text-ink',
    )}
  >
    {children}
  </button>
);

/** A hairline between the row group, the column group and the table group. */
const Separator = () => <span aria-hidden="true" className="mx-1 h-5 w-px bg-rule" />;

interface TableMenuProps {
  editor: Editor;
}

/**
 * Row and column controls, shown only from inside a table.
 *
 * Structure lives here rather than in the `/` menu because `/` answers "what is
 * this block" once, while a table's shape keeps changing for as long as it is
 * being filled in. The commands are all relative to the caret — "add a row
 * below" means below THIS row — so the toolbar has to be attached to the cursor
 * rather than sit in a static bar somewhere off to the side.
 *
 * Tab already appends a row from the last cell, so this is the deliberate path,
 * not the only one.
 */
export const TableMenu = ({ editor }: TableMenuProps) => {
  const state = useEditorState({
    editor,
    /**
     * `can()` per command, not one `isActive('table')` for all of them.
     *
     * The commands disagree: prosemirror-tables refuses to delete the last row
     * of a table, and refuses column operations while a selection spans an odd
     * shape. A button that stays lit and silently does nothing is worse than one
     * that greys out and says why by being grey.
     */
    selector: ({ editor: instance }) => ({
      canAddRowBefore: instance.can().chain().addRowBefore().run(),
      canAddRowAfter: instance.can().chain().addRowAfter().run(),
      // Not `can()`: see canDeleteRow in tableNodes.ts for why it lies here.
      canDeleteRow: canDeleteRow(instance.state),
      canAddColumnBefore: instance.can().chain().addColumnBefore().run(),
      canAddColumnAfter: instance.can().chain().addColumnAfter().run(),
      canDeleteColumn: canDeleteColumn(instance.state),
      canToggleHeaderRow: instance.can().chain().toggleHeaderRow().run(),
      canDeleteTable: instance.can().chain().deleteTable().run(),
    }),
  });

  const run = (command: (chain: ReturnType<Editor['chain']>) => unknown) =>
    command(editor.chain().focus());

  return (
    <BubbleMenu
      editor={editor}
      // Explicit key. Every BubbleMenu defaults to the same ProseMirror plugin
      // key, and two plugins may not share one — without this, mounting the
      // editor alongside FormatBubbleMenu throws.
      pluginKey="tableMenu"
      shouldShow={({ editor: instance, from, to }) => {
        if (!instance.isEditable || !instance.isActive('table')) return false;
        // A phrase selected inside a cell is a formatting question, and
        // FormatBubbleMenu is already answering it at the same coordinates.
        // Whole cells selected is a structural one, and belongs here.
        return from === to || instance.state.selection instanceof CellSelection;
      }}
      className="flex items-center gap-0.5 rounded-xs border border-rule bg-page px-1 shadow-sm"
    >
      <TableButton
        label="Add row above"
        disabled={!state.canAddRowBefore}
        onClick={() => run((chain) => chain.addRowBefore().run())}
      >
        <GridIcon band="top" sign="plus" />
      </TableButton>

      <TableButton
        label="Add row below"
        disabled={!state.canAddRowAfter}
        onClick={() => run((chain) => chain.addRowAfter().run())}
      >
        <GridIcon band="bottom" sign="plus" />
      </TableButton>

      <TableButton
        label="Delete row"
        disabled={!state.canDeleteRow}
        onClick={() => run((chain) => chain.deleteRow().run())}
      >
        <GridIcon band="row" sign="minus" />
      </TableButton>

      <Separator />

      <TableButton
        label="Add column left"
        disabled={!state.canAddColumnBefore}
        onClick={() => run((chain) => chain.addColumnBefore().run())}
      >
        <GridIcon band="left" sign="plus" />
      </TableButton>

      <TableButton
        label="Add column right"
        disabled={!state.canAddColumnAfter}
        onClick={() => run((chain) => chain.addColumnAfter().run())}
      >
        <GridIcon band="right" sign="plus" />
      </TableButton>

      <TableButton
        label="Delete column"
        disabled={!state.canDeleteColumn}
        onClick={() => run((chain) => chain.deleteColumn().run())}
      >
        <GridIcon band="column" sign="minus" />
      </TableButton>

      <Separator />

      <TableButton
        label="Toggle header row"
        disabled={!state.canToggleHeaderRow}
        onClick={() => run((chain) => chain.toggleHeaderRow().run())}
      >
        <span className="px-0.5">Header</span>
      </TableButton>

      <TableButton
        label="Delete table"
        danger
        disabled={!state.canDeleteTable}
        onClick={() => run((chain) => chain.deleteTable().run())}
      >
        <span className="px-0.5">Delete</span>
      </TableButton>
    </BubbleMenu>
  );
};
