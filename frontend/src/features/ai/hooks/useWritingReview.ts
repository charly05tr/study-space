import { useMutation } from '@tanstack/react-query';
import { GeminiError, reviewWriting } from '../api/gemini.api';
import { pickDefaultModel } from '../defaultModel';
import { readApiKey } from '../readApiKey';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import { useSaveNoteReview } from './useNoteReviews';

/**
 * The key is decrypted at call time and lives only for the duration of the
 * request; it is never held in state.
 *
 * The result is saved to the server as a side effect, and only the result: the
 * key never leaves the browser. The save is not awaited, so the review shows as
 * soon as the model answers; `saveFailed` lets the panel say it was not kept.
 */
export const useWritingReview = (noteId: number) => {
  const save = useSaveNoteReview(noteId);

  const review = useMutation({
    mutationFn: async (text: string) => {
      const { encryptedKey, model, availableModels } = useAiSettingsStore.getState();
      if (!encryptedKey) throw new GeminiError('Add your Gemini API key in your profile first.');

      // The saved model can be gone from the list (retired, or never refreshed).
      const selected =
        model && availableModels.some((option) => option.name === model)
          ? model
          : pickDefaultModel(availableModels);
      if (!selected) throw new GeminiError('No Gemini model is available. Check your key in your profile.');

      const result = await reviewWriting(await readApiKey(), selected, text);

      // `?? ''`: the model can omit the language, and the server fills it in.
      save.mutate({ note: noteId, result, model: selected, language: result.language ?? '' });

      return result;
    },
  });

  return { review, saveFailed: save.isError };
};
