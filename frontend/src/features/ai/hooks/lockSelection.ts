/**
 * Stops text selection while a drag is in progress, so dragging across the note
 * does not select it. Returns the function that restores the previous value.
 */
export const lockSelection = (): (() => void) => {
  const previous = document.body.style.userSelect;
  document.body.style.userSelect = 'none';
  return () => {
    document.body.style.userSelect = previous;
  };
};
