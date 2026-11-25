import { describe, expect, it } from 'vitest';
import { dueLabel, filterFlashcards, hasProgress, toContent, validateContent } from './flashcardList';
import type { Flashcard } from './types';

const card = (overrides: Partial<Flashcard> = {}): Flashcard => ({
  id: 1,
  studyspace: 1,
  question: null,
  front: 'Capital of France',
  back: 'Paris',
  state: 0,
  step: null,
  stability: null,
  difficulty: null,
  due: '2026-01-01T00:00:00Z',
  last_review: null,
  reps: 0,
  lapses: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('filterFlashcards', () => {
  const cards = [
    card({ id: 1 }),
    card({ id: 2, front: 'Largest planet', back: 'Jupiter', state: 2 }),
  ];

  it('returns everything for an empty search and all states', () => {
    expect(filterFlashcards(cards, '  ', 'all')).toHaveLength(2);
  });

  it('matches either side, ignoring case', () => {
    expect(filterFlashcards(cards, 'JUPITER', 'all').map((c) => c.id)).toEqual([2]);
    expect(filterFlashcards(cards, 'capital', 'all').map((c) => c.id)).toEqual([1]);
  });

  it('narrows by state, including the new state 0', () => {
    expect(filterFlashcards(cards, '', 0).map((c) => c.id)).toEqual([1]);
    expect(filterFlashcards(cards, '', 2).map((c) => c.id)).toEqual([2]);
  });
});

describe('dueLabel', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  it('calls a never-reviewed card new', () => {
    expect(dueLabel(card({ state: 0 }), now)).toBe('New');
  });

  it('calls a reviewed card past its date due now', () => {
    expect(dueLabel(card({ state: 2, due: '2026-05-01T00:00:00Z' }), now)).toBe('Due now');
  });

  it('shows the date of a card due later', () => {
    expect(dueLabel(card({ state: 2, due: '2026-07-01T00:00:00Z' }), now)).toMatch(/^Due .+/);
    expect(dueLabel(card({ state: 2, due: '2026-07-01T00:00:00Z' }), now)).not.toBe('Due now');
  });
});

describe('validateContent', () => {
  it('requires both sides', () => {
    expect(validateContent({ front: ' ', back: '' })).toEqual({
      front: expect.any(String),
      back: expect.any(String),
    });
  });

  it('accepts a filled card and trims it', () => {
    expect(validateContent({ front: 'a', back: 'b' })).toEqual({});
    expect(toContent({ front: ' a ', back: ' b ' })).toEqual({ front: 'a', back: 'b' });
  });

  it('rejects text over the backend limit', () => {
    expect(validateContent({ front: 'x'.repeat(10001), back: 'b' }).front).toBeDefined();
  });
});

describe('hasProgress', () => {
  it('is false only for a card never reviewed', () => {
    expect(hasProgress({ state: 0, reps: 0 })).toBe(false);
    expect(hasProgress({ state: 1, reps: 1 })).toBe(true);
  });
});
