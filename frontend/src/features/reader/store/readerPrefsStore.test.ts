import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Rehydration happens once, when the module is first evaluated, so each case
 * seeds localStorage and then loads a fresh copy of the store.
 */
const loadStore = async (persisted?: Record<string, unknown>) => {
  localStorage.clear();
  if (persisted) {
    localStorage.setItem('reader-prefs', JSON.stringify({ state: persisted, version: 0 }));
  }
  vi.resetModules();
  return import('./readerPrefsStore');
};

describe('reader preferences', () => {
  beforeEach(() => localStorage.clear());

  it('opens at the default size with nothing saved', async () => {
    const { useReaderPrefsStore, DEFAULT_FONT_SIZE } = await loadStore();

    expect(useReaderPrefsStore.getState().fontSize).toBe(DEFAULT_FONT_SIZE);
    expect(useReaderPrefsStore.getState().panelOpen).toBe(false);
  });

  it('restores what the last session left', async () => {
    const { useReaderPrefsStore } = await loadStore({ fontSize: 34, panelOpen: true });

    expect(useReaderPrefsStore.getState().fontSize).toBe(34);
    expect(useReaderPrefsStore.getState().panelOpen).toBe(true);
  });

  it('clamps a size saved under an older range', async () => {
    const { useReaderPrefsStore, MIN_FONT_SIZE } = await loadStore({ fontSize: 8 });

    expect(useReaderPrefsStore.getState().fontSize).toBe(MIN_FONT_SIZE);
  });

  it('survives a corrupt entry', async () => {
    localStorage.setItem('reader-prefs', '{ not json');
    vi.resetModules();
    const { useReaderPrefsStore, DEFAULT_FONT_SIZE } = await import('./readerPrefsStore');

    expect(useReaderPrefsStore.getState().fontSize).toBe(DEFAULT_FONT_SIZE);
  });

  it('writes every change back to storage', async () => {
    const { useReaderPrefsStore } = await loadStore();

    useReaderPrefsStore.getState().adjustFontSize(2);
    useReaderPrefsStore.getState().togglePanel();

    const saved = JSON.parse(localStorage.getItem('reader-prefs') ?? '{}');
    expect(saved.state.fontSize).toBe(useReaderPrefsStore.getState().fontSize);
    expect(saved.state.panelOpen).toBe(true);
  });

  it('keeps adjustments inside the supported range', async () => {
    const { useReaderPrefsStore, MIN_FONT_SIZE, MAX_FONT_SIZE } = await loadStore();

    useReaderPrefsStore.getState().adjustFontSize(999);
    expect(useReaderPrefsStore.getState().fontSize).toBe(MAX_FONT_SIZE);

    useReaderPrefsStore.getState().adjustFontSize(-999);
    expect(useReaderPrefsStore.getState().fontSize).toBe(MIN_FONT_SIZE);
  });
});
