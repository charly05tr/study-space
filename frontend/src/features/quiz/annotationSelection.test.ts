import { describe, expect, it } from 'vitest';
import {
  MAX_QUIZ_SOURCE_CHARS,
  countSourceChars,
  groupBySource,
  isOverSourceLimit,
  selectAnnotations,
  setChecked,
} from './annotationSelection';
import type { QuizSourceAnnotation } from './annotationSelection';

const annotation = (
  id: number,
  source: number,
  page: number,
  content = 'text',
): QuizSourceAnnotation => ({
  id,
  source,
  source_title: `Source ${source}`,
  annotation_type: 'highlight',
  page,
  content,
});

describe('groupBySource', () => {
  it('groups by source, in first-appearance order, sorted by page inside each', () => {
    const groups = groupBySource([
      annotation(1, 20, 5),
      annotation(2, 10, 1),
      annotation(3, 20, 2),
    ]);

    expect(groups.map((group) => group.source)).toEqual([20, 10]);
    expect(groups[0].title).toBe('Source 20');
    expect(groups[0].annotations.map((a) => a.id)).toEqual([3, 1]);
  });

  it('returns nothing for no annotations', () => {
    expect(groupBySource([])).toEqual([]);
  });
});

describe('selectAnnotations', () => {
  it('keeps everything checked by default and drops unchecked ids', () => {
    const all = [annotation(1, 1, 1), annotation(2, 1, 1), annotation(3, 1, 1)];
    expect(selectAnnotations(all, new Set())).toHaveLength(3);
    expect(selectAnnotations(all, new Set([2])).map((a) => a.id)).toEqual([1, 3]);
  });
});

describe('char counting', () => {
  it('sums trimmed content lengths', () => {
    expect(countSourceChars([{ content: ' abc ' }, { content: 'de' }])).toBe(5);
    expect(countSourceChars([])).toBe(0);
  });

  it('is over the limit only above the cap', () => {
    expect(isOverSourceLimit(MAX_QUIZ_SOURCE_CHARS)).toBe(false);
    expect(isOverSourceLimit(MAX_QUIZ_SOURCE_CHARS + 1)).toBe(true);
  });
});

describe('setChecked', () => {
  it('unchecks and re-checks without mutating the input', () => {
    const start = new Set([1]);
    const unchecked = setChecked(start, [2, 3], false);
    expect([...unchecked].sort()).toEqual([1, 2, 3]);
    expect([...start]).toEqual([1]);

    expect([...setChecked(unchecked, [1, 3], true)]).toEqual([2]);
  });
});
