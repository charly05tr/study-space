import { describe, expect, it } from 'vitest';
import { SHAPE_TOOLS, shapeEntry, toolForKey, wrapIndex } from './drawingTools';

describe('wrapIndex', () => {
  it('wraps forwards and backwards', () => {
    expect(wrapIndex(3, 1, 4)).toBe(0);
    expect(wrapIndex(0, -1, 4)).toBe(3);
    expect(wrapIndex(1, 1, 4)).toBe(2);
  });

  it('is safe on an empty list', () => {
    expect(wrapIndex(0, 1, 0)).toBe(0);
  });
});

describe('toolForKey', () => {
  it('maps every shortcut, case-insensitively', () => {
    expect(toolForKey('p')?.tool).toBe('pen');
    expect(toolForKey('R')?.tool).toBe('rect');
    expect(toolForKey('o')?.tool).toBe('ellipse');
    expect(toolForKey('l')?.tool).toBe('line');
    expect(toolForKey('a')?.tool).toBe('arrow');
    expect(toolForKey('e')?.tool).toBe('eraser');
  });

  it('ignores other keys', () => {
    expect(toolForKey('x')).toBeUndefined();
    expect(toolForKey('ArrowDown')).toBeUndefined();
  });

  it('has a unique shortcut per tool', () => {
    const keys = SHAPE_TOOLS.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('shapeEntry', () => {
  it('finds the entry for a shape', () => {
    expect(shapeEntry('ellipse').label).toBe('Ellipse');
  });
});
