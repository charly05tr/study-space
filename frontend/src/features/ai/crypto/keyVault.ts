/**
 * Encrypts the user's Gemini API key before it reaches localStorage.
 *
 * The AES-GCM key is generated once, marked non-extractable and parked in
 * IndexedDB. Non-extractable means script can use the key but never read its
 * bytes, so the ciphertext in localStorage is useless on its own: copying the
 * persisted state to another browser or profile yields nothing decryptable.
 *
 * This protects against casual inspection only (a glance at devtools, a synced
 * profile, a leaked backup of localStorage). It does NOT protect against XSS or
 * anyone with access to this machine's browser profile: code running in the page
 * can call `decrypt` exactly like we do.
 */

export interface EncryptedSecret {
  /** Base64 AES-GCM ciphertext (includes the auth tag). */
  cipher: string;
  /** Base64 96-bit IV, random per encryption. */
  iv: string;
}

/** Where the CryptoKey lives. Injected so the logic runs without IndexedDB. */
export interface KeyStore {
  load: () => Promise<CryptoKey | undefined>;
  save: (key: CryptoKey) => Promise<void>;
}

export interface KeyVault {
  encrypt: (plaintext: string) => Promise<EncryptedSecret>;
  decrypt: (secret: EncryptedSecret) => Promise<string>;
}

const DB_NAME = 'study-space-ai';
const STORE_NAME = 'keys';
const KEY_ID = 'api-key-vault';
const IV_BYTES = 12;

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE_NAME);
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });

/** IndexedDB can hold a CryptoKey through structured clone; localStorage cannot. */
export const indexedDbKeyStore: KeyStore = {
  load: async () => {
    const db = await openDatabase();
    try {
      const key = await request<unknown>(
        db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY_ID),
      );
      return key instanceof CryptoKey ? key : undefined;
    } finally {
      db.close();
    }
  },
  save: async (key) => {
    const db = await openDatabase();
    try {
      await request(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(key, KEY_ID));
    } finally {
      db.close();
    }
  },
};

interface VaultDeps {
  store?: KeyStore;
  subtle?: SubtleCrypto;
  getRandomValues?: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
}

export const createKeyVault = ({
  store = indexedDbKeyStore,
  subtle = crypto.subtle,
  getRandomValues = (bytes) => crypto.getRandomValues(bytes),
}: VaultDeps = {}): KeyVault => {
  // Memoised as a promise so two calls racing on first use cannot each generate
  // a key and leave the first ciphertext undecryptable.
  let pending: Promise<CryptoKey> | null = null;

  const getKey = () => {
    pending ??= (async () => {
      const existing = await store.load();
      if (existing) return existing;

      const created = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ]);
      await store.save(created);
      return created;
    })().catch((error) => {
      pending = null;
      throw error;
    });
    return pending;
  };

  return {
    encrypt: async (plaintext) => {
      const key = await getKey();
      const iv = getRandomValues(new Uint8Array(IV_BYTES));
      const cipher = await subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(plaintext),
      );
      return { cipher: toBase64(new Uint8Array(cipher)), iv: toBase64(iv) };
    },

    decrypt: async ({ cipher, iv }) => {
      const key = await getKey();
      const plain = await subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(iv) },
        key,
        fromBase64(cipher),
      );
      return new TextDecoder().decode(plain);
    },
  };
};

/** The vault the app uses. Created lazily so importing this never touches IndexedDB. */
let shared: KeyVault | null = null;
export const getKeyVault = (): KeyVault => (shared ??= createKeyVault());
