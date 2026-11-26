import { create } from 'zustand';
import { queryClient } from '../../../config/queryClient';
import { isAbortError } from '../../ai/api/gemini.api';
import { readApiKey } from '../../ai/readApiKey';
import { resolveModel } from '../../ai/resolveModel';
import { useAuthStore } from '../../auth/store/authStore';
import { quizzesApi } from '../api/quizzes.api';
import { streamQuizGeneration } from '../api/quizGeneration.api';
import { quizQueryKey, quizzesQueryKey } from '../hooks/useQuizzes';
import type { GeneratedQuiz, PartialGeneratedQuiz, QuizRequest } from '../prompts/quizGeneration';

/**
 * Quiz generation runs live here, not in the page, so they survive leaving the
 * generator. One run per studyspace at a time; different studyspaces run in
 * parallel.
 *
 * The key is decrypted at call time and never stored. A finished generation is
 * posted at once as a draft; the entry then stays as `saved` until the page that
 * shows it opens the editor (or the user dismisses it). A failed save keeps the
 * result so it can be retried, and a half quiz is never saved: the stream only
 * resolves with a validated quiz.
 */

export interface QuizRunEntry {
  status: 'running' | 'error' | 'done' | 'saved';
  /** Best snapshot so far while running. */
  partial: PartialGeneratedQuiz | null;
  /** The validated quiz once the model is done. */
  result: GeneratedQuiz | null;
  error: unknown;
  saveFailed: boolean;
  /** A save request is in flight. */
  saving: boolean;
  /** Id of the draft once saved. */
  quizId: number | null;
  /** Model the result came from, kept for the save and its retry. */
  model: string;
  request: QuizRequest;
  controller: AbortController;
  /** When the run began (ms since epoch): a draft this run saved is not older than that. */
  startedAt: number;
}

/** Client and server clocks are not in sync; this much slack when comparing created_at. */
const CLOCK_SKEW_MS = 60_000;

interface QuizRunsState {
  runs: Record<number, QuizRunEntry>;
  /** No-op while a run or a save for this studyspace is in progress. */
  start: (studyspaceId: number, request: QuizRequest) => void;
  /** Aborts a running generation; nothing is saved and no error is recorded. */
  cancel: (studyspaceId: number) => void;
  /** Drops a finished entry (an error, a saved draft, or a result given up on). */
  dismiss: (studyspaceId: number) => void;
  /** Saves again a result whose save failed. */
  retrySave: (studyspaceId: number) => void;
  abortAll: () => void;
}

export const useQuizRunsStore = create<QuizRunsState>()((set, get) => {
  const patch = (studyspaceId: number, changes: Partial<QuizRunEntry>) =>
    set((state) => ({
      runs: { ...state.runs, [studyspaceId]: { ...state.runs[studyspaceId], ...changes } },
    }));

  const remove = (studyspaceId: number) =>
    set((state) => {
      const runs = { ...state.runs };
      delete runs[studyspaceId];
      return { runs };
    });

  /**
   * The draft an earlier, failed-looking save of this run already created (the
   * request landed but its response was lost), if any. Retrying must reuse it
   * instead of posting a second copy.
   */
  const findSavedDraft = async (studyspaceId: number, entry: QuizRunEntry): Promise<number | null> => {
    const { result, model, startedAt } = entry;
    if (!result) return null;
    try {
      const quizzes = await quizzesApi.listByStudyspace(studyspaceId);
      const match = quizzes.find(
        (quiz) =>
          quiz.origin === 'ai' &&
          quiz.title === result.title.trim() &&
          quiz.model === model &&
          quiz.question_count === result.questions.length &&
          Date.parse(quiz.created_at) >= startedAt - CLOCK_SKEW_MS,
      );
      return match?.id ?? null;
    } catch {
      // Could not tell: saving is the better risk than losing the quiz.
      return null;
    }
  };

  const save = async (
    studyspaceId: number,
    controller: AbortController,
    { isRetry = false }: { isRetry?: boolean } = {},
  ) => {
    // A cancelled, replaced or logged-out entry is no longer this one.
    const isCurrent = () => get().runs[studyspaceId]?.controller === controller;
    const entry = get().runs[studyspaceId];
    if (!entry?.result || !isCurrent()) return;
    const { result, model, request } = entry;

    patch(studyspaceId, { saving: true, saveFailed: false });
    try {
      const existingId = isRetry ? await findSavedDraft(studyspaceId, entry) : null;
      if (existingId !== null) {
        if (!isCurrent()) return;
        await queryClient.invalidateQueries({ queryKey: quizzesQueryKey(studyspaceId) });
        if (isCurrent()) patch(studyspaceId, { status: 'saved', saving: false, quizId: existingId });
        return;
      }

      const quiz = await quizzesApi.create({
        studyspace: studyspaceId,
        title: result.title,
        origin: 'ai',
        prompt: request.topic.trim(),
        language: result.language,
        model,
        questions: result.questions,
      });
      if (!isCurrent()) return;

      queryClient.setQueryData(quizQueryKey(quiz.id), quiz);
      await queryClient.invalidateQueries({ queryKey: quizzesQueryKey(studyspaceId) });
      if (isCurrent()) patch(studyspaceId, { status: 'saved', saving: false, quizId: quiz.id });
    } catch {
      if (isCurrent()) patch(studyspaceId, { saving: false, saveFailed: true });
    }
  };

  const execute = async (
    studyspaceId: number,
    request: QuizRequest,
    controller: AbortController,
  ) => {
    const { signal } = controller;
    const isCurrent = () => get().runs[studyspaceId]?.controller === controller;

    let result: GeneratedQuiz;
    let selected: string;
    try {
      selected = resolveModel();
      result = await streamQuizGeneration(await readApiKey(), selected, request, {
        signal,
        // A late chunk from a cancelled run must not overwrite the newer one.
        onPartial: (next) => {
          if (isCurrent()) patch(studyspaceId, { partial: next });
        },
      });
    } catch (error) {
      if (signal.aborted || isAbortError(error) || !isCurrent()) return;
      patch(studyspaceId, { status: 'error', error });
      return;
    }
    if (signal.aborted || !isCurrent()) return;

    patch(studyspaceId, { status: 'done', result, partial: null, model: selected });
    void save(studyspaceId, controller);
  };

  return {
    runs: {},

    start: (studyspaceId, request) => {
      const current = get().runs[studyspaceId];
      if (current?.status === 'running' || current?.saving) return;
      const controller = new AbortController();
      set((state) => ({
        runs: {
          ...state.runs,
          [studyspaceId]: {
            status: 'running',
            partial: null,
            result: null,
            error: null,
            saveFailed: false,
            saving: false,
            quizId: null,
            model: '',
            request,
            controller,
            startedAt: Date.now(),
          },
        },
      }));
      void execute(studyspaceId, request, controller);
    },

    cancel: (studyspaceId) => {
      const entry = get().runs[studyspaceId];
      if (entry?.status !== 'running') return;
      entry.controller.abort();
      remove(studyspaceId);
    },

    dismiss: (studyspaceId) => {
      const current = get().runs[studyspaceId];
      if (current?.status === 'running' || current?.saving) return;
      remove(studyspaceId);
    },

    retrySave: (studyspaceId) => {
      const current = get().runs[studyspaceId];
      if (current?.status !== 'done' || !current.saveFailed || current.saving) return;
      void save(studyspaceId, current.controller, { isRetry: true });
    },

    abortAll: () => {
      Object.values(get().runs).forEach((entry) => entry.controller.abort());
      set({ runs: {} });
    },
  };
});

// A run must not outlive the session that started it. (The review store already
// clears the query cache on logout.)
const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
  if (previous.isAuthenticated && !state.isAuthenticated) {
    useQuizRunsStore.getState().abortAll();
  }
});
// Without this, each hot reload of the module would stack another subscription.
import.meta.hot?.dispose(unsubscribeAuth);
