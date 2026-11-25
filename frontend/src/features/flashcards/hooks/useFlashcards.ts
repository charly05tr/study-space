import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { flashcardsApi } from '../api/flashcards.api';
import type {
  CreateFlashcardPayload,
  FlashcardContent,
  FlashcardFilters,
  FlashcardStats,
  Rating,
} from '../types';

/** Prefix of every flashcard query, for invalidating them all at once. */
export const flashcardsRootKey = ['flashcards'] as const;

export const flashcardsQueryKey = (studyspaceId: number, filters: FlashcardFilters = {}) =>
  [...flashcardsRootKey, 'list', studyspaceId, filters] as const;

export const dueQueryKey = (studyspaceId: number, newLimit?: number) =>
  [...flashcardsRootKey, 'due', studyspaceId, newLimit ?? null] as const;

export const statsQueryKey = (studyspaceId: number) =>
  [...flashcardsRootKey, 'stats', studyspaceId] as const;

const emptyStats = (studyspaceId: number): FlashcardStats => ({
  studyspace: studyspaceId,
  total: 0,
  new: 0,
  due: 0,
});

/** Every flashcard in a studyspace, optionally filtered server-side. */
export const useStudyspaceFlashcards = (studyspaceId: number, filters: FlashcardFilters = {}) =>
  useQuery({
    queryKey: flashcardsQueryKey(studyspaceId, filters),
    queryFn: () => flashcardsApi.listByStudyspace(studyspaceId, filters),
    enabled: Number.isFinite(studyspaceId),
  });

/** The server omits spaces without cards; this always answers with a row. */
export const useFlashcardStats = (studyspaceId: number) =>
  useQuery({
    queryKey: statsQueryKey(studyspaceId),
    queryFn: async () => {
      const rows = await flashcardsApi.stats(studyspaceId);
      return rows.find((row) => row.studyspace === studyspaceId) ?? emptyStats(studyspaceId);
    },
    enabled: Number.isFinite(studyspaceId),
  });

/** What changed shape or count: every list, the queue and the stats are stale. */
const useRefreshFlashcards = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: flashcardsRootKey });
};

export const useCreateFlashcard = () => {
  const refresh = useRefreshFlashcards();
  return useMutation({
    mutationFn: (payload: CreateFlashcardPayload) => flashcardsApi.create(payload),
    onSuccess: refresh,
  });
};

export const useUpdateFlashcard = () => {
  const refresh = useRefreshFlashcards();
  return useMutation({
    mutationFn: ({
      flashcardId,
      payload,
    }: {
      flashcardId: number;
      payload: Partial<FlashcardContent>;
    }) => flashcardsApi.update(flashcardId, payload),
    onSuccess: refresh,
  });
};

export const useDeleteFlashcard = () => {
  const refresh = useRefreshFlashcards();
  return useMutation({
    mutationFn: (flashcardId: number) => flashcardsApi.remove(flashcardId),
    onSuccess: refresh,
  });
};

export const useResetFlashcard = () => {
  const refresh = useRefreshFlashcards();
  return useMutation({
    mutationFn: (flashcardId: number) => flashcardsApi.resetProgress(flashcardId),
    onSuccess: refresh,
  });
};

/**
 * Rates one card. The lists and stats refresh, but the due queue is only marked
 * stale: a session holds its own copy of the queue, and refetching it under the
 * user's hands mid-session would shuffle the cards they are going through.
 */
export const useReviewFlashcard = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ flashcardId, rating }: { flashcardId: number; rating: Rating }) =>
      flashcardsApi.review(flashcardId, rating),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: [...flashcardsRootKey, 'due'],
          refetchType: 'none',
        }),
        queryClient.invalidateQueries({ queryKey: [...flashcardsRootKey, 'list'] }),
        queryClient.invalidateQueries({ queryKey: [...flashcardsRootKey, 'stats'] }),
      ]),
  });
};

/** Copies questions into flashcards; every flashcard query is refreshed. */
export const useConvertQuestions = () => {
  const refresh = useRefreshFlashcards();
  return useMutation({
    mutationFn: (questionIds: number[]) => flashcardsApi.fromQuestions(questionIds),
    onSuccess: refresh,
  });
};
