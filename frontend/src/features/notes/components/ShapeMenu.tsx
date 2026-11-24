import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '../../../components/ui';
import { cn } from '../../../components/ui/cn';
import { SHAPE_TOOLS, shapeEntry, wrapIndex } from '../drawingTools';
import type { ShapeType } from '../shapes';

const ICON_PATHS: Record<ShapeType, ReactNode> = {
  rect: <rect x="2.5" y="4" width="11" height="8" rx="1" />,
  ellipse: <ellipse cx="8" cy="8" rx="5.5" ry="4" />,
  line: <path d="M3 13L13 3" />,
  arrow: <path d="M3 13L13 3M7 3h6v6" />,
};

export const ShapeIcon = ({ shape }: { shape: ShapeType }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {ICON_PATHS[shape]}
  </svg>
);

interface ShapeMenuProps {
  /** The shape the button shows: the last one chosen, whether or not it is active. */
  shape: ShapeType;
  /** A shape tool is the active tool. */
  active: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (shape: ShapeType) => void;
}

/**
 * One toolbar button that opens a list of shapes.
 *
 * The popover is `absolute bottom-full` inside the toolbar: the toolbar is fixed
 * at the bottom of the viewport, so it has to open upward, and nothing between
 * the button and the toolbar clips overflow, so no portal is needed.
 *
 * Escape is deliberately NOT handled here. DrawingLayer owns it, in the capture
 * phase, because it also has to stop the same key from leaving pen mode.
 */
export const ShapeMenu = ({ shape, active, open, onOpenChange, onSelect }: ShapeMenuProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** Mouse opens leave focus on the button; keyboard opens move it into the list. */
  const keyboardOpenRef = useRef(false);
  const wasOpenRef = useRef(false);
  const [focused, setFocused] = useState(0);

  const currentIndex = Math.max(
    0,
    SHAPE_TOOLS.findIndex((entry) => entry.tool === shape),
  );
  const current = shapeEntry(shape);

  const trigger = () => containerRef.current?.querySelector<HTMLButtonElement>('[data-shape-trigger]');

  const openWith = (keyboard: boolean) => {
    keyboardOpenRef.current = keyboard;
    setFocused(currentIndex);
    onOpenChange(true);
  };

  // Moves focus onto the current item after a keyboard open, and gives it back
  // to the button when the menu closes with focus inside it (Esc, selection).
  useEffect(() => {
    if (open && keyboardOpenRef.current) {
      itemRefs.current[currentIndex]?.focus();
    }
    if (!open && wasOpenRef.current) {
      const active = document.activeElement;
      if (!active || active === document.body || containerRef.current?.contains(active)) {
        trigger()?.focus();
      }
    }
    wasOpenRef.current = open;
    // Only the open transition matters, not later shape changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) itemRefs.current[focused]?.focus();
  }, [focused, open]);

  // Click outside closes. pointerdown, not click, so it also fires when the press
  // starts a drag elsewhere.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, onOpenChange]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openWith(true);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = SHAPE_TOOLS.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocused((index) => wrapIndex(index, 1, SHAPE_TOOLS.length));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocused((index) => wrapIndex(index, -1, SHAPE_TOOLS.length));
        break;
      case 'Home':
        event.preventDefault();
        setFocused(0);
        break;
      case 'End':
        event.preventDefault();
        setFocused(last);
        break;
      case 'Tab':
        // Focus goes back to the button first, so the Tab that is already in
        // flight moves on from the toolbar instead of from a removed item.
        keyboardOpenRef.current = false;
        trigger()?.focus();
        onOpenChange(false);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative inline-flex">
      <Button
        size="sm"
        variant={active ? 'secondary' : 'quiet'}
        data-shape-trigger
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={active}
        aria-keyshortcuts={current.key.toUpperCase()}
        title={`${current.label} (${current.key.toUpperCase()})`}
        onKeyDown={onTriggerKeyDown}
        onClick={(event) => {
          if (open) onOpenChange(false);
          // detail === 0 is a click synthesised by Enter or Space.
          else openWith(event.detail === 0);
        }}
      >
        <ShapeIcon shape={shape} />
        {current.label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M2 4l3 3 3-3" />
        </svg>
      </Button>

      {open && (
        <div
          role="menu"
          aria-label="Shapes"
          onKeyDown={onMenuKeyDown}
          className="absolute bottom-full left-0 z-40 mb-2 min-w-48 rounded-xs border border-rule bg-page py-1 shadow-sm"
        >
          {SHAPE_TOOLS.map((entry, index) => (
            <button
              key={entry.tool}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={entry.tool === shape}
              tabIndex={index === focused ? 0 : -1}
              onMouseEnter={() => setFocused(index)}
              onClick={() => {
                onSelect(entry.tool);
                onOpenChange(false);
              }}
              className={cn(
                'flex w-full items-center gap-3 border-l-2 px-3 py-1.5 text-left font-heading text-sm transition-colors',
                entry.tool === shape
                  ? 'border-primary bg-tint text-ink'
                  : 'border-transparent text-muted hover:text-ink focus-visible:text-ink',
              )}
            >
              <ShapeIcon shape={entry.tool} />
              <span className="flex-1">{entry.label}</span>
              <kbd className="text-xs text-muted">{entry.key.toUpperCase()}</kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
