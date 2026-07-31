import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { annotationsApi } from '../api/annotations.api';
import type { Annotation, CreateAnnotationPayload } from '../types';

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

/**
 * Drops the annotation from the cache before the server has answered.
 *
 * The reader paints its highlights from this list, so waiting for the round
 * trip meant the shading stayed on the text after the annotation was gone from
 * every other part of the screen — two requests' worth of a highlight that no
 * longer exists, which reads as the delete having failed.
 *
 * Optimistic rather than a faster refetch because the delete is the user's
 * decision, not a guess: the only thing that can undo it is the server refusing
 * it, and that is what the rollback is for.
 */
export const useDeleteAnnotation = (sourceId: number) => {
  const queryClient = useQueryClient();
  const key = annotationsQueryKey(sourceId);

  return useMutation({
    mutationFn: (id: number) => annotationsApi.remove(id),

    onMutate: async (id: number) => {
      // A refetch already in flight would land after this and put the
      // annotation back, so it has to be called off first.
      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<Annotation[]>(key);
      queryClient.setQueryData<Annotation[]>(key, (current) =>
        (current ?? []).filter((annotation) => annotation.id !== id),
      );
      return { previous };
    },

    onError: (_error, _id, context) => {
      // Put it back exactly as it was: the highlight returning IS the error
      // message, before the notification even arrives.
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },

    // On both paths: the optimistic list is a guess about one annotation, and
    // the server is what decides what the source actually holds.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
};
