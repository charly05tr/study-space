/** Anything the reader locates by its distance from the top of the document. */
export interface Positioned {
  top: number;
}

/** Sorts by document position. */
export const byTop = (first: Positioned, second: Positioned) => first.top - second.top;

/**
 * Index of the last entry starting at or above `position`.
 *
 * The list must be sorted by `top`. Document order is not enough: a
 * layout-converted page emits its lines in reading order, so on a two-column
 * page the whole second column follows the first while sitting above it.
 *
 * An empty list has no answer; callers check the length before asking.
 */
export const indexAt = (list: Positioned[], position: number): number => {
  let low = 0;
  let high = list.length - 1;
  let found = 0;

  while (low <= high) {
    const middle = (low + high) >> 1;
    if (list[middle].top <= position) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return found;
};
