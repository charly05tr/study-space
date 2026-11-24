import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { notesApi } from '../api/notes.api';
import type { NoteDrawing } from '../drawing';
import type { NoteDetail, SaveStatus } from '../types';
import { noteQueryKey } from './useNote';

const DEBOUNCE_MS = 1500;

/**
 * Debounced persistence for the drawing layer.
 *
 * A sibling of useNoteAutosave rather than a shared hook: the two write
 * different fields, and each PATCH carries only its own. That is what lets a
 * drawing save and a text save be in flight together without one overwriting
 * the other. It is called once per finished stroke, never per pointer move.
 */
export const useNoteDrawingAutosave = (noteId: number) => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SaveStatus>('saved');

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<NoteDrawing | null>(null);
  const latestRequest = useRef(0);
  const mounted = useRef(true);

  const flush = useCallback(() => {
    const drawing = pending.current;
    if (drawing === null) return;
    pending.current = null;

    const requestId = ++latestRequest.current;
    if (mounted.current) setStatus('saving');

    notesApi
      .update(noteId, { drawing })
      .then(() => {
        if (requestId !== latestRequest.current) return;
        // The query is pinned with staleTime Infinity, so this cache entry is
        // what a remount reads. A functional update keeps `content` as the text
        // autosave last wrote it.
        queryClient.setQueryData<NoteDetail>(noteQueryKey(noteId), (current) =>
          current ? { ...current, drawing } : current,
        );
        if (mounted.current) setStatus('saved');
      })
      .catch(() => {
        if (requestId !== latestRequest.current) return;
        // Keep it for the next stroke to retry, unless a newer one replaced it.
        pending.current ??= drawing;
        if (mounted.current) setStatus('error');
      });
  }, [noteId, queryClient]);

  const scheduleSave = useCallback(
    (drawing: NoteDrawing) => {
      pending.current = drawing;
      setStatus('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      // Leaving the note right after drawing must not lose the last stroke.
      flush();
    };
  }, [flush]);

  useEffect(() => {
    if (status === 'saved') return;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  return { status, scheduleSave };
};
