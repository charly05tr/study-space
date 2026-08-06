import type { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { ReactNode } from 'react';
import { cn } from '../../../components/ui/cn';
import { selectedMath } from '../mathNodes';

interface MarkButtonProps {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}

const MarkButton = ({ label, active, disabled, onClick, children }: MarkButtonProps) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={active}
    disabled={disabled}
    // mousedown, not click: click fires after the text selection is already
    // gone, and the mark would apply to nothing.
    onMouseDown={(event) => {
      event.preventDefault();
      onClick();
    }}
    className={cn(
      'flex h-8 min-w-8 items-center justify-center border-b-2 px-2 font-heading text-sm',
      'transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40',
      active
        ? 'border-primary text-ink'
        : 'border-transparent text-muted hover:border-rule hover:text-ink',
    )}
  >
    {children}
  </button>
);

interface FormatBubbleMenuProps {
  editor: Editor;
}

/**
 * Inline formatting, shown only over a selection.
 *
 * Block structure lives in the `/` menu instead — the two are separated the way
 * Notion separates them, because they answer different questions: "what is this
 * block" is decided while typing, "how does this phrase read" only makes sense
 * once there is a phrase selected.
 */
export const FormatBubbleMenu = ({ editor }: FormatBubbleMenuProps) => {
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      bold: instance.isActive('bold'),
      italic: instance.isActive('italic'),
      strike: instance.isActive('strike'),
      code: instance.isActive('code'),
      canBold: instance.can().chain().toggleBold().run(),
      canItalic: instance.can().chain().toggleItalic().run(),
      canStrike: instance.can().chain().toggleStrike().run(),
      canCode: instance.can().chain().toggleCode().run(),
    }),
  });

  return (
    <BubbleMenu
      editor={editor}
      // Explicit key, because TableMenu is a second BubbleMenu and they would
      // otherwise both claim ProseMirror's default `bubbleMenu` plugin key —
      // which is a mount-time crash, not a layout bug.
      pluginKey="formatMenu"
      shouldShow={({ editor: instance, from, to }) => {
        // An empty selection is a caret, not a phrase — showing the menu there
        // would cover the line being written.
        if (from === to) return false;
        // Whole cells selected is a structural selection, not a phrase.
        // TableMenu owns that one, at the same coordinates.
        if (instance.state.selection instanceof CellSelection) return false;
        // A selected formula is an atom, so `from !== to` here without there
        // being any text to mark. MathMenu owns it, and would otherwise open
        // underneath a row of buttons that can do nothing to a LaTeX string.
        if (selectedMath(instance.state)) return false;
        // Inside a code block the marks are inert, so the menu would be a row
        // of buttons that silently do nothing.
        return !instance.isActive('codeBlock');
      }}
      className="flex items-center gap-0.5 rounded-xs border border-rule bg-page px-1 shadow-sm"
    >
      <MarkButton
        label="Bold"
        active={state.bold}
        disabled={!state.canBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        {/* Each glyph demonstrates the effect it applies. */}
        <span className="font-bold">B</span>
      </MarkButton>

      <MarkButton
        label="Italic"
        active={state.italic}
        disabled={!state.canItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <span className="italic">I</span>
      </MarkButton>

      <MarkButton
        label="Strikethrough"
        active={state.strike}
        disabled={!state.canStrike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span className="line-through">S</span>
      </MarkButton>

      <MarkButton
        label="Inline code"
        active={state.code}
        disabled={!state.canCode}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <span className="font-mono text-xs">{'</>'}</span>
      </MarkButton>
    </BubbleMenu>
  );
};
