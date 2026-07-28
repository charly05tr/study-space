import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { annotationsApi } from '../api/annotations.api';
import type { CreateAnnotationPayload } from '../types';

export const annotationsQueryKey = (sourceId: number) => ['annotations', sourceId] as const;

export const useAnnotations = (sourceId: number) =>
  useQuery({
    queryKey: annotationsQueryKey(sourceId),
    queryFn: () => annotationsApi.listBySource(sourceId),
    enabled: Number.isFinite(sourceId),
  });

export const useCreateAnnotation = (sourceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateAnnotationPayload) => annotationsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: annotationsQueryKey(sourceId) });
    },
  });
};

export const useDeleteAnnotation = (sourceId: number) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => annotationsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: annotationsQueryKey(sourceId) });
    },
  });
};
