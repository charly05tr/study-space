import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { blocksApi } from '../api/blocks.api';
import { promotableQueryKey } from './useBlockVisibility';

/**
 * Blocks that could become a concept and are not one yet.
 *
 * The complement of the map: what got absorbed into a larger idea, and what
 * hangs under no heading at all. It exists so that promoting is a visible move
 * rather than a hidden one — a note written with no structure declares no
 * concepts, and without a list to look through it would have no way in.
 */
export const usePromotableBlocks = (studyspaceId: number, query: string, enabled: boolean) =>
  useQuery({
    queryKey: [...promotableQueryKey(studyspaceId), query.trim()] as const,
    queryFn: () => blocksApi.promotable(studyspaceId, query.trim()),
    // Only fetched once the panel is actually open: on a large studyspace this
    // is the longer of the two lists, and nothing shows it by default.
    enabled: enabled && Number.isFinite(studyspaceId),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
