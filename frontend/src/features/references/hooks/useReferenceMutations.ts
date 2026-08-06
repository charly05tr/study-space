import { useMutation, useQueryClient } from '@tanstack/react-query';
import { studyspaceQueryKey } from '../../studyspaces/hooks/useStudyspace';
import { referencesApi } from '../api/references.api';
import type { ReferencePayload, ReferenceUpdatePayload } from '../types';

/**
 * The bibliography is read off the studyspace detail, never off /references/,
 * so every write invalidates that one query and nothing else. A second cache
 * keyed by studyspace would be the same list under a different name — and the
 * two would disagree the moment one of them refetched.
 */
export const useCreateReference = (studyspaceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ReferencePayload) => referencesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studyspaceQueryKey(studyspaceId) });
    },
  });
};

interface UpdateReferenceVariables {
  id: number;
  payload: ReferenceUpdatePayload;
}

export const useUpdateReference = (studyspaceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: UpdateReferenceVariables) => referencesApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studyspaceQueryKey(studyspaceId) });
    },
  });
};

export const useDeleteReference = (studyspaceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => referencesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studyspaceQueryKey(studyspaceId) });
    },
  });
};
