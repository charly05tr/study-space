import { describe, expect, it } from 'vitest';
import {
  initSession,
  reviewConflictCard,
  parseNewLimit,
  ratingBreakdown,
  ratingForKey,
  remainingNewLimit,
  sessionProgress,
  sessionReducer,
} from './reviewSession';
import type { SessionAction, SessionState } from './reviewSession';
import type { Flashcard } from './types';

const card = (id: number, state: Flashcard['state'] = 2): Flashcard => ({
  id,
  studyspace: 1,
  question: null,
  front: `front ${id}`,
  back: `back ${id}`,
  state,
  step: null,
  stability: null,
  difficulty: null,
  due: '2026-01-01T00:00:00Z',
  last_review: null,
  reps: 0,
  lapses: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const run = (state: SessionState, ...actions: SessionAction[]): SessionState =>
  actions.reduce(sessionReducer, state);

describe('initSession', () => {
  it('starts reviewing when there are cards', () => {
    expect(initSession([card(1)]).phase).toBe('reviewing');
  });

  it('is done at once when nothing is due', () => {
    expect(initSession([]).phase).toBe('done');
  });
});

describe('sessionReducer', () => {
  it('reveals the answer once', () => {
    const state = run(initSession([card(1)]), { type: 'reveal' });
    expect(state.revealed).toBe(true);
    expect(sessionReducer(state, { type: 'reveal' })).toBe(state);
  });

  it('ignores a rating before the answer is revealed', () => {
    const state = initSession([card(1)]);
    expect(sessionReducer(state, { type: 'rated', rating: 3 })).toBe(state);
  });

  it('advances, hides the answer again and counts each rating', () => {
    const state = run(
      initSession([card(1), card(2)]),
      { type: 'reveal' },
      { type: 'rated', rating: 1 },
    );
    expect(state.queue.map((c) => c.id)).toEqual([2]);
    expect(state.revealed).toBe(false);
    expect(state.counts).toEqual({ 1: 1, 2: 0, 3: 0, 4: 0 });
    expect(state.reviewed).toBe(1);
    expect(state.phase).toBe('reviewing');
  });

  it('counts only never-reviewed cards against the new limit', () => {
    const state = run(
      initSession([card(1, 0), card(2, 2)]),
      { type: 'reveal' },
      { type: 'rated', rating: 3 },
      { type: 'reveal' },
      { type: 'rated', rating: 3 },
    );
    expect(state.newReviewed).toBe(1);
    expect(remainingNewLimit(state, 10)).toBe(9);
    expect(remainingNewLimit(state, 1)).toBe(0);
    expect(remainingNewLimit(state, 0)).toBe(0);
  });

  it('asks for a refill when the queue runs dry, then continues if cards come back', () => {
    let state = run(initSession([card(1)]), { type: 'reveal' }, { type: 'rated', rating: 1 });
    expect(state.phase).toBe('refilling');

    state = sessionReducer(state, { type: 'refilled', cards: [card(1)] });
    expect(state.phase).toBe('reviewing');
    expect(state.queue.map((c) => c.id)).toEqual([1]);
    expect(state.refilled).toBe(true);
    expect(state.revealed).toBe(false);
  });

  it('finishes when the refill is empty', () => {
    const state = run(
      initSession([card(1)]),
      { type: 'reveal' },
      { type: 'rated', rating: 3 },
      { type: 'refilled', cards: [] },
    );
    expect(state.phase).toBe('done');
    expect(state.refillFailed).toBe(false);
  });

  it('refills only once: the second exhaustion finishes the session', () => {
    const state = run(
      initSession([card(1)]),
      { type: 'reveal' },
      { type: 'rated', rating: 1 },
      { type: 'refilled', cards: [card(1)] },
      { type: 'reveal' },
      { type: 'rated', rating: 3 },
    );
    expect(state.phase).toBe('done');
    expect(state.reviewed).toBe(2);
  });

  it('finishes with a flag when the refill fails', () => {
    const state = run(
      initSession([card(1)]),
      { type: 'reveal' },
      { type: 'rated', rating: 3 },
      { type: 'refill_failed' },
    );
    expect(state.phase).toBe('done');
    expect(state.refillFailed).toBe(true);
  });

  it('ignores a refill outside the refilling phase', () => {
    const state = initSession([card(1)]);
    expect(sessionReducer(state, { type: 'refilled', cards: [card(2)] })).toBe(state);
    expect(sessionReducer(state, { type: 'refill_failed' })).toBe(state);
  });
});

describe('sessionProgress', () => {
  it('reports the position over the total', () => {
    const state = run(initSession([card(1), card(2), card(3)]), { type: 'reveal' }, { type: 'rated', rating: 3 });
    expect(sessionProgress(state)).toEqual({ position: 2, total: 3 });
  });

  it('never points past the last card', () => {
    const state = run(initSession([card(1)]), { type: 'reveal' }, { type: 'rated', rating: 3 });
    expect(sessionProgress(state)).toEqual({ position: 1, total: 1 });
  });
});

describe('helpers', () => {
  it('lists the breakdown in button order', () => {
    expect(ratingBreakdown({ 1: 1, 2: 0, 3: 4, 4: 2 })).toEqual([
      { rating: 1, count: 1 },
      { rating: 2, count: 0 },
      { rating: 3, count: 4 },
      { rating: 4, count: 2 },
    ]);
  });

  it('maps digits 1 to 4 to ratings', () => {
    expect(ratingForKey('1')).toBe(1);
    expect(ratingForKey('4')).toBe(4);
    expect(ratingForKey('5')).toBeNull();
    expect(ratingForKey('a')).toBeNull();
  });

  it('parses the new-cards limit defensively', () => {
    expect(parseNewLimit('15')).toBe(15);
    expect(parseNewLimit(' 7 ')).toBe(7);
    expect(parseNewLimit('0')).toBe(0);
    expect(parseNewLimit('9999')).toBe(200);
    expect(parseNewLimit('99999999999999999999')).toBe(200);
  });

  it('rejects anything that is not plain digits', () => {
    for (const bad of ['', '  ', null, undefined, '-3', '2.5', 'abc', '1e1', '0x10', '+5', '1 0']) {
      expect(parseNewLimit(bad)).toBeNull();
    }
  });
});

describe('already reviewed cards (409)', () => {
  const revealed = (cards: Flashcard[]) => run(initSession(cards), { type: 'reveal' });

  it('advances without counting a rating', () => {
    const state = sessionReducer(revealed([card(1), card(2)]), { type: 'already_reviewed', cardId: 1 });
    expect(state.queue.map((c) => c.id)).toEqual([2]);
    expect(state.counts).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
    expect(state.reviewed).toBe(1);
    expect(state.revealed).toBe(false);
    expect(state.phase).toBe('reviewing');
  });

  it('spends the new-cards budget when the card was new', () => {
    const state = sessionReducer(revealed([card(1, 0)]), { type: 'already_reviewed', cardId: 1 });
    expect(state.newReviewed).toBe(1);
  });

  it('refills once the queue runs out, like a normal rating', () => {
    const state = sessionReducer(revealed([card(1)]), { type: 'already_reviewed', cardId: 1 });
    expect(state.phase).toBe('refilling');
  });

  it('ignores a conflict for a card that is not on screen', () => {
    const state = revealed([card(1), card(2)]);
    expect(sessionReducer(state, { type: 'already_reviewed', cardId: 2 })).toBe(state);
  });
});

describe('reviewConflictCard', () => {
  const conflict = (status: number, data: unknown) => ({ response: { status, data } });

  it('returns the card of a 409', () => {
    const current = card(1);
    expect(reviewConflictCard(conflict(409, { detail: 'x', card: current }))).toBe(current);
  });

  it('is null for other statuses, bodies and errors', () => {
    expect(reviewConflictCard(conflict(500, { card: card(1) }))).toBeNull();
    expect(reviewConflictCard(conflict(409, { detail: 'x' }))).toBeNull();
    expect(reviewConflictCard(new Error('Network Error'))).toBeNull();
    expect(reviewConflictCard(null)).toBeNull();
  });
});
