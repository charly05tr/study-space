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
    },
  });
};
