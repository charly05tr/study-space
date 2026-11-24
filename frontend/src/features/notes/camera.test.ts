import { describe, expect, it } from 'vitest';
import {
  IDENTITY_CAMERA,
  MAX_ZOOM,
  MIN_ZOOM,
  cameraTransform,
  clampZoom,
  panBy,
  screenToWorld,
  wheelDeltaPixels,
  wheelZoomFactor,
  worldToScreen,
  zoomAt,
  zoomPercent,
} from './camera';

const origin = { x: 300, y: 100 };

describe('screenToWorld / worldToScreen', () => {
  it('are inverses under any camera', () => {
    const camera = { x: -120, y: 45, zoom: 2.5 };
    const world = screenToWorld({ x: 700, y: 400 }, camera, origin);
    expect(worldToScreen(world, camera, origin)).toEqual({ x: 700, y: 400 });
  });

  it('is the identity offset by the origin at the default camera', () => {
    expect(screenToWorld({ x: 350, y: 130 }, IDENTITY_CAMERA, origin)).toEqual({ x: 50, y: 30 });
  });

  it('accounts for pan and zoom', () => {
    // Screen = origin + cam + zoom * world.
    expect(screenToWorld({ x: 300 + 10 + 20, y: 100 + 0 }, { x: 10, y: 0, zoom: 2 }, origin)).toEqual({
      x: 10,
      y: 0,
    });
  });
});

describe('zoomAt', () => {
  it('keeps the world point under the cursor fixed', () => {
    const camera = { x: 30, y: -20, zoom: 1 };
    const anchor = { x: 400, y: 250 };
    const before = screenToWorld({ x: anchor.x + origin.x, y: anchor.y + origin.y }, camera, origin);

    const zoomed = zoomAt(camera, 1.7, anchor);
    const after = screenToWorld({ x: anchor.x + origin.x, y: anchor.y + origin.y }, zoomed, origin);

    expect(zoomed.zoom).toBeCloseTo(1.7);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps the zoom range', () => {
    expect(zoomAt(IDENTITY_CAMERA, 1000, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(IDENTITY_CAMERA, 0.0001, { x: 0, y: 0 }).zoom).toBe(MIN_ZOOM);
  });

  it('returns the same camera when already at the limit', () => {
    const atMax = { x: 5, y: 5, zoom: MAX_ZOOM };
    expect(zoomAt(atMax, 2, { x: 10, y: 10 })).toBe(atMax);
  });
});

describe('panBy', () => {
  it('moves the camera without touching the zoom', () => {
    expect(panBy({ x: 1, y: 2, zoom: 3 }, 10, -5)).toEqual({ x: 11, y: -3, zoom: 3 });
  });
});

describe('wheel handling', () => {
  it('normalises delta modes to pixels', () => {
    expect(wheelDeltaPixels({ deltaY: 3, deltaMode: 0 })).toBe(3);
    expect(wheelDeltaPixels({ deltaY: 3, deltaMode: 1 })).toBe(48);
    expect(wheelDeltaPixels({ deltaY: 1, deltaMode: 2 })).toBe(400);
  });

  it('zooms in on scroll up and out on scroll down, symmetrically', () => {
    const up = wheelZoomFactor(-100);
    const down = wheelZoomFactor(100);
    expect(up).toBeGreaterThan(1);
    expect(down).toBeLessThan(1);
    expect(up * down).toBeCloseTo(1);
  });

  it('bounds a single event and boosts pinch', () => {
    expect(wheelZoomFactor(-100000)).toBeCloseTo(wheelZoomFactor(-120));
    expect(wheelZoomFactor(-5, true)).toBeGreaterThan(wheelZoomFactor(-5));
  });
});

describe('helpers', () => {
  it('formats the transform and percent', () => {
    expect(cameraTransform({ x: 10, y: -4, zoom: 1.5 })).toBe('translate(10px, -4px) scale(1.5)');
    expect(zoomPercent({ x: 0, y: 0, zoom: 0.256 })).toBe(26);
  });

  it('clampZoom bounds both ends', () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });
});
