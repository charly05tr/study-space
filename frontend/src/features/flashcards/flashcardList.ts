import { formatDate } from '../../lib/formatDate';
import { MAX_FLASHCARD_TEXT } from './types';
import type { Flashcard, FlashcardContent, FlashcardState } from './types';

export type StateFilter = FlashcardState | 'all';

/** Case-insensitive match on either side of the card, narrowed by state. */
export const filterFlashcards = (
  cards: readonly Flashcard[],
  search: string,
  state: StateFilter,
): Flashcard[] => {
  const needle = search.trim().toLowerCase();
  return cards.filter((card) => {
    if (state !== 'all' && card.state !== state) return false;
    if (!needle) return true;
    return card.front.toLowerCase().includes(needle) || card.back.toLowerCase().includes(needle);
  });
};

/** When the card comes up next, in words. `now` is injected to keep it testable. */
export const dueLabel = (card: Pick<Flashcard, 'state' | 'due'>, now: Date): string => {
  if (card.state === 0) return 'New';
  const due = new Date(card.due);
  if (Number.isNaN(due.getTime()) || due <= now) return 'Due now';
  return `Due ${formatDate(card.due) ?? 'later'}`;
};

export interface ContentErrors {
  front?: string;
  back?: string;
}

export const validateContent = (content: FlashcardContent): ContentErrors => {
  const errors: ContentErrors = {};
  const front = content.front.trim();
  const back = content.back.trim();

  if (!front) errors.front = 'Write the front of the card.';
  else if (front.length > MAX_FLASHCARD_TEXT) {
    errors.front = `Keep the front under ${MAX_FLASHCARD_TEXT} characters.`;
  }

  if (!back) errors.back = 'Write the back of the card.';
  else if (back.length > MAX_FLASHCARD_TEXT) {
    errors.back = `Keep the back under ${MAX_FLASHCARD_TEXT} characters.`;
  }
  return errors;
};

export const toContent = (content: FlashcardContent): FlashcardContent => ({
  front: content.front.trim(),
  back: content.back.trim(),
});

/** True when the card has any progress worth confirming before it is cleared. */
export const hasProgress = (card: Pick<Flashcard, 'state' | 'reps'>): boolean =>
  card.state !== 0 || card.reps > 0;
