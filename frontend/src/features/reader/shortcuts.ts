/**
 * What a single key does in the reader.
 *
 * Single letters, no modifiers. The reader is the one screen in the app where
 * the keyboard is free — there is nothing to type into, so the plain keys are
 * available and a chord would only be ceremony.
 */
export type ReaderAction =
  | 'togglePomodoro'
  | 'toggleFocus'
  | 'toggleTheme'
  | 'largerText'
  | 'smallerText'
  | 'toggleNotes';

/**
 * The action a keypress asks for, or null when the key means nothing here.
 *
 * A pure lookup rather than a chain of ifs inside the page, so the awkward parts
 * — the two ways to type a plus, the one key that is inert in focus mode — can
 * be pinned down by a test instead of by reading a component.
 *
 * @param pressed `KeyboardEvent.key`, as it arrives.
 * @param focused Whether the reader is in focus mode.
 */
export const actionForKey = (pressed: string, focused: boolean): ReaderAction | null => {
  // Shift+N and n are the same request, and so is either with caps lock on.
  switch (pressed.toLowerCase()) {
    case 'p':
      return 'togglePomodoro';
    case 'f':
      return 'toggleFocus';
    case 't':
      return 'toggleTheme';
    // '=' as well: on most layouts the plus is Shift+=, and reaching for a
    // modifier to make the text bigger is a tax on nothing. '_' for symmetry.
    case '+':
    case '=':
      return 'largerText';
    case '-':
    case '_':
      return 'smallerText';
    case 'n':
      // Inert in focus mode, because focus mode has no panel — entering it
      // closes the one you had. Toggling a hidden preference from in there
      // would be a key that appears broken until you leave.
      return focused ? null : 'toggleNotes';
    default:
      return null;
  }
};
