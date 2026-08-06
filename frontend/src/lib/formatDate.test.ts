import { describe, expect, it } from 'vitest';
import { formatDateOnly } from './formatDate';

describe('formatDateOnly', () => {
  it('keeps the day it was given', () => {
    // The whole point: `new Date("2019-05-01")` is UTC midnight, and anywhere
    // behind UTC that renders as 30 April. A publication date is a day someone
    // wrote down, so it has to come back out as that same day.
    expect(formatDateOnly('2019-05-01')).toContain('2019');
    expect(formatDateOnly('2019-05-01')).toBe(
      new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(2019, 4, 1)),
    );
  });

  it('returns null when there is no date', () => {
    expect(formatDateOnly(null)).toBeNull();
    expect(formatDateOnly(undefined)).toBeNull();
    expect(formatDateOnly('')).toBeNull();
  });

  it('returns null for anything that is not a full day', () => {
    expect(formatDateOnly('2019-05')).toBeNull();
    expect(formatDateOnly('not-a-date')).toBeNull();
  });
});
