import { useMutation, useQueryClient } from '@tanstack/react-query';
import { graphQueryKey } from '../../graph/hooks/useGraphLayout';
import { blockLinksApi, type CreateBlockLinkPayload } from '../api/blockLinks.api';

/**
 * Both mutations invalidate the graph payload rather than patching it by hand.
 *
 * Safe to do here precisely because the positions no longer depend on the
 * edges: the refetch redraws the relations and leaves every node exactly where
 * the user left it. See the note in useGraphLayout.
 */
export const useCreateBlockLink = (studyspaceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateBlockLinkPayload) => blockLinksApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: graphQueryKey(studyspaceId) });
    },
  });
};

/**
 * Takes ids, plural: one edge of the map can rest on several written relations.
 *
 * Invalidates on settle rather than on success — a run that removed three of
 * four links still changed the map, and leaving the stale payload in place
 * would show an edge that is no longer entirely there.
 */
export const useDeleteBlockLink = (studyspaceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: number[]) => blockLinksApi.removeAll(ids),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: graphQueryKey(studyspaceId) });
    },
  });
};
