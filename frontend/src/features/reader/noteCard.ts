/**
 * Where a note's mark sits, in parent-document viewport coordinates.
 *
 * Re-measured whenever the frame scrolls, which is what keeps the card with its
 * text instead of parked in the viewport.
 */
export interface NoteHover {
  annotationId: number;
  top: number;
  bottom: number;
  left: number;
}

export interface NoteCardState {
  /** The note being shown, or null when no card is on screen. */
  hover: NoteHover | null;
  /** Pinned cards survive the pointer leaving; only a click releases them. */
  pinned: boolean;
  /** A close is due once the grace period elapses. */
  closing: boolean;
}

export type NoteCardEvent =
  | { type: 'mark-enter'; hover: NoteHover }
  | { type: 'mark-moved'; hover: NoteHover }
  | { type: 'mark-leave' }
  | { type: 'card-enter' }
  | { type: 'card-leave' }
  | { type: 'card-click' }
  | { type: 'grace-elapsed' };

export const INITIAL_NOTE_CARD: NoteCardState = { hover: null, pinned: false, closing: false };

/** Nothing to close when no card is showing, and a pinned card never closes. */
const leaving = (state: NoteCardState): NoteCardState =>
  state.pinned ? state : { ...state, closing: state.hover !== null };

/**
 * Transitions for the hover card, kept free of timers so every rule is
 * decidable on its own. The grace period is the caller's job: it reacts to
 * `closing` and dispatches `grace-elapsed`.
 *
 * The delay is what makes the card reachable at all — the pointer has to cross
 * the gap between the mark and the card, and the mark reports its own leave the
 * moment that happens.
 */
export const noteCardReducer = (state: NoteCardState, event: NoteCardEvent): NoteCardState => {
  switch (event.type) {
    case 'mark-enter':
      return {
        hover: event.hover,
        // Moving to a different note replaces the card, so a pin held for the
        // previous one no longer means anything.
        pinned: state.hover?.annotationId === event.hover.annotationId && state.pinned,
        closing: false,
      };

    // Position only. A scroll must never revive a card that is closing, nor
    // keep one alive that the pointer already left.
    case 'mark-moved':
      return state.hover?.annotationId === event.hover.annotationId
        ? { ...state, hover: event.hover }
        : state;

    case 'mark-leave':
    case 'card-leave':
      return leaving(state);

    case 'card-enter':
      return state.closing ? { ...state, closing: false } : state;

    case 'card-click':
      return state.hover ? { ...state, pinned: !state.pinned, closing: false } : state;

    case 'grace-elapsed':
      return state.closing ? INITIAL_NOTE_CARD : state;

    default:
      return state;
  }
};
