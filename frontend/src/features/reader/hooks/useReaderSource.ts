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

export const readingPositionQueryKey = (sourceId: number) =>
  ['reader', sourceId, 'position'] as const;

/**
 * Where to resume from — deliberately a separate query.
 *
 * It used to be read off the reader payload, which is cached with
 * `staleTime: Infinity` so a book is never downloaded twice. The bookmark was
 * along for that ride: scroll, leave, come back inside the gc window, and the
 * reader restored the position from the cached payload instead of the one it
 * had just saved. A document and the place you stopped reading it do not share
 * a lifetime, so they cannot share a cache entry.
 */
export const useReadingPosition = (sourceId: number) =>
  useQuery({
    queryKey: readingPositionQueryKey(sourceId),
    queryFn: () => readerApi.readingPosition(sourceId),
    enabled: Number.isFinite(sourceId),
    // The opposite of the payload above: always re-read on open.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
