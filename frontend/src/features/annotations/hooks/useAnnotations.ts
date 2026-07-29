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

/** Distinct prefix from annotationsQueryKey: this set spans sources. */
export const studyspaceAnnotationsQueryKey = (studyspaceId: number) =>
  ['annotations', 'studyspace', studyspaceId] as const;

export const useStudyspaceAnnotations = (studyspaceId: number) =>
  useQuery({
    queryKey: studyspaceAnnotationsQueryKey(studyspaceId),
    queryFn: () => annotationsApi.listByStudyspace(studyspaceId),
    enabled: Number.isFinite(studyspaceId),
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
