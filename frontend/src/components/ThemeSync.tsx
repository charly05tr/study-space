import { useEffect } from 'react';
import { useThemeStore } from '../store/themeStore';

/**
 * Mirrors the theme onto <html data-theme>, which is what the dark token
 * overrides in index.css key off. Renders nothing.
 */
export const ThemeSync = () => {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return null;
};
