import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GeminiError, isAbortError, streamReviewWriting } from '../api/gemini.api';
import { pickDefaultModel } from '../defaultModel';
import { readApiKey } from '../readApiKey';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import type { PartialWritingReview, WritingReview } from '../types';
import { useSaveNoteReview } from './useNoteReviews';

/**
 * The key is decrypted at call time and lives only for the duration of the
 * request; it is never held in state.
 *
 * The review streams in: `partial` holds the best snapshot so far while the
 * request runs, and `review.data` the validated result once it ends. Only that
 * final result is saved to the server, and only the result: the key never leaves
 * the browser. The save is not awaited, so the review shows as soon as the model
 * finishes; `saveFailed` lets the panel say it was not kept.
 *
 * A cancelled run (unmount, or a newer run replacing it) resolves to `null`
 * instead of failing, so it never reaches the UI as an error and is never saved.
 *
 * Runs start through `start`, not `review.mutate`: the controller is created
 * synchronously there, because react-query runs `mutationFn` later and an
 * unmount in between would otherwise have nothing to abort.
 */

interface ReviewRun {
  text: string;
  signal: AbortSignal;
}

export const useWritingReview = (noteId: number) => {
  const save = useSaveNoteReview(noteId);
  const [partial, setPartial] = useState<PartialWritingReview | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const review = useMutation({
    mutationFn: async ({ text, signal }: ReviewRun): Promise<WritingReview | null> => {
      if (signal.aborted) return null;

      const { encryptedKey, model, availableModels } = useAiSettingsStore.getState();
      if (!encryptedKey) throw new GeminiError('Add your Gemini API key in your profile first.');

      // The saved model can be gone from the list (retired, or never refreshed).
      const selected =
        model && availableModels.some((option) => option.name === model)
          ? model
          : pickDefaultModel(availableModels);
      if (!selected) throw new GeminiError('No Gemini model is available. Check your key in your profile.');

      try {
        const result = await streamReviewWriting(await readApiKey(), selected, text, {
          signal,
          // A late chunk from a cancelled run must not overwrite the newer one.
          onPartial: (next) => {
            if (!signal.aborted) setPartial(next);
          },
        });
        if (signal.aborted) return null;

        // `?? ''`: the model can omit the language, and the server fills it in.
        save.mutate({ note: noteId, result, model: selected, language: result.language ?? '' });

        return result;
      } catch (error) {
        if (signal.aborted || isAbortError(error)) return null;
        throw error;
      }
    },
  });

  const { mutate } = review;
  const start = useCallback(
    (text: string) => {
      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;
      // Cleared here, not in `mutationFn`, so a retry never shows the old review.
      setPartial(null);
      mutate({ text, signal: next.signal });
    },
    [mutate],
  );

  return { review, start, partial, saveFailed: save.isError };
};
