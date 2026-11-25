import { useState } from 'react';
import { DEFAULT_NEW_LIMIT, parseNewLimit } from '../reviewSession';

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
 * `value` is always a usable number and only changes on valid input, so an
 * empty or half-typed field does not refetch the queue.
 */
export const useNewLimit = (studyspaceId: number) => {
  const [value, setValue] = useState(() => parseNewLimit(read(studyspaceId)) ?? DEFAULT_NEW_LIMIT);
  const [text, setTextState] = useState(() => String(value));

  const setText = (next: string) => {
    setTextState(next);
    const parsed = parseNewLimit(next);
    if (parsed === null) return;
    setValue(parsed);
    write(studyspaceId, String(parsed));
  };

  return { text, setText, value };
};
