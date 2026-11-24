/**
 * Pure logic behind the freehand layer drawn over a note.
 *
 * Kept free of React and the DOM so it can be tested without a browser: the
 * component only translates pointer events into calls to these functions.
 *
 * KNOWN TRADEOFF: points are stored as absolute CSS px relative to the editor
 * container's top-left. If the text above a stroke reflows (a line is added, the
 * window is resized), the drawing does not move with it. Anchoring strokes to
 * blocks is a much bigger problem and is deliberately not attempted here.
 */

import { distanceToSegment, isShapeType, shapeHit, type StrokeType } from './shapes';

/** [x, y] in CSS px relative to the editor container. */
export type StrokePoint = [number, number];

export interface Stroke {
  id: string;
  /**
   * Absent means 'free' (every drawing saved before the shape tools). Shapes
   * carry exactly two points; see shapes.ts.
   */
  type?: StrokeType;
  color: string;
  width: number;
  points: StrokePoint[];
}

/** Shape of Note.drawing. The backend stores `{}` for a note never drawn on. */
export interface NoteDrawing {
  version: 1;
  /** Extra height the user grew the note to, or null if never grown. */
  height: number | null;
  /**
   * Width of the drawing surface when the user drew past the right edge, or
   * null for "as wide as the editor". Optional in stored data (older drawings
   * have none); only the surface extends, the text column never does.
   */
  width: number | null;
  strokes: Stroke[];
}

/**
 * Mirrors the backend's validate_drawing bounds. Staying under them client-side
 * means a long session degrades to "cannot add more" instead of to a 400 that
 * silently loses every later stroke.
 */
export const DRAWING_LIMITS = {
  maxStrokes: 2000,
  maxPoints: 100_000,
  maxHeight: 100_000,
  maxWidth: 100_000,
  maxCoordinate: 100_000,
} as const;

/**
 * Colors are CSS variables, not hex values, so a drawing made in the light theme
 * stays legible in the dark one. The list doubles as an allow-list: a stored
 * color outside it is replaced instead of being handed to the `stroke` style.
 */
export const PEN_COLORS = [
  'var(--color-ink)',
  'var(--color-primary-ink)',
  'var(--color-danger)',
  'var(--color-success)',
] as const;

export const PEN_WIDTHS = [2, 4, 8] as const;

export const DEFAULT_COLOR = PEN_COLORS[0];
export const DEFAULT_WIDTH = PEN_WIDTHS[1];

/** Pointer samples closer than this add bytes and no visible detail. */
export const MIN_POINT_DISTANCE = 1.5;

export const EMPTY_DRAWING: NoteDrawing = { version: 1, height: null, width: null, strokes: [] };

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Turns whatever the API returned into a safe NoteDrawing.
 *
 * Lenient on purpose: a malformed stroke is dropped rather than throwing, so a
 * bad row can never stop the note itself from opening.
 */
export const normalizeDrawing = (raw: unknown): NoteDrawing => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return EMPTY_DRAWING;
  const source = raw as Record<string, unknown>;
  if (source.version !== 1 || !Array.isArray(source.strokes)) return EMPTY_DRAWING;

  const strokes: Stroke[] = [];
  for (const candidate of source.strokes) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const item = candidate as Record<string, unknown>;
    if (typeof item.id !== 'string' || !Array.isArray(item.points)) continue;

    const points: StrokePoint[] = [];
    for (const point of item.points) {
      if (Array.isArray(point) && isFiniteNumber(point[0]) && isFiniteNumber(point[1])) {
        points.push([point[0], point[1]]);
      }
    }
    if (points.length === 0) continue;

    // Unknown types are dropped rather than guessed at, and a shape that does not
    // have exactly its two defining points cannot be drawn.
    const type = item.type;
    if (type !== undefined && type !== 'free' && !isShapeType(type)) continue;
    if (isShapeType(type) && points.length !== 2) continue;

    strokes.push({
      id: item.id,
      ...(isShapeType(type) ? { type } : {}),
      color: (PEN_COLORS as readonly string[]).includes(item.color as string)
        ? (item.color as string)
        : DEFAULT_COLOR,
      width: isFiniteNumber(item.width) && item.width > 0 ? Math.min(item.width, 100) : DEFAULT_WIDTH,
      points,
    });
  }

  const extent = (value: unknown, max: number) =>
    isFiniteNumber(value) && value > 0 ? Math.min(value, max) : null;

  // `width` is absent in drawings saved before horizontal growth existed; that
  // reads as null, i.e. "as wide as the editor".
  return {
    version: 1,
    height: extent(source.height, DRAWING_LIMITS.maxHeight),
    width: extent(source.width, DRAWING_LIMITS.maxWidth),
    strokes,
  };
};

/** One decimal is a tenth of a CSS px: invisible, and a third of the JSON size. */
export const roundCoordinate = (value: number) => Math.round(value * 10) / 10;

/**
 * Appends a sample unless it is too close to the previous one. Returns the same
 * array instance when nothing was added, so callers can detect "no change".
 */
export const appendPoint = (
  points: StrokePoint[],
  x: number,
  y: number,
  minDistance = MIN_POINT_DISTANCE,
): StrokePoint[] => {
  const px = roundCoordinate(x);
  const py = roundCoordinate(y);
  const last = points[points.length - 1];
  if (last && Math.hypot(px - last[0], py - last[1]) < minDistance) return points;
  return [...points, [px, py]];
};

const format = (value: number) => String(roundCoordinate(value));

/**
 * SVG path data for a stroke, smoothed with quadratic curves through midpoints.
 *
 * Joining raw samples with straight lines shows every jitter of the hand as a
 * corner. Using each sample as a control point and the midpoint between two
 * samples as the curve end gives a path that is continuous and smooth without
 * any fitting step, and costs O(n).
 */
export const strokeToPath = (points: StrokePoint[]): string => {
  if (points.length === 0) return '';
  const [first] = points;

  // A tap is a zero-length segment: with a round line cap it renders as a dot.
  if (points.length === 1) return `M${format(first[0])} ${format(first[1])}h0.01`;

  if (points.length === 2) {
    return `M${format(first[0])} ${format(first[1])}L${format(points[1][0])} ${format(points[1][1])}`;
  }

  let d = `M${format(first[0])} ${format(first[1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    d += `Q${format(cx)} ${format(cy)} ${format((cx + nx) / 2)} ${format((cy + ny) / 2)}`;
  }
  const last = points[points.length - 1];
  return `${d}L${format(last[0])} ${format(last[1])}`;
};

export { distanceToSegment };

/** Whether an eraser of `radius` centred on (x, y) touches the stroke. */
export const strokeHit = (stroke: Stroke, x: number, y: number, radius: number): boolean => {
  const reach = radius + stroke.width / 2;
  const { points } = stroke;

  if (isShapeType(stroke.type) && points.length === 2) {
    return shapeHit(stroke.type, points[0], points[1], x, y, reach);
  }

  if (points.length === 1) return Math.hypot(x - points[0][0], y - points[0][1]) <= reach;

  for (let i = 0; i < points.length - 1; i++) {
    if (distanceToSegment(x, y, points[i], points[i + 1]) <= reach) return true;
  }
  return false;
};

/**
 * Removes every stroke the eraser touches. Returns the same array when nothing
 * was hit, so the caller can skip a history entry and a save.
 */
export const eraseAt = (strokes: Stroke[], x: number, y: number, radius: number): Stroke[] => {
  const remaining = strokes.filter((stroke) => !strokeHit(stroke, x, y, radius));
  return remaining.length === strokes.length ? strokes : remaining;
};

export const GROW_EDGE = 80;
export const GROW_STEP = 200;

/**
 * Height the note should have so the pen can keep going down.
 *
 * Within `edge` px of the bottom the area grows by whole `step`s, enough that
 * the pointer ends up outside the trigger zone again. Growing in steps, not
 * continuously, keeps layout changes rare while a stroke is in flight.
 * Never shrinks: undoing a stroke must not yank the page up under the reader.
 */
export const growExtent = (
  pointer: number,
  current: number,
  edge = GROW_EDGE,
  step = GROW_STEP,
  max: number = DRAWING_LIMITS.maxHeight,
): number => {
  if (pointer < current - edge) return current;

  const missing = pointer + edge - current;
  const steps = Math.max(1, Math.ceil(missing / step));
  return Math.min(current + steps * step, max);
};

/** Vertical case of growExtent; kept as its own name for readability at call sites. */
export const growHeight = growExtent;

export interface SurfaceSize {
  width: number;
  height: number;
}

/**
 * Both axes at once: the same edge/step rule applied to the bottom and the
 * right edge. Returns the same object when neither axis grew, so callers can
 * compare by identity.
 */
export const growSurface = (
  pointer: { x: number; y: number },
  current: SurfaceSize,
): SurfaceSize => {
  const width = growExtent(pointer.x, current.width, GROW_EDGE, GROW_STEP, DRAWING_LIMITS.maxWidth);
  const height = growExtent(pointer.y, current.height);
  return width === current.width && height === current.height ? current : { width, height };
};

/** True while another stroke of `extraPoints` still fits the backend bounds. */
export const canAddStroke = (strokes: Stroke[], extraPoints: number): boolean => {
  if (strokes.length >= DRAWING_LIMITS.maxStrokes) return false;
  const used = strokes.reduce((total, stroke) => total + stroke.points.length, 0);
  return used + extraPoints <= DRAWING_LIMITS.maxPoints;
};

/** Clamps to the backend's coordinate bound so one wild sample cannot 400 a save. */
export const clampCoordinate = (value: number) =>
  Math.max(0, Math.min(value, DRAWING_LIMITS.maxCoordinate));
