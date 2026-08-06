import { useMutation, useQueryClient } from '@tanstack/react-query';
import { studyspacesApi } from '../api/studyspaces.api';
import { studyspaceQueryKey } from './useStudyspace';
import { studyspacesQueryKey } from './useStudyspaces';
import type { StudyspaceUpdatePayload } from '../types';

export const useUpdateStudyspace = (id: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: StudyspaceUpdatePayload) => studyspacesApi.update(id, payload),
    onSuccess: (studyspace) => {
      // The PATCH answers the full detail, so the cache can be written straight
      // from it. Invalidating instead would blank the page it is rendering.
      queryClient.setQueryData(studyspaceQueryKey(id), studyspace);
      // The title and the tags also show on the paginated list, which is cached
      // per page and cannot be patched in place.
      queryClient.invalidateQueries({ queryKey: studyspacesQueryKey });
    },
  });
};
