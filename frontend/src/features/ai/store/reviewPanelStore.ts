import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DOCK_DEFAULT_WIDTH, isRect, type Rect } from '../panelGeometry';

export type ReviewPanelMode = 'docked' | 'floating';

interface ReviewPanelState {
  mode: ReviewPanelMode;
  /** Width of the docked drawer, in px. */
  dockedWidth: number;
  /** Last place of the floating window; null until it is first floated. */
  floatingRect: Rect | null;
  setMode: (mode: ReviewPanelMode) => void;
  setDockedWidth: (width: number) => void;
  setFloatingRect: (rect: Rect) => void;
}

/** UI preferences only: where the panel sits, never what it shows. */
export const useReviewPanelStore = create<ReviewPanelState>()(
  persist(
    (set) => ({
      mode: 'docked',
      dockedWidth: DOCK_DEFAULT_WIDTH,
      floatingRect: null,

      setMode: (mode) => set({ mode }),
      setDockedWidth: (dockedWidth) => set({ dockedWidth }),
      setFloatingRect: (floatingRect) => set({ floatingRect }),
    }),
    {
      name: 'review-panel',
      version: 1,
      // localStorage is user-editable and survives schema changes: each field
      // is checked on its own, and a bad one falls back to its default without
      // discarding the good ones.
      merge: (persisted, current) => {
        const saved = (typeof persisted === 'object' && persisted !== null ? persisted : {}) as Record<
          string,
          unknown
        >;
        const width = saved.dockedWidth;
        return {
          ...current,
          mode: saved.mode === 'floating' || saved.mode === 'docked' ? saved.mode : current.mode,
          dockedWidth:
            typeof width === 'number' && Number.isFinite(width) && width > 0
              ? width
              : current.dockedWidth,
          floatingRect: isRect(saved.floatingRect) ? saved.floatingRect : null,
        };
      },
    },
  ),
);
