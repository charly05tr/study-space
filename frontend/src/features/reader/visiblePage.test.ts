import { describe, expect, it } from 'vitest';
import { mostVisiblePageIndex } from './visiblePage';
import type { PageBox } from './visiblePage';

const VIEWPORT = 1000;

/** Pages of fixed height laid out end to end, shifted by the scroll position. */
const layout = (pageHeight: number, count: number, scrollY: number): PageBox[] =>
  Array.from({ length: count }, (_, index) => ({
    top: index * pageHeight - scrollY,
    bottom: (index + 1) * pageHeight - scrollY,
  }));

describe('mostVisiblePageIndex', () => {
  it('picks the only page in view', () => {
    expect(mostVisiblePageIndex(layout(2000, 5, 0), VIEWPORT)).toBe(0);
  });

  it('picks the page filling the screen even when the previous one is on top', () => {
    // Page 1 ends 200px down; page 2 fills the remaining 800px.
    const pages = layout(2000, 5, 1800);
    expect(mostVisiblePageIndex(pages, VIEWPORT)).toBe(1);
  });

  it('keeps the previous page while it still covers more', () => {
    // Page 1 covers 800px, page 2 only 200px.
    const pages = layout(2000, 5, 1200);
    expect(mostVisiblePageIndex(pages, VIEWPORT)).toBe(0);
  });

  it('does not skip ahead when the split is exactly even', () => {
    const pages = layout(2000, 5, 1500);
    expect(mostVisiblePageIndex(pages, VIEWPORT)).toBe(0);
  });

  it('regression: the tail of the previous page at the top does not win', () => {
    // The reported bug. The top edge sits in page 1 — only its last 100px are
    // on screen — while page 2 fills the other 900px. Sampling the top edge
    // answered "page 1", so entering focus mode landed one page back.
    const pages: PageBox[] = [
      { top: -1900, bottom: 100 },
      { top: 100, bottom: 2100 },
    ];
    expect(mostVisiblePageIndex(pages, VIEWPORT)).toBe(1);
  });

  it('a break just below the centre still belongs to the page covering more', () => {
    // 600px of page 1 against 400px of page 2: page 1 genuinely dominates.
    // Area and a centre sample agree here — the two rules only diverge when
    // three or more pages are on screen.
    const pages: PageBox[] = [
      { top: -1400, bottom: 600 },
      { top: 600, bottom: 2600 },
    ];
    expect(mostVisiblePageIndex(pages, VIEWPORT)).toBe(0);
  });

  it('handles a page shorter than the viewport', () => {
    const pages: PageBox[] = [
      { top: -300, bottom: 100 },
      { top: 100, bottom: 400 },
      { top: 400, bottom: 1200 },
    ];
    expect(mostVisiblePageIndex(pages, VIEWPORT)).toBe(2);
  });

  it('reaches the last page', () => {
    const pages = layout(2000, 5, 8500);
    expect(mostVisiblePageIndex(pages, VIEWPORT)).toBe(4);
  });

  it('falls back to the first page when there is nothing to measure', () => {
    expect(mostVisiblePageIndex([], VIEWPORT)).toBe(0);
  });
});
