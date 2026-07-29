import { useEffect, useRef } from 'react';
import type { PositionedNode } from '../types';

export interface NodeMenuTarget {
  node: PositionedNode;
  /** Viewport coordinates of the click that opened it. */
  x: number;
  y: number;
}

interface NodeMenuProps {
  target: NodeMenuTarget;
  removing: boolean;
  onRemove: () => void;
  onClose: () => void;
}

/**
 * Right-click actions for a single node.
 *
 * A plain absolutely positioned panel rather than a portal: the HUD already
 * covers the canvas, and the menu belongs to the same layer.
 */
export const NodeMenu = ({ target, removing, onRemove, onClose }: NodeMenuProps) => {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (!panel.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    // pointerdown, not click: the menu has to be gone before the canvas starts
    // interpreting the same press as an orbit drag.
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={panel}
      role="menu"
      aria-label="Block actions"
      // Nudged off the cursor so the first item is not already under it, and
      // clamped so a right-click near the edge does not open off screen.
      style={{
        left: Math.min(target.x + 4, window.innerWidth - 240),
        top: Math.min(target.y + 4, window.innerHeight - 140),
      }}
      className="pointer-events-auto fixed z-50 w-56 rounded-xs border border-rule bg-page shadow-lg"
    >
      <p className="truncate border-b border-rule px-3 py-2 text-sm text-ink italic">
        {target.node.text || '(empty block)'}
      </p>

      <button
        type="button"
        role="menuitem"
        disabled={removing}
        onClick={onRemove}
        className="flex w-full flex-col gap-0.5 border-l-2 border-transparent px-3 py-2 text-left transition-colors hover:border-danger hover:bg-danger-soft disabled:opacity-45"
      >
        <span className="font-heading text-[0.65rem] uppercase tracking-[0.14em] text-danger">
          Remove from the map
        </span>
        {/*
          Says what it actually does. A block is a projection of its note, so
          "delete" would either be a lie — the next save recreates it — or would
          mean silently editing the note from a view that is not the editor.
        */}
        <span className="text-xs text-muted">The block stays in its note</span>
      </button>
    </div>
  );
};
