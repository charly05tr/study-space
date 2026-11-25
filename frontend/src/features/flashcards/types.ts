/** 0 new, 1 learning, 2 review, 3 relearning: the FSRS card states the server reports. */
export type FlashcardState = 0 | 1 | 2 | 3;

/** 1 again, 2 hard, 3 good, 4 easy. */
export type Rating = 1 | 2 | 3 | 4;

export const RATINGS: readonly Rating[] = [1, 2, 3, 4];

export const RATING_LABELS: Record<Rating, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

export const STATE_LABELS: Record<FlashcardState, string> = {
  0: 'New',
  1: 'Learning',
  2: 'Review',
  3: 'Relearning',
};

/** Mirrors the backend limit so a form can refuse what the API would. */
export const MAX_FLASHCARD_TEXT = 10000;

export interface Flashcard {
  id: number;
  studyspace: number;
  /** The question it was copied from; null for a manual card or once that question is gone. */
  question: number | null;
  front: string;
  back: string;
  state: FlashcardState;
  step: number | null;
  stability: number | null;
  difficulty: number | null;
  /** ISO datetime; a new card is due now. */
  due: string;
  last_review: string | null;
  reps: number;
  lapses: number;
  created_at: string;
  updated_at: string;
}

/** The only fields a flashcard lets the client write. */
export interface FlashcardContent {
  front: string;
  back: string;
}

export interface CreateFlashcardPayload extends FlashcardContent {
  studyspace: number;
}

export interface FlashcardFilters {
  question?: number;
  state?: FlashcardState;
  due?: boolean;
}

export interface DueFilters {
  /** Caps the never-reviewed cards in the queue. */
  newLimit?: number;
  limit?: number;
}

/** Counts for one studyspace; spaces without cards are absent from the response. */
export interface FlashcardStats {
  studyspace: number;
  total: number;
  /** Never reviewed. */
  new: number;
  /** Reviewed before, and overdue now. New cards are not counted here. */
  due: number;
}

/** What a review request came back with. */
export interface ReviewOutcome {
  /** The card as the server has it now. */
  card: Flashcard;
  /** The server had already reviewed this card (409): this request changed nothing. */
  alreadyReviewed: boolean;
}

export interface ConversionResult {
  created: Flashcard[];
  /** Questions that already had a flashcard. */
  skipped: number[];
  /** Questions of a draft quiz. */
  not_published: number[];
  not_found: number[];
}
