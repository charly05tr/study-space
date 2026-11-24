import type { StrokePoint } from './drawing';

/** Distance from (px, py) to the segment a-b. */
export const distanceToSegment = (
  px: number,
  py: number,
  [ax, ay]: StrokePoint,
  [bx, by]: StrokePoint,
): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/**
 * Geometry for the shape tools. Pure, like drawing.ts, so everything here is
 * unit-testable without a browser.
 *
 * A shape is stored as a stroke with exactly two points: opposite corners of its
 * bounding box for a rectangle or ellipse, start and end for a line or arrow.
 * Reusing `points` is what lets the size limits, bounds and eraser keep working
 * on shapes without a second code path.
 */

export const SHAPE_TYPES = ['rect', 'ellipse', 'line', 'arrow'] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];
export type StrokeType = 'free' | ShapeType;

export const isShapeType = (value: unknown): value is ShapeType =>
  (SHAPE_TYPES as readonly unknown[]).includes(value);

/** A drag shorter than this is a click, not a shape. */
export const MIN_SHAPE_SIZE = 3;

const roundTenth = (value: number) => Math.round(value * 10) / 10;

/** True when the drag is too short to be a deliberate shape. */
export const isDegenerateShape = (start: StrokePoint, end: StrokePoint): boolean =>
  Math.hypot(end[0] - start[0], end[1] - start[1]) < MIN_SHAPE_SIZE;

/**
 * Applies the Shift constraint while dragging.
 *
 * Rectangle and ellipse become a square and a circle (the bounding box takes the
 * longer side, in the direction the pointer went). Line and arrow snap to the
 * nearest 45 degrees, keeping their length. Without Shift the pointer is used
 * as is.
 */
export const constrainShape = (
  type: ShapeType,
  start: StrokePoint,
  pointer: StrokePoint,
  shift: boolean,
): StrokePoint => {
  if (!shift) return [roundTenth(pointer[0]), roundTenth(pointer[1])];

  const dx = pointer[0] - start[0];
  const dy = pointer[1] - start[1];

  if (type === 'rect' || type === 'ellipse') {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    // Math.sign(0) is 0, which would collapse the shape to a point.
    return [
      roundTenth(start[0] + side * (dx < 0 ? -1 : 1)),
      roundTenth(start[1] + side * (dy < 0 ? -1 : 1)),
    ];
  }

  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  const length = Math.hypot(dx, dy);
  return [
    roundTenth(start[0] + length * Math.cos(angle)),
    roundTenth(start[1] + length * Math.sin(angle)),
  ];
};

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Normalised bounding box of two opposite corners, whichever way they were dragged. */
export const boxOf = (a: StrokePoint, b: StrokePoint): Box => ({
  x: Math.min(a[0], b[0]),
  y: Math.min(a[1], b[1]),
  width: Math.abs(b[0] - a[0]),
  height: Math.abs(b[1] - a[1]),
});

/**
 * Open "V" for the arrowhead at `end`, as SVG path data.
 *
 * The head scales with the stroke width (a fat arrow needs a fat head) but is
 * capped by the shaft length, so a short arrow does not become all head. It is a
 * path stroked with the shaft's colour, which is what keeps it theme-aware.
 */
export const arrowHeadPath = (start: StrokePoint, end: StrokePoint, strokeWidth: number): string => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return '';

  const headLength = Math.min(Math.max(10, strokeWidth * 4), length * 0.6);
  const spread = Math.PI / 7;
  const back = Math.atan2(dy, dx) + Math.PI;

  const wing = (offset: number) =>
    `${roundTenth(end[0] + headLength * Math.cos(back + offset))} ${roundTenth(
      end[1] + headLength * Math.sin(back + offset),
    )}`;

  return `M${wing(spread)}L${roundTenth(end[0])} ${roundTenth(end[1])}L${wing(-spread)}`;
};

const ELLIPSE_SEGMENTS = 64;

/**
 * The outline of a shape as a polyline, for hit-testing. Rectangle: its four
 * edges as a closed ring. Ellipse: a 64-gon, which is within a fraction of a px
 * of the true perimeter at note scale. Line and arrow: the shaft.
 */
export const shapeOutline = (type: ShapeType, a: StrokePoint, b: StrokePoint): StrokePoint[] => {
  if (type === 'line' || type === 'arrow') return [a, b];

  const { x, y, width, height } = boxOf(a, b);

  if (type === 'rect') {
    return [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
      [x, y],
    ];
  }

  const cx = x + width / 2;
  const cy = y + height / 2;
  const ring: StrokePoint[] = [];
  for (let i = 0; i <= ELLIPSE_SEGMENTS; i++) {
    const t = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
    ring.push([cx + (width / 2) * Math.cos(t), cy + (height / 2) * Math.sin(t)]);
  }
  return ring;
};

/**
 * Whether a point is within `reach` of the shape's outline. Only the outline:
 * shapes are unfilled, so clicking inside a rectangle must not erase it.
 */
export const shapeHit = (
  type: ShapeType,
  a: StrokePoint,
  b: StrokePoint,
  x: number,
  y: number,
  reach: number,
): boolean => {
  const outline = shapeOutline(type, a, b);
  for (let i = 0; i < outline.length - 1; i++) {
    if (distanceToSegment(x, y, outline[i], outline[i + 1]) <= reach) return true;
  }
  return false;
};
