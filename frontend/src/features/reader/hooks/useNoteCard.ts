import { useCallback, useEffect, useReducer } from 'react';
import {
  INITIAL_NOTE_CARD,
  noteCardReducer,
  type NoteHover,
} from '../noteCard';

/** Time the pointer gets to travel from the mark to the card before it closes. */
const GRACE_MS = 220;

/**
 * Drives the note hover card: the reducer holds every rule, this adds the one
 * thing a reducer cannot express — the grace period before a close.
 */
export const useNoteCard = () => {
  const [state, dispatch] = useReducer(noteCardReducer, INITIAL_NOTE_CARD);

  useEffect(() => {
    if (!state.closing) return;
    const timer = window.setTimeout(() => dispatch({ type: 'grace-elapsed' }), GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [state.closing]);

  const onFrameHover = useCallback(
    (hover: NoteHover | null) =>
      dispatch(hover ? { type: 'mark-enter', hover } : { type: 'mark-leave' }),
    [],
  );

  return {
    hover: state.hover,
    pinned: state.pinned,
    onFrameHover,
    onFrameMove: useCallback((hover: NoteHover) => dispatch({ type: 'mark-moved', hover }), []),
    onCardEnter: useCallback(() => dispatch({ type: 'card-enter' }), []),
    onCardLeave: useCallback(() => dispatch({ type: 'card-leave' }), []),
    onCardClick: useCallback(() => dispatch({ type: 'card-click' }), []),
  };
};
