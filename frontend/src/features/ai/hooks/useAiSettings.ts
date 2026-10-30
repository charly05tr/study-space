import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { listModels } from '../api/gemini.api';
import { getKeyVault } from '../crypto/keyVault';
import { pickDefaultModel } from '../defaultModel';
import { readApiKey } from '../readApiKey';
import { useAiSettingsStore } from '../store/aiSettingsStore';

export const useAiSettings = () => {
  const encryptedKey = useAiSettingsStore((state) => state.encryptedKey);
  const model = useAiSettingsStore((state) => state.model);
  const availableModels = useAiSettingsStore((state) => state.availableModels);
  const store = useAiSettingsStore.getState;
  const isConnected = encryptedKey !== null;

  /**
   * Test first, store second: a key is only encrypted and saved after Gemini
   * has accepted it, so a typo never replaces a working connection.
   */
  const connect = useMutation({
    mutationFn: async (key: string) => {
      const trimmed = key.trim();
      const models = await listModels(trimmed);
      if (models.length === 0) {
        throw new Error('This key works, but no Gemini model is available for it.');
      }

      let secret;
      try {
        secret = await getKeyVault().encrypt(trimmed);
      } catch (error) {
        // IndexedDB or WebCrypto can be blocked (private window, storage policy).
        if (error instanceof DOMException) {
          throw new Error('Could not store the key securely in this browser.', { cause: error });
        }
        throw error;
      }
      store().connect(secret, models, pickDefaultModel(models));
    },
  });

  /**
   * Models come and go, so the saved list goes stale. On failure the old list
   * stays: a flaky network must not empty the picker.
   */
  const refresh = useMutation({
    mutationFn: async () => {
      const startedWith = store().encryptedKey;
      const models = await listModels(await readApiKey());
      // The user disconnected or switched keys while this was in flight.
      if (models.length === 0 || store().encryptedKey !== startedWith) return;

      const current = store().model;
      const keep = current && models.some((option) => option.name === current);
      store().setModels(models, keep ? current : pickDefaultModel(models));
    },
  });

  const { mutate: refreshModels } = refresh;
  useEffect(() => {
    if (isConnected) refreshModels();
  }, [isConnected, refreshModels]);

  return {
    isConnected,
    model,
    availableModels,
    connect,
    refresh,
    setModel: (name: string) => store().setModel(name),
    disconnect: () => {
      connect.reset();
      store().disconnect();
    },
  };
};
