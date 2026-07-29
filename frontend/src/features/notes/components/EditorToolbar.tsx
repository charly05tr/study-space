import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import type { ReactNode } from 'react';
import { cn } from '../../../components/ui/cn';

interface ToolbarButtonProps {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}

/**
 * A rule under the glyph rather than a filled box: the page is a sheet of
 * paper, and a solid button on it reads as a foreign control. The goldenrod
 * underline is the same accent the reader uses for the active state.
 */
const ToolbarButton = ({ label, active, disabled, onClick, children }: ToolbarButtonProps) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={active}
    disabled={disabled}
    onClick={onClick}
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

const Separator = () => <span aria-hidden className="mx-1 h-4 w-px bg-rule" />;

interface EditorToolbarProps {
  editor: Editor;
}

export const EditorToolbar = ({ editor }: EditorToolbarProps) => {
  /**
   * `useEditorState` instead of reading `editor.isActive(...)` during render.
   * The editor is created with `shouldRerenderOnTransaction: false`, so without
   * this selector the active states would never refresh; with a blanket
   * re-render they would refresh on every keystroke. This subscribes to the
   * derived booleans only.
   */
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      bold: instance.isActive('bold'),
      italic: instance.isActive('italic'),
      h1: instance.isActive('heading', { level: 1 }),
      h2: instance.isActive('heading', { level: 2 }),
      bulletList: instance.isActive('bulletList'),
      canBold: instance.can().chain().toggleBold().run(),
      canItalic: instance.can().chain().toggleItalic().run(),
    }),
  });

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex items-center gap-0.5"
    >
      <ToolbarButton
        label="Bold"
        active={state.bold}
        disabled={!state.canBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        {/* The glyph demonstrates the effect it applies. */}
        <span className="font-bold">B</span>
      </ToolbarButton>

      <ToolbarButton
        label="Italic"
        active={state.italic}
        disabled={!state.canItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <span className="italic">I</span>
      </ToolbarButton>

      <Separator />

      <ToolbarButton
        label="Heading 1"
        active={state.h1}
        disabled={false}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <span className="tracking-[0.1em]">H1</span>
      </ToolbarButton>

      <ToolbarButton
        label="Heading 2"
        active={state.h2}
        disabled={false}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <span className="tracking-[0.1em]">H2</span>
      </ToolbarButton>

      <Separator />

      <ToolbarButton
        label="Bullet list"
        active={state.bulletList}
        disabled={false}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <span className="uppercase tracking-[0.14em] text-xs">List</span>
      </ToolbarButton>
    </div>
  );
};
