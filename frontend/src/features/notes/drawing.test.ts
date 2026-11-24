import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLOR,
  DRAWING_LIMITS,
  EMPTY_DRAWING,
  appendPoint,
  canAddStroke,
  clampCoordinate,
  computeBleed,
  eraseAt,
  growHeight,
  growSurface,
  normalizeDrawing,
  strokeHit,
  strokeToPath,
  type Stroke,
  type StrokePoint,
} from './drawing';

const stroke = (points: StrokePoint[], width = 2, id = 's'): Stroke => ({
  id,
  color: DEFAULT_COLOR,
  width,
  points,
});

describe('strokeToPath', () => {
  it('returns an empty path for no points', () => {
    expect(strokeToPath([])).toBe('');
  });

  it('draws a tap as a zero-length segment so a round cap renders a dot', () => {
    expect(strokeToPath([[5, 6]])).toBe('M5 6h0.01');
  });

  it('draws two points as a straight line', () => {
    expect(strokeToPath([[0, 0], [10, 10]])).toBe('M0 0L10 10');
  });

  it('smooths longer strokes with quadratic curves through midpoints', () => {
    expect(strokeToPath([[0, 0], [10, 0], [10, 10]])).toBe('M0 0Q10 0 10 5L10 10');
  });
});

describe('appendPoint', () => {
  it('rounds to one decimal', () => {
    expect(appendPoint([], 1.234, 5.678)).toEqual([[1.2, 5.7]]);
  });

  it('ignores samples closer than the minimum distance', () => {
    const points: StrokePoint[] = [[0, 0]];
    expect(appendPoint(points, 0.5, 0.5)).toBe(points);
  });

  it('keeps samples that moved far enough', () => {
    expect(appendPoint([[0, 0]], 5, 0)).toEqual([[0, 0], [5, 0]]);
  });
});

describe('normalizeDrawing', () => {
  it('treats the backend default {} as an empty drawing', () => {
    expect(normalizeDrawing({})).toBe(EMPTY_DRAWING);
    expect(normalizeDrawing(null)).toBe(EMPTY_DRAWING);
    expect(normalizeDrawing([])).toBe(EMPTY_DRAWING);
  });

  it('round-trips a valid drawing', () => {
    const drawing = { version: 1, height: 900, width: 1100, strokes: [stroke([[1, 2], [3, 4]])] };
    expect(normalizeDrawing(JSON.parse(JSON.stringify(drawing)))).toEqual(drawing);
  });

  it('drops malformed strokes and points instead of throwing', () => {
    const result = normalizeDrawing({
      version: 1,
      height: -3,
      strokes: [
        { id: 'a', color: DEFAULT_COLOR, width: 2, points: [[1, 2], ['x', 1], [3]] },
        { id: 'b', points: [] },
        'nope',
      ],
    });
    expect(result.height).toBeNull();
    expect(result.strokes).toHaveLength(1);
    expect(result.strokes[0].points).toEqual([[1, 2]]);
  });

  it('replaces a color outside the palette', () => {
    const result = normalizeDrawing({
      version: 1,
      height: null,
      strokes: [{ id: 'a', color: 'url(http://evil)', width: 2, points: [[0, 0]] }],
    });
    expect(result.strokes[0].color).toBe(DEFAULT_COLOR);
  });
});

describe('strokeHit and eraseAt', () => {
  const line = stroke([[0, 0], [100, 0]], 4);

  it('hits when the eraser overlaps the segment', () => {
    expect(strokeHit(line, 50, 8, 6)).toBe(true);
  });

  it('misses when the eraser is farther than radius plus half the width', () => {
    expect(strokeHit(line, 50, 20, 6)).toBe(false);
  });

  it('does not extend a segment past its ends', () => {
    expect(strokeHit(line, 120, 0, 6)).toBe(false);
  });

  it('hits a single-point stroke', () => {
    expect(strokeHit(stroke([[10, 10]]), 12, 10, 3)).toBe(true);
  });

  it('removes only the touched strokes', () => {
    const far = stroke([[0, 500], [100, 500]], 4, 'far');
    expect(eraseAt([line, far], 50, 2, 6)).toEqual([far]);
  });

  it('returns the same array when nothing was touched', () => {
    const strokes = [line];
    expect(eraseAt(strokes, 50, 300, 6)).toBe(strokes);
  });
});

describe('growHeight', () => {
  it('keeps the height while the pointer is away from the bottom edge', () => {
    expect(growHeight(300, 1000)).toBe(1000);
    expect(growHeight(919, 1000)).toBe(1000);
  });

  it('grows by one step when the pointer enters the edge zone', () => {
    expect(growHeight(920, 1000)).toBe(1200);
  });

  it('grows by several steps if the pointer jumped far past the end', () => {
    // The new bottom must leave the pointer outside the trigger zone.
    const next = growHeight(1900, 1000);
    expect(next).toBeGreaterThanOrEqual(1900 + 80);
    expect((next - 1000) % 200).toBe(0);
  });

  it('never exceeds the backend limit', () => {
    expect(growHeight(99_990, 99_950)).toBe(DRAWING_LIMITS.maxHeight);
  });
});

describe('growSurface', () => {
  const size = { width: 700, height: 1000 };

  it('returns the same object when the pointer is away from both edges', () => {
    expect(growSurface({ x: 100, y: 100 }, size)).toBe(size);
  });

  it('grows only the width near the right edge', () => {
    expect(growSurface({ x: 640, y: 100 }, size)).toEqual({ width: 900, height: 1000 });
  });

  it('grows only the height near the bottom edge', () => {
    expect(growSurface({ x: 100, y: 960 }, size)).toEqual({ width: 700, height: 1200 });
  });

  it('grows both in the corner and never shrinks', () => {
    const next = growSurface({ x: 900, y: 1100 }, size);
    expect(next.width).toBeGreaterThanOrEqual(980);
    expect(next.height).toBeGreaterThanOrEqual(1180);
    expect(growSurface({ x: 10, y: 10 }, next)).toBe(next);
  });

  it('caps the width at the backend limit', () => {
    expect(growSurface({ x: 99_990, y: 0 }, { width: 99_950, height: 1000 }).width).toBe(
      DRAWING_LIMITS.maxWidth,
    );
  });
});

describe('normalizeDrawing width', () => {
  it('treats a drawing saved without width as null', () => {
    expect(normalizeDrawing({ version: 1, height: 500, strokes: [] }).width).toBeNull();
  });

  it('keeps a valid width and drops an invalid one', () => {
    expect(normalizeDrawing({ version: 1, width: 1200, strokes: [] }).width).toBe(1200);
    expect(normalizeDrawing({ version: 1, width: -5, strokes: [] }).width).toBeNull();
    expect(normalizeDrawing({ version: 1, width: 1e9, strokes: [] }).width).toBe(
      DRAWING_LIMITS.maxWidth,
    );
  });
});

describe('canAddStroke', () => {
  it('refuses once the stroke count limit is reached', () => {
    const many = Array.from({ length: DRAWING_LIMITS.maxStrokes }, (_, i) =>
      stroke([[0, 0]], 2, String(i)),
    );
    expect(canAddStroke(many, 1)).toBe(false);
    expect(canAddStroke(many.slice(1), 1)).toBe(true);
  });

  it('refuses when the point budget would be exceeded', () => {
    expect(canAddStroke([], DRAWING_LIMITS.maxPoints + 1)).toBe(false);
    expect(canAddStroke([], DRAWING_LIMITS.maxPoints)).toBe(true);
  });
});

describe('computeBleed', () => {
  const area = { left: 300, right: 1300, paddingLeft: 24, paddingRight: 24 };

  it('is the space between the column and the padded edges of the area', () => {
    // A 576px column centred in a 952px content box.
    expect(computeBleed({ left: 512, right: 1088 }, area)).toEqual({ left: 188, right: 188 });
  });

  it('is zero when the column fills the area and never negative', () => {
    expect(computeBleed({ left: 324, right: 1276 }, area)).toEqual({ left: 0, right: 0 });
    expect(computeBleed({ left: 310, right: 1290 }, area)).toEqual({ left: 0, right: 0 });
  });

  it('ignores horizontal scrolling of the wrapper', () => {
    // Scrolled 50px: the column moved left by 50 but the bleed is unchanged.
    expect(computeBleed({ left: 462, right: 1038 }, area, 50)).toEqual({ left: 188, right: 188 });
  });
});

describe('clampCoordinate', () => {
  it('floors at zero by default and at a negative minimum for x', () => {
    expect(clampCoordinate(-40)).toBe(0);
    expect(clampCoordinate(-40, -188)).toBe(-40);
    expect(clampCoordinate(-500, -188)).toBe(-188);
  });

  it('caps at the backend bound', () => {
    expect(clampCoordinate(1e9)).toBe(DRAWING_LIMITS.maxCoordinate);
  });
});
