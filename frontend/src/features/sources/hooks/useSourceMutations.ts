import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcesApi } from '../api/sources.api';
import { studyspaceQueryKey } from '../../studyspaces/hooks/useStudyspace';
import { readerQueryKey } from '../../reader/hooks/useReaderSource';
import type { CreateSourcePayload } from '../types';

export const useCreateSource = (studyspaceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateSourcePayload) => sourcesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: studyspaceQueryKey(studyspaceId) });
    },
  });
};

export const useConvertSource = (studyspaceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sourceId: number) => sourcesApi.convert(sourceId),
    onSuccess: (_result, sourceId) => {
      // is_converted travels inside the studyspace detail payload.
      queryClient.invalidateQueries({ queryKey: studyspaceQueryKey(studyspaceId) });
      // Any cached reader HTML for this source is the previous conversion now.
      queryClient.removeQueries({ queryKey: readerQueryKey(sourceId) });
    },
  });
};
