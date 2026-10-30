import { describe, expect, it } from 'vitest';
import { createKeyVault, type KeyStore } from './keyVault';

const memoryStore = (): KeyStore & { saves: number } => {
  let key: CryptoKey | undefined;
  return {
    saves: 0,
    load: async () => key,
    save: async function (next) {
      key = next;
      this.saves += 1;
    },
  };
};

describe('createKeyVault', () => {
  it('round-trips a secret', async () => {
    const vault = createKeyVault({ store: memoryStore() });
    const secret = await vault.encrypt('AIzaSy-test-key');

    expect(secret.cipher).not.toContain('AIzaSy');
    expect(await vault.decrypt(secret)).toBe('AIzaSy-test-key');
  });

  it('uses a fresh IV for every encryption', async () => {
    const vault = createKeyVault({ store: memoryStore() });
    const a = await vault.encrypt('same');
    const b = await vault.encrypt('same');

    expect(a.iv).not.toBe(b.iv);
    expect(a.cipher).not.toBe(b.cipher);
  });

  it('generates a non-extractable key and persists it once', async () => {
    const store = memoryStore();
    const vault = createKeyVault({ store });

    await Promise.all([vault.encrypt('a'), vault.encrypt('b')]);

    expect(store.saves).toBe(1);
    expect((await store.load())?.extractable).toBe(false);
  });

  it('decrypts across vault instances sharing the same store', async () => {
    const store = memoryStore();
    const secret = await createKeyVault({ store }).encrypt('persisted');

    expect(await createKeyVault({ store }).decrypt(secret)).toBe('persisted');
  });

  it('rejects a secret that was tampered with', async () => {
    const vault = createKeyVault({ store: memoryStore() });
    const secret = await vault.encrypt('value');
    const other = await vault.encrypt('other');

    await expect(vault.decrypt({ cipher: other.cipher, iv: secret.iv })).rejects.toThrow();
  });
});
