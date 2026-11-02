import { useEffect, useState } from 'react';
import type { Viewport } from '../panelGeometry';

const read = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight });

/** The window's size, updated on resize so panels can re-clamp themselves. */
export const useViewportSize = (): Viewport => {
  const [viewport, setViewport] = useState(read);

  useEffect(() => {
    const onResize = () => {
      const next = read();
      setViewport((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return viewport;
};
