import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { noteReviewsApi } from '../api/noteReviews.api';
import type { SaveWritingReviewPayload } from '../types';

export const noteReviewsQueryKey = (noteId: number) => ['note-reviews', noteId] as const;

export const useNoteReviews = (noteId: number) =>
  useQuery({
    queryKey: noteReviewsQueryKey(noteId),
    queryFn: () => noteReviewsApi.listByNote(noteId),
    enabled: Number.isFinite(noteId),
  });

export const useSaveNoteReview = (noteId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveWritingReviewPayload) => noteReviewsApi.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteReviewsQueryKey(noteId) }),
  });
};

export const useDeleteNoteReview = (noteId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: number) => noteReviewsApi.remove(reviewId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteReviewsQueryKey(noteId) }),
  });
};
