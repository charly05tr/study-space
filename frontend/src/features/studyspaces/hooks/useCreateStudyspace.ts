import { useMutation, useQueryClient } from '@tanstack/react-query';
import { studyspacesApi } from '../api/studyspaces.api';
import { studyspacesQueryKey } from './useStudyspaces';
import type { StudyspacePayload } from '../types';

export const useCreateStudyspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: StudyspacePayload) => studyspacesApi.create(payload),
    onSuccess: () => {
      // The list is paginated and cached per page; drop the whole tree so the
      // new studyspace shows up instead of appending it to a stale page 1.
      queryClient.invalidateQueries({ queryKey: studyspacesQueryKey });
    },
  });
};
