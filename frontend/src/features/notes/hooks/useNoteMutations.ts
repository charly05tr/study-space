import { useMutation, useQueryClient } from '@tanstack/react-query';
import { studyspaceQueryKey } from '../../studyspaces/hooks/useStudyspace';
import { notesApi } from '../api/notes.api';
import { noteQueryKey } from './useNote';
import type { CreateNotePayload, NoteDetail } from '../types';

export const useCreateNote = (studyspaceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateNotePayload) => notesApi.create(payload),
    onSuccess: () => {
      // The note list travels inside the studyspace detail payload, same as
      // sources — there is no separate notes query to refresh.
      queryClient.invalidateQueries({ queryKey: studyspaceQueryKey(studyspaceId) });
    },
  });
};

/**
 * Renames a note.
 *
 * A PATCH carrying only `title`, never the body: `NoteUpdateSerializer` owns
 * both, and a rename that also sent a document would race the autosave and
 * could put back a copy of the note from before the last keystroke.
 */
export const useRenameNote = (noteId: number, studyspaceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (title: string) => notesApi.update(noteId, { title }),
    onSuccess: (note) => {
      // Written from the response rather than invalidated: `useNote` is pinned
      // with `staleTime: Infinity` because the editor owns the document, so a
      // refetch is both unavailable and unwanted. Only the title moved.
      queryClient.setQueryData<NoteDetail>(noteQueryKey(noteId), (current) =>
        current ? { ...current, title: note.title } : current,
      );
      // The title also appears in the studyspace's note list and in the
      // sidebar, and both read from this one payload.
      queryClient.invalidateQueries({ queryKey: studyspaceQueryKey(studyspaceId) });
    },
  });
};
