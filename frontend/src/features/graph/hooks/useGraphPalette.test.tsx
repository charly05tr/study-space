import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useGraphPalette } from './useGraphPalette';

/**
 * The palette is cached at module scope and only kept current while something
 * is watching the document. That makes the interesting case the one where
 * nothing is: the map is closed, the theme changes somewhere else in the app,
 * and the map is opened again.
 */

const LIGHT = '#fdfbf7';
const DARK = '#1c1b21';

const setTheme = (theme: 'light' | 'dark') => {
  document.documentElement.dataset.theme = theme;
  // jsdom computes no stylesheets, so the token is set directly — readPalette
  // asks getComputedStyle for exactly this custom property.
  document.documentElement.style.setProperty('--color-page', theme === 'dark' ? DARK : LIGHT);
};

// Rendered rather than assigned to a module variable: writing to one during
// render is a side effect, and the value is read back from the DOM anyway.
const Probe = () => <span>{useGraphPalette().page}</span>;

let host: HTMLDivElement;

const seen = () => host.textContent;

const mount = async () => {
  const root = createRoot(host);
  await act(async () => {
    root.render(<Probe />);
  });
  return root;
};

const unmount = async (root: Root) => {
  await act(async () => root.unmount());
};

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
});

describe('useGraphPalette', () => {
  it('reads the theme in force when it mounts', async () => {
    setTheme('dark');
    const root = await mount();

    expect(seen()).toBe(DARK);
    await unmount(root);
  });

  it('follows a theme change while the map is open', async () => {
    setTheme('light');
    const root = await mount();

    await act(async () => {
      setTheme('dark');
      // MutationObserver callbacks are delivered on a microtask.
      await Promise.resolve();
    });

    expect(seen()).toBe(DARK);
    await unmount(root);
  });

  it('picks up a theme change made while the map was closed', async () => {
    // The regression: the cached snapshot outlived the observer, so a theme
    // switched anywhere else went unseen and the scene came back painted for
    // the previous one.
    setTheme('light');
    await unmount(await mount());

    setTheme('dark');
    const second = await mount();

    expect(seen()).toBe(DARK);
    await unmount(second);
  });
});
