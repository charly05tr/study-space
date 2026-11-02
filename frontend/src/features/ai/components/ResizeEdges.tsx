import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ResizeEdge } from '../panelGeometry';

interface EdgeProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void;
}

interface ResizeEdgesProps {
  /** From `useDraggableResizable`. */
  edgeProps: (edge: ResizeEdge) => EdgeProps;
}

// Thin strips on the sides, squares on the corners (listed last so they win the overlap).
const EDGES: { edge: ResizeEdge; className: string }[] = [
  { edge: 'n', className: 'inset-x-2 top-0 h-1.5 cursor-ns-resize' },
  { edge: 's', className: 'inset-x-2 bottom-0 h-1.5 cursor-ns-resize' },
  { edge: 'w', className: 'inset-y-2 left-0 w-1.5 cursor-ew-resize' },
  { edge: 'e', className: 'inset-y-2 right-0 w-1.5 cursor-ew-resize' },
  { edge: 'nw', className: 'left-0 top-0 size-3 cursor-nwse-resize' },
  { edge: 'ne', className: 'right-0 top-0 size-3 cursor-nesw-resize' },
  { edge: 'sw', className: 'bottom-0 left-0 size-3 cursor-nesw-resize' },
  { edge: 'se', className: 'bottom-0 right-0 size-3 cursor-nwse-resize' },
];

/** The invisible grips around a floating window. Pointer only: the dock has the keyboard handle. */
export const ResizeEdges = ({ edgeProps }: ResizeEdgesProps) => (
  <>
    {EDGES.map(({ edge, className }) => (
      <div
        key={edge}
        aria-hidden
        data-resize-edge={edge}
        className={`absolute z-10 touch-none select-none ${className}`}
        {...edgeProps(edge)}
      />
    ))}
  </>
);
