import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * The converted document ships --body-size: 19px, sized for a printed page.
 * On a screen at arm's length that reads small, so the reader opens larger and
 * the range goes well past it in both directions.
 *
 * Line length does not suffer: --measure is 36em, so the ~68-character measure
 * scales with the font instead of stretching.
 */
export const DEFAULT_FONT_SIZE = 22;
export const MIN_FONT_SIZE = 16;
export const MAX_FONT_SIZE = 36;

export const clampFontSize = (size: number) =>
  Math.min(Math.max(Math.round(size), MIN_FONT_SIZE), MAX_FONT_SIZE);

/** `#rrggbb`, the only form <input type="color"> ever produces. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** A colour the reader can apply, or null when it should follow the theme. */
export const readColor = (value: unknown): string | null =>
  typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : null;

interface ReaderPrefsState {
  fontSize: number;
  panelOpen: boolean;
  /**
   * Null means "whatever the light/dark palette says". Kept as an override
   * rather than a full palette so switching theme still works for anyone who
   * never touched the colours.
   */
  pageColor: string | null;
  textColor: string | null;
  setFontSize: (size: number) => void;
  adjustFontSize: (delta: number) => void;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setPageColor: (color: string | null) => void;
  setTextColor: (color: string | null) => void;
  resetColors: () => void;
}

/**
 * Reading preferences, shared across sources and sessions.
 *
 * `mode` is deliberately NOT persisted: focus mode implies browser fullscreen,
 * and fullscreen can only be entered from a user gesture. Restoring it on load
 * would reopen the reader in a half-applied focus state.
 */
export const useReaderPrefsStore = create<ReaderPrefsState>()(
  persist(
    (set) => ({
      fontSize: DEFAULT_FONT_SIZE,
      panelOpen: false,
      pageColor: null,
      textColor: null,

      // Clamping lives here, not in the toolbar, so no caller and no stale
      // localStorage value can put the reader outside the supported range.
      setFontSize: (size) => set({ fontSize: clampFontSize(size) }),
      adjustFontSize: (delta) =>
        set((state) => ({ fontSize: clampFontSize(state.fontSize + delta) })),

      setPanelOpen: (panelOpen) => set({ panelOpen }),
      togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),

      // Validated here for the same reason as the font size: a malformed value
      // written straight onto a CSS variable is silently dropped by the
      // browser, and the reader would show the previous colour with no clue why.
      setPageColor: (color) => set({ pageColor: readColor(color) }),
      setTextColor: (color) => set({ textColor: readColor(color) }),
      resetColors: () => set({ pageColor: null, textColor: null }),
    }),
    {
      name: 'reader-prefs',
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<ReaderPrefsState>;
        return {
          ...current,
          ...saved,
          // A value stored before the range changed must not survive as-is.
          fontSize: clampFontSize(saved.fontSize ?? DEFAULT_FONT_SIZE),
          pageColor: readColor(saved.pageColor),
          textColor: readColor(saved.textColor),
        };
      },
    },
  ),
);
