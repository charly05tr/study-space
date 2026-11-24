import { describe, expect, it } from 'vitest';
import { DEFAULT_COLOR, eraseAt, normalizeDrawing, strokeHit, type Stroke } from './drawing';
import {
  arrowHeadPath,
  boxOf,
  constrainShape,
  isDegenerateShape,
  isShapeType,
  shapeHit,
  type ShapeType,
} from './shapes';

const shape = (type: ShapeType, a: [number, number], b: [number, number], width = 2): Stroke => ({
  id: type,
  type,
  color: DEFAULT_COLOR,
  width,
  points: [a, b],
});

describe('constrainShape', () => {
  it('passes the pointer through without Shift', () => {
    expect(constrainShape('rect', [0, 0], [30.04, 10], false)).toEqual([30, 10]);
  });

  it('makes a square from the longer side, following the drag direction', () => {
    expect(constrainShape('rect', [10, 10], [50, 20], true)).toEqual([50, 50]);
    expect(constrainShape('ellipse', [10, 10], [0, 40], true)).toEqual([-20, 40]);
  });

  it('does not collapse a square dragged along one axis only', () => {
    expect(constrainShape('rect', [10, 10], [10, 40], true)).toEqual([40, 40]);
  });

  it('snaps lines to 45 degree steps and keeps the length', () => {
    // Slightly off horizontal.
    expect(constrainShape('line', [0, 0], [100, 10], true)).toEqual([100.5, 0]);
    // Close to the diagonal.
    const [x, y] = constrainShape('arrow', [0, 0], [50, 45], true);
    expect(x).toBeCloseTo(y, 0);
    expect(Math.hypot(x, y)).toBeCloseTo(Math.hypot(50, 45), 0);
  });
});

describe('isDegenerateShape', () => {
  it('rejects a click without drag and accepts a real one', () => {
    expect(isDegenerateShape([5, 5], [5, 5])).toBe(true);
    expect(isDegenerateShape([5, 5], [6, 6])).toBe(true);
    expect(isDegenerateShape([5, 5], [20, 5])).toBe(false);
  });
});

describe('boxOf', () => {
  it('normalises corners dragged in any direction', () => {
    expect(boxOf([50, 40], [10, 10])).toEqual({ x: 10, y: 10, width: 40, height: 30 });
  });
});

describe('arrowHeadPath', () => {
  it('is empty for a zero-length arrow', () => {
    expect(arrowHeadPath([1, 1], [1, 1], 2)).toBe('');
  });

  it('draws a V whose tip is the end point', () => {
    const d = arrowHeadPath([0, 0], [100, 0], 2);
    expect(d).toMatch(/^M[-\d. ]+L100 0L[-\d. ]+$/);
  });

  it('scales with the stroke width but never outgrows the shaft', () => {
    const wing = (d: string) => Number(d.slice(1).split(' ')[0]);
    // Wing x for a 100px shaft: thicker strokes pull the wings farther back.
    expect(wing(arrowHeadPath([0, 0], [100, 0], 8))).toBeLessThan(
      wing(arrowHeadPath([0, 0], [100, 0], 2)),
    );
    // A 10px shaft caps the head at 60% of its length.
    const short = arrowHeadPath([0, 0], [10, 0], 8);
    expect(wing(short)).toBeGreaterThanOrEqual(10 - 6 - 0.01);
  });
});

describe('shape hit-testing', () => {
  it('hits the edges of a rectangle but not its interior', () => {
    const rect = shape('rect', [0, 0], [100, 60]);
    expect(strokeHit(rect, 50, 2, 5)).toBe(true);
    expect(strokeHit(rect, 99, 30, 5)).toBe(true);
    expect(strokeHit(rect, 50, 30, 5)).toBe(false);
  });

  it('hits an ellipse on its perimeter only', () => {
    const ellipse = shape('ellipse', [0, 0], [100, 60]);
    expect(shapeHit('ellipse', [0, 0], [100, 60], 100, 30, 3)).toBe(true);
    expect(shapeHit('ellipse', [0, 0], [100, 60], 50, 0, 3)).toBe(true);
    expect(strokeHit(ellipse, 50, 30, 5)).toBe(false);
    // The bounding box corner is outside the ellipse.
    expect(strokeHit(ellipse, 0, 0, 5)).toBe(false);
  });

  it('hits a line and an arrow along the segment', () => {
    for (const type of ['line', 'arrow'] as const) {
      const s = shape(type, [0, 0], [100, 0]);
      expect(strokeHit(s, 50, 4, 3)).toBe(true);
      expect(strokeHit(s, 50, 30, 3)).toBe(false);
      expect(strokeHit(s, 130, 0, 3)).toBe(false);
    }
  });

  it('works through eraseAt, which removes only the touched shapes', () => {
    const near = shape('rect', [0, 0], [100, 60]);
    const far = shape('line', [0, 500], [100, 500]);
    expect(eraseAt([near, far], 50, 1, 5)).toEqual([far]);
  });
});

describe('normalizeDrawing with shapes', () => {
  const base = { id: 's', color: DEFAULT_COLOR, width: 2 };
  const wrap = (strokes: unknown[]) => normalizeDrawing({ version: 1, height: null, strokes });

  it('keeps every shape type and leaves free strokes untyped', () => {
    const result = wrap([
      { ...base, id: 'a', type: 'rect', points: [[0, 0], [10, 10]] },
      { ...base, id: 'b', type: 'ellipse', points: [[0, 0], [10, 10]] },
      { ...base, id: 'c', type: 'line', points: [[0, 0], [10, 10]] },
      { ...base, id: 'd', type: 'arrow', points: [[0, 0], [10, 10]] },
      { ...base, id: 'e', points: [[0, 0], [1, 1], [2, 2]] },
      { ...base, id: 'f', type: 'free', points: [[0, 0], [1, 1], [2, 2]] },
    ]);
    expect(result.strokes.map((s) => s.type)).toEqual([
      'rect',
      'ellipse',
      'line',
      'arrow',
      undefined,
      undefined,
    ]);
  });

  it('drops unknown types and shapes without exactly two points', () => {
    const result = wrap([
      { ...base, id: 'a', type: 'star', points: [[0, 0], [10, 10]] },
      { ...base, id: 'b', type: 'rect', points: [[0, 0], [5, 5], [10, 10]] },
      { ...base, id: 'c', type: 'arrow', points: [[0, 0]] },
    ]);
    expect(result.strokes).toEqual([]);
  });
});

describe('isShapeType', () => {
  it('only accepts the four shape names', () => {
    expect(isShapeType('rect')).toBe(true);
    expect(isShapeType('free')).toBe(false);
    expect(isShapeType(undefined)).toBe(false);
  });
});
