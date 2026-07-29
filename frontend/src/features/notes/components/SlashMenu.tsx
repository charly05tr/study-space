import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '../../../components/ui/cn';
import type { SlashItem } from '../slashMenuItems';

export interface SlashMenuHandle {
  /** Returns true when the key was consumed and must not reach the editor. */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export interface SlashMenuProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);
    const listRef = useRef<HTMLUListElement>(null);

    // Every keystroke narrows the list, so the previous index can point past the
    // end — or at a block the user is no longer looking at.
    useEffect(() => setSelected(0), [items]);

    // Keyboard navigation must not require the mouse to have moved: keep the
    // highlighted row in view when arrowing past the visible window.
    useEffect(() => {
      listRef.current?.children[selected]?.scrollIntoView({ block: 'nearest' });
    }, [selected]);

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: (event) => {
          if (items.length === 0) return false;

          if (event.key === 'ArrowDown') {
            setSelected((current) => (current + 1) % items.length);
            return true;
          }

          if (event.key === 'ArrowUp') {
            // Wrap backwards without going negative.
            setSelected((current) => (current + items.length - 1) % items.length);
            return true;
          }

          if (event.key === 'Enter') {
            command(items[selected]);
            return true;
          }

          // Escape is deliberately not handled here: the suggestion plugin owns
          // dismissal, and consuming the key would leave its state stuck open.
          return false;
        },
      }),
      [items, selected, command],
    );

    if (items.length === 0) {
      return (
        <div className="w-64 rounded-xs border border-rule bg-page px-3 py-2 shadow-sm">
          <p className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
            No blocks match
          </p>
        </div>
      );
    }

    return (
      <ul
        ref={listRef}
        role="listbox"
        aria-label="Insert block"
        className="max-h-72 w-64 overflow-y-auto rounded-xs border border-rule bg-page py-1 shadow-sm"
      >
        {items.map((item, index) => (
          <li key={item.title}>
            <button
              type="button"
              role="option"
              aria-selected={index === selected}
              // Pointer and keyboard drive the same highlight, so hovering then
              // pressing Enter inserts what the user is looking at.
              onMouseEnter={() => setSelected(index)}
              // mousedown, not click: click fires after the editor has already
              // lost the selection the command needs.
              onMouseDown={(event) => {
                event.preventDefault();
                command(item);
              }}
              className={cn(
                'flex w-full items-baseline justify-between gap-3 border-l-2 px-3 py-1.5 text-left transition-colors',
                index === selected
                  ? 'border-primary bg-tint text-ink'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              <span className="font-heading text-sm">{item.title}</span>
              <span className="shrink-0 text-xs text-muted">{item.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  },
);

SlashMenu.displayName = 'SlashMenu';
