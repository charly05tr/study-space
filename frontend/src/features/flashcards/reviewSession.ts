import { RATINGS } from './types';
import type { Flashcard, Rating } from './types';

/** Never-reviewed cards the review queue admits per session. */
export const DEFAULT_NEW_LIMIT = 10;

/** Upper bound of the new-cards control: well under the server's queue ceiling. */
export const MAX_NEW_LIMIT = 200;

/**
 * Reads the new-cards-per-session setting from free text or storage. Only plain
 * decimal digits count ("1e1", "0x10", "-3", "2.5" do not); large values are
 * capped. Returns null for anything else, so the caller decides what to keep.
 */
export const parseNewLimit = (raw: string | null | undefined): number | null => {
  const text = raw?.trim() ?? '';
  if (!/^\d+$/.test(text)) return null;
  return Math.min(Number(text), MAX_NEW_LIMIT);
};

/** What a 409 from the review endpoint carries: the card as the server has it. */
export const reviewConflictCard = (error: unknown): Flashcard | null => {
  if (typeof error !== 'object' || error === null || !('response' in error)) return null;
  const response = (error as { response?: { status?: number; data?: { card?: Flashcard } } })
    .response;
  return response?.status === 409 && response.data?.card ? response.data.card : null;
};

/**
 * `reviewing`: a card is on screen. `refilling`: the queue ran dry and the server
 * is asked once more (an Again card may be due again by now). `done`: summary.
 */
export type SessionPhase = 'reviewing' | 'refilling' | 'done';

export type RatingCounts = Record<Rating, number>;

export interface SessionState {
  /** Cards still to go; the head is the one on screen. */
  queue: Flashcard[];
  revealed: boolean;
  counts: RatingCounts;
  reviewed: number;
  /** Never-reviewed cards rated so far: they count against the new-cards limit. */
  newReviewed: number;
  /** Whether the one allowed refetch of the queue has been spent. */
  refilled: boolean;
  /** The refetch failed, so the summary may be missing cards. */
  refillFailed: boolean;
  phase: SessionPhase;
}

export type SessionAction =
  | { type: 'reveal' }
  | { type: 'rated'; rating: Rating }
  /** The server had already reviewed the card on screen: move on without counting a rating. */
  | { type: 'already_reviewed'; cardId: number }
  | { type: 'refilled'; cards: Flashcard[] }
  | { type: 'refill_failed' };

const emptyCounts = (): RatingCounts => ({ 1: 0, 2: 0, 3: 0, 4: 0 });

export const initSession = (cards: readonly Flashcard[]): SessionState => ({
  queue: [...cards],
  revealed: false,
  counts: emptyCounts(),
  reviewed: 0,
  newReviewed: 0,
  refilled: false,
  refillFailed: false,
  phase: cards.length > 0 ? 'reviewing' : 'done',
});

export const sessionReducer = (state: SessionState, action: SessionAction): SessionState => {
  switch (action.type) {
    case 'reveal':
      return state.phase === 'reviewing' && !state.revealed ? { ...state, revealed: true } : state;

    case 'rated': {
      // A rating only counts for a card whose answer has been seen.
      if (state.phase !== 'reviewing' || !state.revealed || state.queue.length === 0) return state;

      const [card, ...queue] = state.queue;
      return {
        ...state,
        queue,
        revealed: false,
        counts: { ...state.counts, [action.rating]: state.counts[action.rating] + 1 },
        reviewed: state.reviewed + 1,
        newReviewed: state.newReviewed + (card.state === 0 ? 1 : 0),
        phase: queue.length > 0 ? 'reviewing' : state.refilled ? 'done' : 'refilling',
      };
    }

    case 'already_reviewed': {
      if (state.phase !== 'reviewing' || state.queue[0]?.id !== action.cardId) return state;

      const [card, ...queue] = state.queue;
      return {
        ...state,
        queue,
        revealed: false,
        reviewed: state.reviewed + 1,
        newReviewed: state.newReviewed + (card.state === 0 ? 1 : 0),
        phase: queue.length > 0 ? 'reviewing' : state.refilled ? 'done' : 'refilling',
      };
    }

    case 'refilled':
      if (state.phase !== 'refilling') return state;
      return action.cards.length > 0
        ? { ...state, queue: [...action.cards], revealed: false, refilled: true, phase: 'reviewing' }
        : { ...state, refilled: true, phase: 'done' };

    case 'refill_failed':
      return state.phase === 'refilling'
        ? { ...state, refilled: true, refillFailed: true, phase: 'done' }
        : state;
  }
};

/** New cards the refetch may still admit, given what this session already used. */
export const remainingNewLimit = (state: SessionState, newLimit: number): number =>
  Math.max(0, newLimit - state.newReviewed);

export interface SessionProgress {
  /** 1-based position of the card on screen. */
  position: number;
  /** Cards rated plus cards still queued. */
  total: number;
}

export const sessionProgress = (state: SessionState): SessionProgress => ({
  position: Math.min(state.reviewed + 1, state.reviewed + state.queue.length),
  total: state.reviewed + state.queue.length,
});

/** The rating breakdown as rows, in button order. */
export const ratingBreakdown = (counts: RatingCounts): { rating: Rating; count: number }[] =>
  RATINGS.map((rating) => ({ rating, count: counts[rating] }));

/** Maps a keyboard key to a rating: the digits 1 to 4. */
export const ratingForKey = (key: string): Rating | null =>
  key === '1' ? 1 : key === '2' ? 2 : key === '3' ? 3 : key === '4' ? 4 : null;
