import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { cn } from './cn';

/**
 * The three vertical dots. Inline rather than an icon package: it is the second
 * drawing in the whole app, after the pomodoro dial.
 *
 * `fill-current` so it takes the button's own colour and follows it through the
 * quiet variant's muted-to-ink hover.
 */
const KebabIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="fill-current">
    <circle cx="8" cy="3" r="1.5" />
    <circle cx="8" cy="8" r="1.5" />
    <circle cx="8" cy="13" r="1.5" />
  </svg>
);

interface ActionMenuProps {
  /**
   * Names the button and the panel. The dots carry no text of their own, and a
   * list of rows means a list of these — so say which row: "Actions for X".
   */
  label: string;
  /** Tailwind width class for the panel. */
  width?: string;
  /** Panel contents, given a way to close the panel from inside. */
  children: (close: () => void) => ReactNode;
}

/**
 * A kebab button and the panel it opens.
 *
 * `role="dialog"` and not `role="menu"`: these panels hold selects and forms,
 * and a `<select>` is not a valid `menuitem`. role=menu would also promise
 * arrow-key navigation that nothing here implements.
 *
 * Extracted on the fourth copy of this popover in the codebase. `NodeMenu` and
 * `ReaderColors` still roll their own — the first is positioned off a cursor and
 * the second is not a kebab, so neither is the same component wearing a hat.
 */
export const ActionMenu = ({ label, width = 'w-56', children }: ActionMenuProps) => {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <Button
        variant="quiet"
        size="sm"
        // Square, not the text-width padding the other buttons get.
        className="px-2"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <KebabIcon />
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label={label}
          /* Right-aligned: the button sits at the end of a row, and a panel
             opening leftwards is the only one that fits on a narrow screen. */
          className={cn(
            'absolute right-0 z-40 mt-1 rounded-xs border border-rule bg-page p-3 shadow-lg',
            width,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};
