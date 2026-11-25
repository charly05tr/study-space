import { useState } from 'react';
import { parseNewLimit } from '../reviewSession';

const storageKey = (studyspaceId: number) => `studyspace:${studyspaceId}:flashcards:newLimit`;

const read = (studyspaceId: number): string | null => {
  try {
    return window.localStorage.getItem(storageKey(studyspaceId));
  } catch {
    return null;
  }
};

const write = (studyspaceId: number, value: string) => {
  try {
    window.localStorage.setItem(storageKey(studyspaceId), value);
  } catch {
    // Storage can be blocked: the setting then only lasts for this visit.
  }
};

/**
 * How many never-reviewed cards a session admits, remembered per studyspace.
 *
 * `text` is what the field shows, so it can be empty while the user retypes;
 * `value` is always a usable number.
 */
export const useNewLimit = (studyspaceId: number) => {
  const [text, setTextState] = useState(() => String(parseNewLimit(read(studyspaceId))));

  const setText = (next: string) => {
    setTextState(next);
    write(studyspaceId, String(parseNewLimit(next)));
  };

  return { text, setText, value: parseNewLimit(text) };
};
