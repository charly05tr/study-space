import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EncryptedSecret } from '../crypto/keyVault';
import type { GeminiModel } from '../types';

interface AiSettingsState {
  /** The API key, encrypted by keyVault. The plaintext never enters this store. */
  encryptedKey: EncryptedSecret | null;
  /** Resource name of the selected model, e.g. `models/gemini-2.5-flash`. */
  model: string | null;
  availableModels: GeminiModel[];
  /** Replaces everything at once: a new key invalidates the old model list. */
  connect: (encryptedKey: EncryptedSecret, models: GeminiModel[], model: string | null) => void;
  setModel: (model: string) => void;
  /** Refreshes the list for the current key; `model` is the (possibly reset) selection. */
  setModels: (models: GeminiModel[], model: string | null) => void;
  disconnect: () => void;
}

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set) => ({
      encryptedKey: null,
      model: null,
      availableModels: [],

      connect: (encryptedKey, availableModels, model) =>
        set({ encryptedKey, availableModels, model }),
      setModel: (model) => set({ model }),
      setModels: (availableModels, model) => set({ availableModels, model }),
      disconnect: () => set({ encryptedKey: null, model: null, availableModels: [] }),
    }),
    { name: 'ai-settings' },
  ),
);
