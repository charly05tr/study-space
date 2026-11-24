import { useMutation, useQueryClient } from '@tanstack/react-query';
import { studyspacesApi } from '../api/studyspaces.api';
import { studyspaceQueryKey } from './useStudyspace';
import { studyspacesQueryKey } from './useStudyspaces';

export const useDeleteStudyspace = (id: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => studyspacesApi.remove(id),
    onSuccess: () => {
      // Dropped, not invalidated: refetching the detail of a row that no longer
      // exists would just produce a 404 flash while the page navigates away.
      queryClient.removeQueries({ queryKey: studyspaceQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: studyspacesQueryKey });
    },
  });
};
