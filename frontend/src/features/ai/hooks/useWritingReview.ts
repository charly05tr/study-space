import { useMutation } from '@tanstack/react-query';
import { GeminiError, reviewWriting } from '../api/gemini.api';
import { pickDefaultModel } from '../defaultModel';
import { readApiKey } from '../readApiKey';
import { useAiSettingsStore } from '../store/aiSettingsStore';

/**
 * The key is decrypted at call time and lives only for the duration of the
 * request; it is never held in state.
 */
export const useWritingReview = () =>
  useMutation({
    mutationFn: async (text: string) => {
      const { encryptedKey, model, availableModels } = useAiSettingsStore.getState();
      if (!encryptedKey) throw new GeminiError('Add your Gemini API key in your profile first.');

      // The saved model can be gone from the list (retired, or never refreshed).
      const selected =
        model && availableModels.some((option) => option.name === model)
          ? model
          : pickDefaultModel(availableModels);
      if (!selected) throw new GeminiError('No Gemini model is available. Check your key in your profile.');

      return reviewWriting(await readApiKey(), selected, text);
    },
  });
