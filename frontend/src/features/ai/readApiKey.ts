import { GeminiError } from './api/gemini.api';
import { getKeyVault } from './crypto/keyVault';
import { useAiSettingsStore } from './store/aiSettingsStore';

export const KEY_UNREADABLE_MESSAGE =
  'Your saved API key could not be read. Please add it again in your profile.';

// OperationError: wrong AES key or tampered ciphertext. InvalidCharacterError:
// corrupted base64. Anything else (e.g. IndexedDB briefly unavailable) is transient.
const PERMANENT_FAILURES = new Set(['OperationError', 'InvalidCharacterError']);

/**
 * Decrypts the saved key. When that fails for good (IndexedDB was cleared, so
 * the AES key is gone, or the ciphertext is corrupted) the stored key can never
 * work again, so it is removed and the user is told to add it again.
 */
export const readApiKey = async (): Promise<string> => {
  const { encryptedKey, disconnect } = useAiSettingsStore.getState();
  if (!encryptedKey) throw new GeminiError('Add your Gemini API key in your profile first.');

  try {
    return await getKeyVault().decrypt(encryptedKey);
  } catch (error) {
    if (error instanceof DOMException && PERMANENT_FAILURES.has(error.name)) {
      disconnect();
      throw new GeminiError(KEY_UNREADABLE_MESSAGE);
    }
    throw new GeminiError('Your saved API key is temporarily unavailable. Please try again.');
  }
};
