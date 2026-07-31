import { useMutation, useQueryClient } from '@tanstack/react-query';
import { graphQueryKey } from '../../graph/hooks/useGraphLayout';
import { blocksApi } from '../api/blocks.api';

/**
 * Takes a block off the map without touching the note it lives in.
 *
 * Deleting the row would not work: blocks are a projection of Note.content, so
 * the next autosave would recreate it and the action would quietly undo itself.
 */
export const useSetBlockExcluded = (studyspaceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ blockId, excluded }: { blockId: string; excluded: boolean }) =>
      blocksApi.setExcluded(blockId, excluded),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: graphQueryKey(studyspaceId) });
      queryClient.invalidateQueries({ queryKey: promotableQueryKey(studyspaceId) });
    },
  });
};

export const promotableQueryKey = (studyspaceId: number) =>
  ['blocks', 'promotable', studyspaceId] as const;

/**
 * Raises a block to a concept of its own, or lets it fall back into one.
 *
 * Invalidates both lists because the two are complements: every block promoted
 * onto the map is one that leaves the candidate list, and showing it in both
 * would make the map look like it had not registered the click.
 */
export const useSetBlockPromoted = (studyspaceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ blockId, promoted }: { blockId: string; promoted: boolean }) =>
      blocksApi.setPromoted(blockId, promoted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: graphQueryKey(studyspaceId) });
      queryClient.invalidateQueries({ queryKey: promotableQueryKey(studyspaceId) });
    },
  });
};
