import { GeminiError } from './api/gemini.api';
import { pickDefaultModel } from './defaultModel';
import { useAiSettingsStore } from './store/aiSettingsStore';

/**
 * The model to call: the saved one, or the default when it is gone from the
 * list (retired, or never refreshed). Throws a readable error when the user has
 * not connected a key or no model is available.
 */
export const resolveModel = (): string => {
  const { encryptedKey, model, availableModels } = useAiSettingsStore.getState();
  if (!encryptedKey) throw new GeminiError('Add your Gemini API key in your profile first.');

  const picked =
    model && availableModels.some((option) => option.name === model)
      ? model
      : pickDefaultModel(availableModels);
  if (!picked) throw new GeminiError('No Gemini model is available. Check your key in your profile.');
  return picked;
};
