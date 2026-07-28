import { useInfiniteQuery } from '@tanstack/react-query';
import { studyspacesApi } from '../api/studyspaces.api';

export const studyspacesQueryKey = ['studyspaces'] as const;

/**
 * The endpoint is paginated at 10 items, so a single fetch silently hides the
 * rest. `next` being non-null is the only reliable signal that more exist.
 */
export const useStudyspaces = () =>
  useInfiniteQuery({
    queryKey: studyspacesQueryKey,
    queryFn: ({ pageParam }) => studyspacesApi.list(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.next ? allPages.length + 1 : undefined,
  });
