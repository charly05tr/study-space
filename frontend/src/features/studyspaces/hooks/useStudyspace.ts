import { useQuery } from '@tanstack/react-query';
import { studyspacesApi } from '../api/studyspaces.api';

/**
 * Singular key on purpose: ['studyspace', id] does not share a prefix with the
 * list key ['studyspaces'], so invalidating the list after a create does not
 * needlessly refetch every open detail.
 */
export const studyspaceQueryKey = (id: number) => ['studyspace', id] as const;

export const useStudyspace = (id: number) =>
  useQuery({
    queryKey: studyspaceQueryKey(id),
    queryFn: () => studyspacesApi.retrieve(id),
    enabled: Number.isFinite(id),
  });
