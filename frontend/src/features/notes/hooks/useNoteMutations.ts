import { useMutation, useQueryClient } from '@tanstack/react-query';
import { studyspaceQueryKey } from '../../studyspaces/hooks/useStudyspace';
import { notesApi } from '../api/notes.api';
import type { CreateNotePayload } from '../types';

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
