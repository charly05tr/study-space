import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcesApi } from '../api/sources.api';
import { annotationsQueryKey } from '../../annotations/hooks/useAnnotations';
import { studyspaceQueryKey } from '../../studyspaces/hooks/useStudyspace';
import { readerQueryKey } from '../../reader/hooks/useReaderSource';
import type { ConvertPayload, CreateSourcePayload } from '../types';

export const useCreateSource = (studyspaceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateSourcePayload) => sourcesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studyspaceQueryKey(studyspaceId) });
    },
  });
};

interface RenameSourceVariables {
  sourceId: number;
  title: string;
}

export const useRenameSource = (studyspaceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sourceId, title }: RenameSourceVariables) =>
      sourcesApi.rename(sourceId, title),
    onSuccess: (_result, { sourceId }) => {
      queryClient.invalidateQueries({ queryKey: studyspaceQueryKey(studyspaceId) });
      // The reader payload carries the title too, and it is cached for the life
      // of the tab because the HTML inside it is huge.
      queryClient.removeQueries({ queryKey: readerQueryKey(sourceId) });
    },
  });
};

export const useDeleteSource = (studyspaceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sourceId: number) => sourcesApi.remove(sourceId),
    onSuccess: (_result, sourceId) => {
      queryClient.invalidateQueries({ queryKey: studyspaceQueryKey(studyspaceId) });
      // Both are about a source that no longer exists. Removed and not
      // invalidated: refetching either one would just be a 404.
      queryClient.removeQueries({ queryKey: readerQueryKey(sourceId) });
      queryClient.removeQueries({ queryKey: annotationsQueryKey(sourceId) });
    },
  });
};

export const useConvertSource = (studyspaceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ConvertPayload) => sourcesApi.convert(payload),
    onSuccess: (_result, { sourceId }) => {
      // is_converted and converter_mode travel inside the studyspace detail payload.
      queryClient.invalidateQueries({ queryKey: studyspaceQueryKey(studyspaceId) });
      // Any cached reader HTML for this source is the previous conversion now.
      queryClient.removeQueries({ queryKey: readerQueryKey(sourceId) });
    },
  });
};
