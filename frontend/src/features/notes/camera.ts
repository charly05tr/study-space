/**
 * Pure camera math for the pannable, zoomable drawing space.
 *
 * Model: while drawing, the note (title, text column and strokes) lives in a
 * "world" that is moved with a CSS transform `translate(x, y) scale(zoom)` and
 * `transform-origin: 0 0`. Stored stroke coordinates never change: they stay in
 * world units relative to the editor column's top-left.
 *
 * All screen points here are relative to `origin`, the viewport position of the
 * world's untransformed top-left corner (measured once when drawing starts).
 * Under that transform a world point `w` lands on screen at `origin + cam + zoom * w`.
 */

export interface Camera {
  /** Pan, in screen px. */
  x: number;
  y: number;
  zoom: number;
}

export interface Vec {
  x: number;
  y: number;
}

export const IDENTITY_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Screen point (viewport coordinates) to world coordinates relative to the world origin. */
export const screenToWorld = (screen: Vec, camera: Camera, origin: Vec): Vec => ({
  x: (screen.x - origin.x - camera.x) / camera.zoom,
  y: (screen.y - origin.y - camera.y) / camera.zoom,
});

/** Inverse of screenToWorld. */
export const worldToScreen = (world: Vec, camera: Camera, origin: Vec): Vec => ({
  x: origin.x + camera.x + world.x * camera.zoom,
  y: origin.y + camera.y + world.y * camera.zoom,
});

export const panBy = (camera: Camera, dx: number, dy: number): Camera => ({
  ...camera,
  x: camera.x + dx,
  y: camera.y + dy,
});

/**
 * Multiplies the zoom by `factor` (clamped) keeping the world point under
 * `anchor` fixed on screen. `anchor` is relative to the world origin, like the
 * camera itself. Returns the same camera when the clamp leaves nothing to do.
 */
export const zoomAt = (camera: Camera, factor: number, anchor: Vec): Camera => {
  const zoom = clampZoom(camera.zoom * factor);
  if (zoom === camera.zoom) return camera;

  const ratio = zoom / camera.zoom;
  return {
    zoom,
    x: anchor.x - (anchor.x - camera.x) * ratio,
    y: anchor.y - (anchor.y - camera.y) * ratio,
  };
};

const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 400;

/** Wheel delta in pixels whatever the browser reports it in (pixels, lines, pages). */
export const wheelDeltaPixels = (event: { deltaY: number; deltaMode: number }): number => {
  if (event.deltaMode === 1) return event.deltaY * LINE_HEIGHT_PX;
  if (event.deltaMode === 2) return event.deltaY * PAGE_HEIGHT_PX;
  return event.deltaY;
};

const WHEEL_SENSITIVITY = 0.0015;
/** Trackpad pinch arrives as ctrl+wheel with small deltas, so it needs a boost. */
const PINCH_SENSITIVITY = 0.01;
/** A single notched mouse wheel click must not be able to jump the zoom. */
const MAX_WHEEL_DELTA = 120;

/** Multiplicative, smooth zoom factor: scrolling up (negative delta) zooms in. */
export const wheelZoomFactor = (deltaPixels: number, pinch = false): number => {
  const bounded = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, deltaPixels));
  return Math.exp(-bounded * (pinch ? PINCH_SENSITIVITY : WHEEL_SENSITIVITY));
};

/** CSS transform for the world element (pair with `transform-origin: 0 0`). */
export const cameraTransform = (camera: Camera): string =>
  `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;

export const zoomPercent = (camera: Camera): number => Math.round(camera.zoom * 100);
