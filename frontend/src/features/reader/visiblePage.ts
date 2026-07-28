/** A page's vertical position relative to the viewport, as getBoundingClientRect gives it. */
export interface PageBox {
  top: number;
  bottom: number;
}

/**
 * Index of the page covering the most of the viewport.
 *
 * Sampling a single point — the top edge, or the centre — names the previous
 * page whenever a page break happens to sit near that point, which is what made
 * entering focus mode land one page back. Area is unambiguous: it answers
 * "which page am I looking at" rather than "what is under this pixel".
 *
 * Ties go to the earlier page, so a viewport split exactly in half does not
 * skip ahead.
 */
export const mostVisiblePageIndex = (pages: PageBox[], viewportHeight: number): number => {
  let best = 0;
  let bestVisible = -1;

  pages.forEach((page, index) => {
    const visible = Math.min(page.bottom, viewportHeight) - Math.max(page.top, 0);
    if (visible > bestVisible) {
      bestVisible = visible;
      best = index;
    }
  });

  return best;
};
