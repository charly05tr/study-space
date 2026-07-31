/**
 * What a rename should actually send, or null when it should send nothing.
 *
 * Three cases collapse into "nothing": the field was left as it was, it was
 * only whitespace, or it was cleared. Clearing reads as "never mind" rather
 * than as a rename — `Note.title` has no `blank=True`, so the request would be
 * refused anyway, and a note with no title has nothing to be found by in the
 * sidebar or the studyspace list.
 */
export const renameTo = (draft: string, current: string): string | null => {
  const next = draft.trim();
  return !next || next === current ? null : next;
};
