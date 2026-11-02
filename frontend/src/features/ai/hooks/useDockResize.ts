import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { DOCK_MIN_WIDTH, clampDockWidth, dockMaxWidth } from '../panelGeometry';
import { lockSelection } from './lockSelection';

const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;

interface Options {
  width: number;
  viewportWidth: number;
  onCommit: (width: number) => void;
}

/**
 * Left-edge resize for the docked drawer, by pointer or arrow keys.
 *
 * The drawer hangs off the right edge, so dragging left makes it wider. Like
 * `useDraggableResizable`, a drag is local until release, and a small viewport
 * only clamps what is shown, never what is saved.
 */
export const useDockResize = ({ width, viewportWidth, onCommit }: Options) => {
  const [live, setLive] = useState<number | null>(null);
  const session = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const liveRef = useRef<number | null>(null);
  const unlock = useRef<(() => void) | null>(null);

  const current = clampDockWidth(live ?? width, viewportWidth);

  // Unmounting mid-drag must not leave text selection disabled.
  useEffect(() => () => unlock.current?.(), []);

  // Idempotent: `lostpointercapture` follows a normal release too.
  const end = (event: ReactPointerEvent<HTMLElement>) => {
    if (!session.current || session.current.pointerId !== event.pointerId) return;
    session.current = null;
    unlock.current?.();
    unlock.current = null;
    const final = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (final !== null) onCommit(final);
  };

  return {
    width: current,
    handleProps: {
      role: 'separator' as const,
      'aria-orientation': 'vertical' as const,
      'aria-label': 'Resize review panel',
      'aria-valuemin': DOCK_MIN_WIDTH,
      'aria-valuemax': dockMaxWidth(viewportWidth),
      'aria-valuenow': current,
      tabIndex: 0,
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
        // One gesture at a time, by the primary button of the primary pointer.
        if (session.current || event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        session.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: current };
        unlock.current = lockSelection();
        event.currentTarget.setPointerCapture?.(event.pointerId);
      },
      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
        const active = session.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const next = clampDockWidth(active.startWidth - (event.clientX - active.startX), viewportWidth);
        liveRef.current = next;
        setLive(next);
      },
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
      onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
        const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
        let next: number | null = null;
        if (event.key === 'ArrowLeft') next = current + step;
        else if (event.key === 'ArrowRight') next = current - step;
        else if (event.key === 'Home') next = DOCK_MIN_WIDTH;
        else if (event.key === 'End') next = dockMaxWidth(viewportWidth);
        if (next === null) return;
        event.preventDefault();
        onCommit(clampDockWidth(next, viewportWidth));
      },
    },
  };
};
