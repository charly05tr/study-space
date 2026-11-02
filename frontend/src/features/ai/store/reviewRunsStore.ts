import { create } from 'zustand';
import { queryClient } from '../../../config/queryClient';
import { useAuthStore } from '../../auth/store/authStore';
import { GeminiError, isAbortError, streamReviewWriting } from '../api/gemini.api';
import { noteReviewsApi } from '../api/noteReviews.api';
import { pickDefaultModel } from '../defaultModel';
import { noteReviewsQueryKey, studyspaceReviewsRootKey } from '../hooks/useNoteReviews';
import { readApiKey } from '../readApiKey';
import type { PartialWritingReview, SavedWritingReview, WritingReview } from '../types';
import { useAiSettingsStore } from './aiSettingsStore';

/**
 * Review runs live here, not in the panel, so they survive the panel closing and
 * the note unmounting. One run per note at a time; different notes run in
 * parallel.
 *
 * The key is decrypted at call time and never stored: an entry holds only the
 * review, the error and the controller. Only the result is saved to the server.
 *
 * A finished run stays as a `done` entry just long enough to be shown and saved;
 * once saved and the history is updated it is dropped, and the panel shows it
 * through history. A failed save keeps the entry so the result is not lost, and
 * it can be retried.
 *
 * While a save is in flight the entry cannot be dismissed or replaced: if that
 * save then failed, the result would be gone with nothing left to retry.
 */

export interface ReviewRunEntry {
  status: 'running' | 'error' | 'done';
  /** Best snapshot so far while running. */
  partial: PartialWritingReview | null;
  /** The validated result once `done`. */
  result: WritingReview | null;
  error: unknown;
  saveFailed: boolean;
  /** A save request is in flight. */
  saving: boolean;
  /** Model the result came from, kept for the save and its retry. */
  model: string;
  text: string;
  controller: AbortController;
}

interface ReviewRunsState {
  runs: Record<number, ReviewRunEntry>;
  /** No-op while a run or a save for this note is in progress. */
  start: (noteId: number, text: string) => void;
  /** Aborts a running review; nothing is saved and no error is recorded. */
  cancel: (noteId: number) => void;
  /** Drops a finished entry (an error or a result that could not be saved). */
  dismiss: (noteId: number) => void;
  /** Saves again a result whose save failed. */
  retrySave: (noteId: number) => void;
  abortAll: () => void;
}

export const useReviewRunsStore = create<ReviewRunsState>()((set, get) => {
  const patch = (noteId: number, changes: Partial<ReviewRunEntry>) =>
    set((state) => ({ runs: { ...state.runs, [noteId]: { ...state.runs[noteId], ...changes } } }));

  const remove = (noteId: number) =>
    set((state) => {
      const runs = { ...state.runs };
      delete runs[noteId];
      return { runs };
    });

  const save = async (noteId: number, controller: AbortController) => {
    // A cancelled, replaced or logged-out entry is no longer this one.
    const isCurrent = () => get().runs[noteId]?.controller === controller;
    const entry = get().runs[noteId];
    if (!entry?.result || !isCurrent()) return;
    const { result, model } = entry;

    patch(noteId, { saving: true, saveFailed: false });
    let created: SavedWritingReview;
    try {
      // `?? ''`: the model can omit the language, and the server fills it in.
      created = await noteReviewsApi.create({
        note: noteId,
        result,
        model,
        language: result.language ?? '',
      });
    } catch {
      if (isCurrent()) patch(noteId, { saving: false, saveFailed: true });
      return;
    }
    // Logged out mid-save: leave the cleared cache alone.
    if (!isCurrent()) return;

    const key = noteReviewsQueryKey(noteId);
    // Written into the cache first: with the panel closed nothing observes the
    // query, so invalidating alone would only mark it stale and a reopen would
    // briefly see the old list. Skipped when nothing is cached to prepend to.
    queryClient.setQueryData<SavedWritingReview[]>(key, (old) => (old ? [created, ...old] : old));
    await queryClient.invalidateQueries({ queryKey: key });
    // The note's studyspace is not known here, and a page listing its reviews
    // may be cached: refetch whichever is.
    void queryClient.invalidateQueries({ queryKey: studyspaceReviewsRootKey });
    if (isCurrent()) remove(noteId);
  };

  const execute = async (noteId: number, text: string, controller: AbortController) => {
    const { signal } = controller;
    const isCurrent = () => get().runs[noteId]?.controller === controller;

    let result: WritingReview;
    let selected: string;
    try {
      const { encryptedKey, model, availableModels } = useAiSettingsStore.getState();
      if (!encryptedKey) throw new GeminiError('Add your Gemini API key in your profile first.');

      // The saved model can be gone from the list (retired, or never refreshed).
      const picked =
        model && availableModels.some((option) => option.name === model)
          ? model
          : pickDefaultModel(availableModels);
      if (!picked) throw new GeminiError('No Gemini model is available. Check your key in your profile.');
      selected = picked;

      result = await streamReviewWriting(await readApiKey(), selected, text, {
        signal,
        // A late chunk from a cancelled run must not overwrite the newer one.
        onPartial: (next) => {
          if (isCurrent()) patch(noteId, { partial: next });
        },
      });
    } catch (error) {
      if (signal.aborted || isAbortError(error) || !isCurrent()) return;
      patch(noteId, { status: 'error', error });
      return;
    }
    if (signal.aborted || !isCurrent()) return;

    // Shown right away; the panel does not wait for the save.
    patch(noteId, { status: 'done', result, partial: null, model: selected });
    void save(noteId, controller);
  };

  return {
    runs: {},

    start: (noteId, text) => {
      const current = get().runs[noteId];
      if (current?.status === 'running' || current?.saving) return;
      const controller = new AbortController();
      set((state) => ({
        runs: {
          ...state.runs,
          [noteId]: {
            status: 'running',
            partial: null,
            result: null,
            error: null,
            saveFailed: false,
            saving: false,
            model: '',
            text,
            controller,
          },
        },
      }));
      void execute(noteId, text, controller);
    },

    cancel: (noteId) => {
      const entry = get().runs[noteId];
      if (entry?.status !== 'running') return;
      entry.controller.abort();
      remove(noteId);
    },

    dismiss: (noteId) => {
      const current = get().runs[noteId];
      if (current?.status === 'running' || current?.saving) return;
      remove(noteId);
    },

    retrySave: (noteId) => {
      const current = get().runs[noteId];
      if (current?.status !== 'done' || !current.saveFailed || current.saving) return;
      void save(noteId, current.controller);
    },

    abortAll: () => {
      Object.values(get().runs).forEach((entry) => entry.controller.abort());
      set({ runs: {} });
    },
  };
});

// A run must not outlive the session that started it, nor leave cached reviews
// behind for the next user. Desktop mode has a single permanent user and its
// `logout` is a no-op, so this never fires there.
const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
  if (previous.isAuthenticated && !state.isAuthenticated) {
    useReviewRunsStore.getState().abortAll();
    queryClient.clear();
  }
});
// Without this, each hot reload of the module would stack another subscription.
import.meta.hot?.dispose(unsubscribeAuth);
