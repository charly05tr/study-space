import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { noteReviewsApi } from '../api/noteReviews.api';
import type { SaveWritingReviewPayload } from '../types';

export const noteReviewsQueryKey = (noteId: number) => ['note-reviews', noteId] as const;

/** Prefix of every studyspace-wide list, for invalidating them all at once. */
export const studyspaceReviewsRootKey = ['note-reviews', 'studyspace'] as const;

export const studyspaceReviewsQueryKey = (studyspaceId: number) =>
  [...studyspaceReviewsRootKey, studyspaceId] as const;

export const useNoteReviews = (noteId: number) =>
  useQuery({
    queryKey: noteReviewsQueryKey(noteId),
    queryFn: () => noteReviewsApi.listByNote(noteId),
    enabled: Number.isFinite(noteId),
  });

/** Every review in a studyspace, newest first. */
export const useStudyspaceReviews = (studyspaceId: number) =>
  useQuery({
    queryKey: studyspaceReviewsQueryKey(studyspaceId),
    queryFn: () => noteReviewsApi.listByStudyspace(studyspaceId),
    enabled: Number.isFinite(studyspaceId),
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
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: noteReviewsQueryKey(noteId) }),
        queryClient.invalidateQueries({ queryKey: studyspaceReviewsRootKey }),
      ]),
  });
};

/**
 * Delete from the studyspace page, where each row knows its note. Invalidates
 * the studyspace list and that note's own list.
 */
export const useDeleteReviewFromList = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId }: { reviewId: number; noteId: number }) =>
      noteReviewsApi.remove(reviewId),
    onSuccess: (_data, { noteId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: studyspaceReviewsRootKey }),
        queryClient.invalidateQueries({ queryKey: noteReviewsQueryKey(noteId) }),
      ]),
  });
};
