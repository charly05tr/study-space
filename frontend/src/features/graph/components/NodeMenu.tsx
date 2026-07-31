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
  /** Only offered for concepts raised by hand; a heading has nowhere to fall back to. */
  onDemote: () => void;
  demoting: boolean;
  onClose: () => void;
}

/**
 * Right-click actions for a single node.
 *
 * A plain absolutely positioned panel rather than a portal: the HUD already
 * covers the canvas, and the menu belongs to the same layer.
 */
export const NodeMenu = ({
  target,
  removing,
  onRemove,
  onDemote,
  demoting,
  onClose,
}: NodeMenuProps) => {
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
      className="pointer-events-auto fixed z-50 w-64 rounded-xs border border-rule bg-page shadow-lg"
    >
      <div className="border-b border-rule px-3 py-2">
        <p className="truncate text-sm text-ink italic">
          {target.node.text || '(untitled idea)'}
        </p>
        {/*
          The size of the idea, not of the paragraph. A concept holding nine
          blocks and one holding a single line read very differently on a map
          where every node is drawn the same, and the count is the only thing
          that tells them apart before you travel to it.
        */}
        <p className="mt-0.5 font-heading text-[0.6rem] uppercase tracking-[0.14em] text-muted">
          {target.node.block_count === 1
            ? '1 block'
            : `${target.node.block_count} blocks`}
        </p>
      </div>

      {target.node.promoted && (
        <button
          type="button"
          role="menuitem"
          disabled={demoting}
          onClick={onDemote}
          className="flex w-full flex-col gap-0.5 border-l-2 border-transparent px-3 py-2 text-left transition-colors hover:border-primary hover:bg-tint disabled:opacity-45"
        >
          <span className="font-heading text-[0.65rem] uppercase tracking-[0.14em] text-ink">
            Fold back into its section
          </span>
          {/*
            Undoes a promotion rather than hiding anything: the block returns to
            the concept of the heading above it, where it was before. Offered
            only for hand-raised nodes — a heading has no section to fall into.
          */}
          <span className="text-xs text-muted">Stops being an idea of its own</span>
        </button>
      )}

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
        <span className="text-xs text-muted">The blocks stay in their note</span>
      </button>
    </div>
  );
};
