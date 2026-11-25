import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { quizzesApi } from '../api/quizzes.api';
import type { CreateQuizPayload, Quiz, UpdateQuizPayload } from '../types';

/** Prefix of every studyspace quiz list, for invalidating them all at once. */
export const quizzesRootKey = ['quizzes'] as const;

export const quizzesQueryKey = (studyspaceId: number) =>
  [...quizzesRootKey, 'studyspace', studyspaceId] as const;

/** Singular on purpose: it does not share a prefix with the list keys. */
export const quizQueryKey = (quizId: number) => ['quiz', quizId] as const;

/** Every quiz in a studyspace (drafts included), without their questions. */
export const useStudyspaceQuizzes = (studyspaceId: number) =>
  useQuery({
    queryKey: quizzesQueryKey(studyspaceId),
    queryFn: () => quizzesApi.listByStudyspace(studyspaceId),
    enabled: Number.isFinite(studyspaceId),
  });

/** One quiz with its questions, in order. */
export const useQuiz = (quizId: number) =>
  useQuery({
    queryKey: quizQueryKey(quizId),
    queryFn: () => quizzesApi.retrieve(quizId),
    enabled: Number.isFinite(quizId),
  });

/**
 * Writes the server's answer into the detail cache and refreshes the lists, whose
 * rows carry the status, title and question count that just changed.
 */
const useSyncQuiz = () => {
  const queryClient = useQueryClient();
  return (quiz: Quiz) => {
    queryClient.setQueryData<Quiz>(quizQueryKey(quiz.id), quiz);
    return queryClient.invalidateQueries({ queryKey: quizzesQueryKey(quiz.studyspace) });
  };
};

export const useCreateQuiz = () => {
  const sync = useSyncQuiz();
  return useMutation({
    mutationFn: (payload: CreateQuizPayload) => quizzesApi.create(payload),
    onSuccess: sync,
  });
};

export const useUpdateQuiz = (quizId: number) => {
  const sync = useSyncQuiz();
  return useMutation({
    mutationFn: (payload: UpdateQuizPayload) => quizzesApi.update(quizId, payload),
    onSuccess: sync,
  });
};

export const usePublishQuiz = (quizId: number) => {
  const sync = useSyncQuiz();
  return useMutation({
    mutationFn: () => quizzesApi.publish(quizId),
    onSuccess: sync,
  });
};

/** Deletes a quiz from a list row; its flashcards survive on the server. */
export const useDeleteQuiz = (studyspaceId: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (quizId: number) => quizzesApi.remove(quizId),
    onSuccess: (_result, quizId) => {
      // Removed, not invalidated: refetching a deleted quiz would only be a 404.
      queryClient.removeQueries({ queryKey: quizQueryKey(quizId) });
      return queryClient.invalidateQueries({ queryKey: quizzesQueryKey(studyspaceId) });
    },
  });
};
