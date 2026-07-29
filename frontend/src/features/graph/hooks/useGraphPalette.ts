import { useSyncExternalStore } from 'react';
import { readPalette, type GraphPalette } from '../graphStyle';

/**
 * The scene's colours, kept in step with the theme.
 *
 * Subscribed to the document rather than to the theme store, because the tokens
 * are CSS variables: their values only change once `data-theme` has actually
 * landed on the root element. Deriving them from React state would read the
 * previous theme's palette on the render that switches it.
 *
 * The snapshot is cached because `useSyncExternalStore` compares identities —
 * returning a fresh object per call would re-render forever.
 */
let snapshot: GraphPalette | null = null;
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

const getSnapshot = (): GraphPalette => {
  snapshot ??= readPalette();
  return snapshot;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  observer ??= new MutationObserver(() => {
    snapshot = readPalette();
    for (const notify of listeners) notify();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class', 'style'],
  });

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = null;
    }
  };
};

export const useGraphPalette = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
