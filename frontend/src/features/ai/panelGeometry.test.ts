import { describe, expect, it } from 'vitest';
import {
  DOCK_MIN_WIDTH,
  FLOAT_MIN_HEIGHT,
  FLOAT_MIN_WIDTH,
  clampDockWidth,
  clampRect,
  defaultFloatingRect,
  dockMaxWidth,
  isRect,
  moveRect,
  resizeRect,
} from './panelGeometry';

const viewport = { width: 1000, height: 800 };
const rect = { x: 100, y: 100, width: 400, height: 300 };

describe('clampDockWidth', () => {
  it('keeps a width inside the minimum and 70% of the viewport', () => {
    expect(clampDockWidth(100, 1000)).toBe(DOCK_MIN_WIDTH);
    expect(clampDockWidth(900, 1000)).toBe(700);
    expect(clampDockWidth(500, 1000)).toBe(500);
  });

  it('lets the minimum win on a viewport too small for the ratio', () => {
    expect(dockMaxWidth(400)).toBe(DOCK_MIN_WIDTH);
    expect(clampDockWidth(900, 400)).toBe(DOCK_MIN_WIDTH);
  });
});

describe('clampRect', () => {
  it('pulls a window back inside the viewport', () => {
    expect(clampRect({ x: -50, y: 900, width: 400, height: 300 }, viewport)).toEqual({
      x: 0,
      y: 500,
      width: 400,
      height: 300,
    });
    expect(clampRect({ x: 900, y: 0, width: 400, height: 300 }, viewport).x).toBe(600);
  });

  it('shrinks a window that is bigger than the viewport, then fits it', () => {
    expect(clampRect({ x: 50, y: 50, width: 2000, height: 2000 }, viewport)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
    });
  });

  it('enforces the minimum size when the viewport allows it', () => {
    const small = clampRect({ x: 0, y: 0, width: 10, height: 10 }, viewport);
    expect([small.width, small.height]).toEqual([FLOAT_MIN_WIDTH, FLOAT_MIN_HEIGHT]);
  });

  it('never exceeds a viewport smaller than the minimum', () => {
    const tiny = clampRect(rect, { width: 200, height: 150 });
    expect(tiny).toEqual({ x: 0, y: 0, width: 200, height: 150 });
  });
});

describe('non-finite input', () => {
  it('never returns NaN from a corrupt rectangle or width', () => {
    const corrupt = clampRect({} as never, viewport);
    expect(Object.values(corrupt).every(Number.isFinite)).toBe(true);
    const strings = clampRect({ x: 'a', y: null, width: '5', height: NaN } as never, viewport);
    expect(Object.values(strings).every(Number.isFinite)).toBe(true);
    expect(clampDockWidth(NaN, 1000)).toBe(DOCK_MIN_WIDTH);
  });

  it('isRect accepts only four finite numbers', () => {
    expect(isRect(rect)).toBe(true);
    expect(isRect({})).toBe(false);
    expect(isRect(null)).toBe(false);
    expect(isRect({ ...rect, x: NaN })).toBe(false);
    expect(isRect({ ...rect, width: '5' })).toBe(false);
  });
});

describe('moveRect', () => {
  it('moves by the delta and stops at the edges', () => {
    expect(moveRect(rect, 50, -20, viewport)).toMatchObject({ x: 150, y: 80 });
    expect(moveRect(rect, -500, -500, viewport)).toMatchObject({ x: 0, y: 0 });
    expect(moveRect(rect, 5000, 5000, viewport)).toMatchObject({ x: 600, y: 500 });
  });
});

describe('resizeRect', () => {
  it('grows from the east and south edges and stops at the viewport', () => {
    expect(resizeRect(rect, 'se', 50, 40, viewport)).toEqual({ ...rect, width: 450, height: 340 });
    expect(resizeRect(rect, 'e', 5000, 0, viewport).width).toBe(900);
    expect(resizeRect(rect, 's', 0, 5000, viewport).height).toBe(700);
  });

  it('keeps the opposite side fixed when resizing from the west or north', () => {
    const next = resizeRect(rect, 'nw', -50, -30, viewport);
    expect(next).toEqual({ x: 50, y: 70, width: 450, height: 330 });
    expect(next.x + next.width).toBe(rect.x + rect.width);
    expect(next.y + next.height).toBe(rect.y + rect.height);
  });

  it('stops at the minimum size without moving the fixed side', () => {
    const next = resizeRect(rect, 'w', 5000, 0, viewport);
    expect(next.width).toBe(FLOAT_MIN_WIDTH);
    expect(next.x + next.width).toBe(rect.x + rect.width);
    expect(resizeRect(rect, 'n', 0, 5000, viewport).height).toBe(FLOAT_MIN_HEIGHT);
  });

  it('does not grow past the viewport edge from the west or north', () => {
    expect(resizeRect(rect, 'w', -5000, 0, viewport)).toMatchObject({ x: 0, width: 500 });
    expect(resizeRect(rect, 'n', 0, -5000, viewport)).toMatchObject({ y: 0, height: 400 });
  });
});

describe('defaultFloatingRect', () => {
  it('sits inside the viewport, on the right', () => {
    const next = defaultFloatingRect(viewport);
    expect(next).toEqual(clampRect(next, viewport));
    expect(next.x + next.width).toBeLessThanOrEqual(viewport.width);
    expect(next.x).toBeGreaterThan(viewport.width / 2);
  });
});
