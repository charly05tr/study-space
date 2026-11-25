import { useMutation, useQueryClient } from '@tanstack/react-query';
import { questionsApi } from '../api/quizzes.api';
import type { PositionPatch } from '../questionForm';
import type { CreateQuestionPayload, UpdateQuestionPayload } from '../types';
import { quizQueryKey, quizzesRootKey } from './useQuizzes';

/**
 * Question edits change the quiz detail (the ordered list) and the question
 * count shown on every quiz list, so both are refreshed.
 */
const useRefreshQuiz = (quizId: number) => {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: quizQueryKey(quizId) }),
      queryClient.invalidateQueries({ queryKey: quizzesRootKey }),
    ]);
};

export const useCreateQuestion = (quizId: number) => {
  const refresh = useRefreshQuiz(quizId);
  return useMutation({
    mutationFn: (payload: Omit<CreateQuestionPayload, 'quiz'>) =>
      questionsApi.create({ ...payload, quiz: quizId }),
    onSuccess: refresh,
  });
};

export const useUpdateQuestion = (quizId: number) => {
  const refresh = useRefreshQuiz(quizId);
  return useMutation({
    mutationFn: ({ questionId, payload }: { questionId: number; payload: UpdateQuestionPayload }) =>
      questionsApi.update(questionId, payload),
    onSuccess: refresh,
  });
};

/**
 * Applies the position patches of one move. The API has no reorder action, so
 * each affected question is PATCHed on its own; `position` is a plain field.
 */
export const useMoveQuestion = (quizId: number) => {
  const refresh = useRefreshQuiz(quizId);
  return useMutation({
    mutationFn: (patches: PositionPatch[]) =>
      Promise.all(patches.map(({ id, position }) => questionsApi.update(id, { position }))),
    // Also on failure: one of two PATCHes may have landed, so the list is stale either way.
    onSettled: refresh,
  });
};

export const useDeleteQuestion = (quizId: number) => {
  const refresh = useRefreshQuiz(quizId);
  return useMutation({
    mutationFn: (questionId: number) => questionsApi.remove(questionId),
    onSuccess: refresh,
  });
};
