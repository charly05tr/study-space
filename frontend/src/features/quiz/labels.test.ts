import { describe, expect, it } from 'vitest';
import { ORIGIN_LABELS, STATUS_LABELS, STATUS_VARIANTS, questionCountLabel } from './labels';

describe('questionCountLabel', () => {
  it.each([
    [0, '0 questions'],
    [1, '1 question'],
    [2, '2 questions'],
    [30, '30 questions'],
  ])('labels %i', (count, label) => {
    expect(questionCountLabel(count)).toBe(label);
  });
});

describe('quiz labels', () => {
  it('covers every status and origin', () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual(['draft', 'published']);
    expect(Object.keys(STATUS_VARIANTS).sort()).toEqual(['draft', 'published']);
    expect(Object.keys(ORIGIN_LABELS).sort()).toEqual(['ai', 'manual']);
  });
});
