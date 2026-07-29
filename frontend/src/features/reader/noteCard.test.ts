import { describe, expect, it } from 'vitest';
import {
  INITIAL_NOTE_CARD,
  noteCardReducer,
  type NoteCardEvent,
  type NoteCardState,
} from './noteCard';

const hoverOn = (annotationId: number, top = 100) => ({
  annotationId,
  top,
  bottom: top + 20,
  left: 50,
});

/** Applies a sequence starting from an empty card. */
const run = (...events: NoteCardEvent[]): NoteCardState =>
  events.reduce(noteCardReducer, INITIAL_NOTE_CARD);

const shown = (annotationId: number): NoteCardEvent => ({
  type: 'mark-enter',
  hover: hoverOn(annotationId),
});

describe('noteCardReducer', () => {
  it('shows the card for the mark under the pointer', () => {
    const state = run(shown(1));

    expect(state.hover).toEqual(hoverOn(1));
    expect(state.pinned).toBe(false);
    expect(state.closing).toBe(false);
  });

  it('closes only after the grace period, not on leaving the mark', () => {
    const leaving = run(shown(1), { type: 'mark-leave' });
    expect(leaving.hover).toEqual(hoverOn(1));
    expect(leaving.closing).toBe(true);

    expect(run(shown(1), { type: 'mark-leave' }, { type: 'grace-elapsed' })).toEqual(
      INITIAL_NOTE_CARD,
    );
  });

  it('keeps the card open when the pointer reaches it', () => {
    const state = run(shown(1), { type: 'mark-leave' }, { type: 'card-enter' });

    expect(state.closing).toBe(false);
    // The grace period fires anyway; a cancelled close must ignore it.
    expect(noteCardReducer(state, { type: 'grace-elapsed' })).toEqual(state);
  });

  it('survives leaving once pinned', () => {
    const pinned = run(shown(1), { type: 'card-click' });
    expect(pinned.pinned).toBe(true);

    const afterLeaving = run(
      shown(1),
      { type: 'card-click' },
      { type: 'card-leave' },
      { type: 'mark-leave' },
      { type: 'grace-elapsed' },
    );

    expect(afterLeaving.hover).toEqual(hoverOn(1));
    expect(afterLeaving.closing).toBe(false);
  });

  it('closes again after a second click releases the pin', () => {
    const state = run(
      shown(1),
      { type: 'card-click' },
      { type: 'card-click' },
      { type: 'card-leave' },
    );

    expect(state.pinned).toBe(false);
    expect(state.closing).toBe(true);
    expect(noteCardReducer(state, { type: 'grace-elapsed' })).toEqual(INITIAL_NOTE_CARD);
  });

  it('drops the pin when another note takes the card', () => {
    const state = run(shown(1), { type: 'card-click' }, shown(2));

    expect(state.hover).toEqual(hoverOn(2));
    expect(state.pinned).toBe(false);
  });

  it('keeps the pin when the same note is hovered again', () => {
    const state = run(shown(1), { type: 'card-click' }, { type: 'mark-leave' }, shown(1));

    expect(state.pinned).toBe(true);
    expect(state.closing).toBe(false);
  });

  it('follows its mark when the document scrolls under it', () => {
    const state = run(shown(1), { type: 'card-click' }, { type: 'mark-leave' }, {
      type: 'mark-moved',
      hover: hoverOn(1, 40),
    });

    expect(state.hover).toEqual(hoverOn(1, 40));
    expect(state.pinned).toBe(true);
  });

  it('does not let a scroll revive a card that is closing', () => {
    const state = run(shown(1), { type: 'mark-leave' }, {
      type: 'mark-moved',
      hover: hoverOn(1, 40),
    });

    expect(state.closing).toBe(true);
    expect(noteCardReducer(state, { type: 'grace-elapsed' })).toEqual(INITIAL_NOTE_CARD);
  });

  it('ignores a move reported for another note', () => {
    const state = run(shown(1), { type: 'mark-moved', hover: hoverOn(2, 40) });

    expect(state.hover).toEqual(hoverOn(1));
  });

  it('ignores events that need a card on screen', () => {
    expect(run({ type: 'mark-leave' })).toEqual(INITIAL_NOTE_CARD);
    expect(run({ type: 'card-click' })).toEqual(INITIAL_NOTE_CARD);
    expect(run({ type: 'card-enter' })).toEqual(INITIAL_NOTE_CARD);
  });
});
