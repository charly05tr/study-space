import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { blocksApi } from '../api/blocks.api';

export const blockSearchQueryKey = (studyspaceId: number, query: string) =>
  ['blocks', studyspaceId, query] as const;

/**
 * Blocks matching what has been typed after `[[`.
 *
 * `keepPreviousData` is what makes this feel like a filter rather than a
 * request: without it the list empties on every keystroke and the menu flickers
 * between results and "nothing found".
 */
export const useBlockSearch = (studyspaceId: number | null, query: string) =>
  useQuery({
    queryKey: blockSearchQueryKey(studyspaceId ?? Number.NaN, query.trim()),
    queryFn: () => blocksApi.search(studyspaceId as number, query.trim()),
    enabled: studyspaceId !== null && Number.isFinite(studyspaceId),
    placeholderData: keepPreviousData,
    // The corpus only changes when a note is saved, which is not mid-search.
    staleTime: 30_000,
  });
