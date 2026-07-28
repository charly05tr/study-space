import { useQuery } from '@tanstack/react-query';
import { readerApi } from '../api/reader.api';

export const readerQueryKey = (sourceId: number) => ['reader', sourceId] as const;

/**
 * The reader HTML can be tens of megabytes, so this never refetches on its own:
 * it is re-read only when the route changes or the cache is invalidated.
 */
export const useReaderSource = (sourceId: number) =>
  useQuery({
    queryKey: readerQueryKey(sourceId),
    queryFn: () => readerApi.load(sourceId),
    enabled: Number.isFinite(sourceId),
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });
