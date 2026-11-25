import { describe, expect, it } from 'vitest';
import { summarizeConversion } from './conversion';
import type { ConversionResult, Flashcard } from './types';

const created = (count: number): Flashcard[] =>
  Array.from({ length: count }, (_, index) => ({ id: index }) as Flashcard);

const result = (overrides: Partial<ConversionResult> = {}): ConversionResult => ({
  created: [],
  skipped: [],
  not_published: [],
  not_found: [],
  ...overrides,
});

describe('summarizeConversion', () => {
  it('reports created and already converted questions together', () => {
    const summary = summarizeConversion(result({ created: created(3), skipped: [1, 2] }));
    expect(summary.variant).toBe('success');
    expect(summary.message).toBe('3 created, 2 already had flashcards');
  });

  it('uses the singular forms', () => {
    const summary = summarizeConversion(result({ created: created(1), skipped: [1] }));
    expect(summary.title).toBe('Flashcard created');
    expect(summary.message).toBe('1 created, 1 already had a flashcard');
  });

  it('is informational when nothing was created', () => {
    const summary = summarizeConversion(result({ skipped: [1, 2] }));
    expect(summary.variant).toBe('info');
    expect(summary.message).toBe('2 already had flashcards');
  });

  it('names draft and missing questions', () => {
    const summary = summarizeConversion(result({ not_published: [1], not_found: [2, 3] }));
    expect(summary.message).toBe(
      '1 question skipped: publish the quiz first, 2 questions were not found',
    );
  });

  it('says so when there was nothing at all', () => {
    expect(summarizeConversion(result()).message).toBe('Nothing to convert.');
  });
});
