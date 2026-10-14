import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { notesApi } from '../api/notes.api';
import type { NoteDetail, NoteDocument, SaveStatus } from '../types';
import { noteQueryKey } from './useNote';

const DEBOUNCE_MS = 1000;

interface UseNoteAutosaveOptions {
  /** Override the persistence call. Only meant for tests and stories. */
  save?: (content: NoteDocument) => Promise<unknown>;
  delayMs?: number;
}

/**
 * Debounced persistence for a note body.
 *
 * Deliberately not a react-query mutation: this fires on every keystroke, so
 * the cache invalidation and retry machinery would work against it. What it
 * does need — and what a plain mutation would not give — is an explicit status
 * the UI can show, and a last-write-wins guard so a slow request cannot
 * overwrite a newer one.
 */
export const useNoteAutosave = (noteId: number, options: UseNoteAutosaveOptions = {}) => {
  const { save, delayMs = DEBOUNCE_MS } = options;

  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SaveStatus>('saved');

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<NoteDocument | null>(null);
  /** Serialized form of what the server is known to hold, to skip no-op saves. */
  const lastSaved = useRef<string | null>(null);
  /** Monotonic request id: only the newest response may set the status. */
  const latestRequest = useRef(0);
  const mounted = useRef(true);

  // Read through a ref so a caller passing an inline `save` does not rebuild the
  // debounce — and, further up, does not force the editor instance to remount.
  // Synced in an effect, not during render: a render can be thrown away, and a
  // ref written by a discarded render would survive it.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  const flush = useCallback(() => {
    const document = pending.current;
    if (document === null) return;

    // Serializing here rather than on every keystroke: the comparison is only
    // needed once per debounce window, not once per character.
    const serialized = JSON.stringify(document);
    pending.current = null;

    if (serialized === lastSaved.current) {
      if (mounted.current) setStatus('saved');
      return;
    }

    const requestId = ++latestRequest.current;
    if (mounted.current) setStatus('saving');

    const persist = saveRef.current
      ? saveRef.current(document)
      : notesApi.update(noteId, { content: document });

    persist
      .then(() => {
        // A stale response must not report success: a newer edit is already in
        // flight and owns the status.
        if (requestId !== latestRequest.current) return;
        lastSaved.current = serialized;
        // `useNote` is pinned with `staleTime: Infinity`, so the cache is the
        // only copy a remount reads. Without this, reopening the note would
        // hand the editor the body it was loaded with, not what was saved.
        // After the stale guard, so an older response cannot overwrite it.
        queryClient.setQueryData<NoteDetail>(noteQueryKey(noteId), (current) =>
          current ? { ...current, content: document } : current,
        );
        if (mounted.current) setStatus('saved');
      })
      .catch(() => {
        if (requestId !== latestRequest.current) return;
        // Put the document back so the next keystroke retries it instead of
        // silently dropping the user's work.
        pending.current = document;
        if (mounted.current) setStatus('error');
      });
  }, [noteId, queryClient]);

  const scheduleSave = useCallback(
    (document: NoteDocument) => {
      pending.current = document;
      setStatus('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delayMs);
    },
    [flush, delayMs],
  );

  /** Persist immediately, skipping the debounce. Used when leaving the note. */
  const saveNow = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    flush();
  }, [flush]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      // Navigating away is exactly when the last edit matters most, so the
      // in-flight write is fired even though nothing is left to render it.
      flush();
    };
  }, [flush]);

  // A closed tab cannot retry. The browser only honours this while there is
  // genuinely unsaved work, so it is registered conditionally.
  useEffect(() => {
    if (status === 'saved') return;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  return { status, scheduleSave, saveNow };
};
