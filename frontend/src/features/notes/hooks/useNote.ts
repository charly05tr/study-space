import { useQuery } from '@tanstack/react-query';
import { notesApi } from '../api/notes.api';

/** Singular key, mirroring studyspaceQueryKey — see the note there on prefixes. */
export const noteQueryKey = (id: number) => ['note', id] as const;

export const useNote = (id: number) =>
  useQuery({
    queryKey: noteQueryKey(id),
    queryFn: () => notesApi.get(id),
    enabled: Number.isFinite(id),
    /**
     * The editor owns the document once it is mounted, and autosave already
     * pushes every change. A background refetch would hand a stale server copy
     * back to a user who is still typing.
     */
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
