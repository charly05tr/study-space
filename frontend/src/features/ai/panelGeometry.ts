/** Pure geometry for the review panel, kept apart from React so it can be tested. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Below this (Tailwind's `sm`) the panel is full width and cannot be resized. */
export const NARROW_BREAKPOINT = 640;

export const DOCK_MIN_WIDTH = 320;
export const DOCK_DEFAULT_WIDTH = 448;
/** Share of the viewport the docked panel may take. */
export const DOCK_MAX_RATIO = 0.7;

export const FLOAT_MIN_WIDTH = 320;
export const FLOAT_MIN_HEIGHT = 240;

/** NaN-safe: a non-finite value (corrupt storage) falls back to `min`. */
const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;

/** True for a rectangle whose four fields are all finite numbers. */
export const isRect = (value: unknown): value is Rect => {
  if (typeof value !== 'object' || value === null) return false;
  const rect = value as Record<string, unknown>;
  return (['x', 'y', 'width', 'height'] as const).every(
    (key) => typeof rect[key] === 'number' && Number.isFinite(rect[key]),
  );
};

/** On a tiny viewport the minimum wins over the ratio so the panel stays usable. */
export const dockMaxWidth = (viewportWidth: number): number =>
  Math.max(DOCK_MIN_WIDTH, Math.floor(viewportWidth * DOCK_MAX_RATIO));

export const clampDockWidth = (width: number, viewportWidth: number): number =>
  clamp(Math.round(width), DOCK_MIN_WIDTH, dockMaxWidth(viewportWidth));

/** Keeps a window fully inside the viewport, shrinking it first if it cannot fit. */
export const clampRect = (rect: Rect, viewport: Viewport): Rect => {
  const width = clamp(rect.width, Math.min(FLOAT_MIN_WIDTH, viewport.width), viewport.width);
  const height = clamp(rect.height, Math.min(FLOAT_MIN_HEIGHT, viewport.height), viewport.height);
  return {
    width,
    height,
    x: clamp(rect.x, 0, viewport.width - width),
    y: clamp(rect.y, 0, viewport.height - height),
  };
};

export const moveRect = (start: Rect, dx: number, dy: number, viewport: Viewport): Rect =>
  clampRect({ ...start, x: start.x + dx, y: start.y + dy }, viewport);

/**
 * Drags one edge or corner by (dx, dy). The opposite side stays put, and the
 * dragged one stops at the viewport or at the minimum size.
 */
export const resizeRect = (
  start: Rect,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  viewport: Viewport,
): Rect => {
  let { x, y, width, height } = start;
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  const minWidth = Math.min(FLOAT_MIN_WIDTH, viewport.width);
  const minHeight = Math.min(FLOAT_MIN_HEIGHT, viewport.height);

  if (edge.includes('e')) width = clamp(start.width + dx, minWidth, viewport.width - start.x);
  if (edge.includes('w')) {
    x = clamp(start.x + dx, 0, right - minWidth);
    width = right - x;
  }
  if (edge.includes('s')) height = clamp(start.height + dy, minHeight, viewport.height - start.y);
  if (edge.includes('n')) {
    y = clamp(start.y + dy, 0, bottom - minHeight);
    height = bottom - y;
  }

  return clampRect({ x, y, width, height }, viewport);
};

/** Where the window first appears: the right side, like the dock it came from. */
export const defaultFloatingRect = (viewport: Viewport): Rect =>
  clampRect(
    {
      width: 420,
      height: Math.min(640, viewport.height - 48),
      x: viewport.width - 420 - 24,
      y: 24,
    },
    viewport,
  );
