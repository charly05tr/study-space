import { describe, expect, it } from 'vitest';
import { byTop, indexAt } from './readerIndex';

describe('indexAt', () => {
  const list = [{ top: 0 }, { top: 100 }, { top: 250 }, { top: 400 }];

  it('finds the entry a position sits inside', () => {
    expect(indexAt(list, 120)).toBe(1);
    expect(indexAt(list, 399)).toBe(2);
  });

  it('treats an exact top as belonging to that entry', () => {
    expect(indexAt(list, 250)).toBe(2);
  });

  it('clamps above the last entry', () => {
    expect(indexAt(list, 10_000)).toBe(3);
  });

  it('clamps below the first entry', () => {
    // Scrolling into the margin above the document is not a reason to have no
    // reading position.
    expect(indexAt(list, -50)).toBe(0);
  });

  it('answers 0 for an empty list so callers cannot index out of bounds', () => {
    expect(indexAt([], 100)).toBe(0);
  });

  it('picks the last of several entries sharing a top', () => {
    // Two lines drawn at the same height: either is a defensible answer, but it
    // has to be a stable one, or the anchor would flap on every scroll tick.
    const tied = [{ top: 0 }, { top: 100 }, { top: 100 }, { top: 300 }];
    expect(indexAt(tied, 150)).toBe(2);
    expect(indexAt(tied, 150)).toBe(2);
  });
});

describe('byTop', () => {
  it('orders by document position, not by insertion', () => {
    // A two-column page: the second column is emitted last and sits highest.
    const columns = [{ top: 90 }, { top: 200 }, { top: 90 }, { top: 40 }];
    expect([...columns].sort(byTop).map((entry) => entry.top)).toEqual([40, 90, 90, 200]);
  });
});
