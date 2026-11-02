import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  clampRect,
  moveRect,
  resizeRect,
  type Rect,
  type ResizeEdge,
  type Viewport,
} from '../panelGeometry';
import { lockSelection } from './lockSelection';

interface Options {
  /** The committed rectangle; the hook shows it clamped to the viewport. */
  rect: Rect;
  viewport: Viewport;
  /** Called once when a drag ends. */
  onCommit: (rect: Rect) => void;
}

type Gesture = { kind: 'move' } | { kind: 'resize'; edge: ResizeEdge };

interface Session {
  pointerId: number;
  startX: number;
  startY: number;
  start: Rect;
  gesture: Gesture;
}

/**
 * Pointer-driven move and resize for a floating window.
 *
 * The rectangle is live in local state while dragging and only committed on
 * release, so the persisted store is written once per gesture, not per frame.
 * It is never written because the viewport changed: the clamp is applied to
 * what is shown, so growing the window back restores the saved geometry.
 * Handlers are returned as props to spread, so the window markup stays the
 * caller's.
 */
export const useDraggableResizable = ({ rect, viewport, onCommit }: Options) => {
  const [live, setLive] = useState<Rect | null>(null);
  const session = useRef<Session | null>(null);
  const liveRef = useRef<Rect | null>(null);
  const unlock = useRef<(() => void) | null>(null);

  // Derived, not stored: a smaller window always shows an in-bounds rectangle.
  const current = clampRect(live ?? rect, viewport);

  // Unmounting mid-drag must not leave text selection disabled.
  useEffect(() => () => unlock.current?.(), []);

  const begin = (event: ReactPointerEvent<HTMLElement>, gesture: Gesture) => {
    // One gesture at a time, by the primary button of the primary pointer.
    if (session.current || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    session.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      start: current,
      gesture,
    };
    unlock.current = lockSelection();
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const active = session.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      const next =
        active.gesture.kind === 'move'
          ? moveRect(active.start, dx, dy, viewport)
          : resizeRect(active.start, active.gesture.edge, dx, dy, viewport);
      liveRef.current = next;
      setLive(next);
    },
    [viewport],
  );

  const end = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const active = session.current;
      if (!active || active.pointerId !== event.pointerId) return;
      session.current = null;
      unlock.current?.();
      unlock.current = null;
      const final = liveRef.current;
      liveRef.current = null;
      setLive(null);
      if (final) onCommit(final);
    },
    [onCommit],
  );

  // `lostpointercapture` also fires after a normal release; `end` is idempotent.
  const shared = {
    onPointerMove,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  };

  return {
    rect: current,
    /** Spread on the header: dragging it moves the window. Buttons inside stay clickable. */
    moveProps: {
      ...shared,
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        if ((event.target as HTMLElement).closest('button, a, input')) return;
        begin(event, { kind: 'move' });
      },
    },
    /** Spread on an edge or corner element: dragging it resizes from that side. */
    edgeProps: (edge: ResizeEdge) => ({
      ...shared,
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => begin(event, { kind: 'resize', edge }),
    }),
  };
};
