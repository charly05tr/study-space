import { useCallback, useEffect, useMemo, useRef } from 'react';

interface Block {
  id: string;
  top: number;
}

/**
 * Dark palette applied over the converted document's own :root variables.
 * 13.5:1 for body text and 6.1:1 for muted text on the dark page.
 */
const DARK_VARS: Record<string, string> = {
  '--page-background': '#1c1b21',
  '--text-color': '#e8e4da',
  '--muted-color': '#a09a8c',
  '--rule-color': '#34323a',
  '--target-tint': '#4a4128',
};

const LIGHT_VARS: Record<string, string> = {
  '--page-background': '#fdfbf7',
  '--text-color': '#3d3b49',
  '--muted-color': '#6f685c',
  '--rule-color': '#e6e0d4',
  '--target-tint': '#f3e8cd',
};

interface ReaderFrameProps {
  html: string;
  title: string;
  initialAnchor: string;
  fontSize: number;
  dark: boolean;
  onAnchorChange: (anchor: string) => void;
}

/**
 * Renders the converted source inside an iframe.
 *
 * An iframe rather than dangerouslySetInnerHTML because the converted file is a
 * complete HTML document: it carries its own <head>, an @import for its webfont,
 * and global `body`/`p`/`h1..h6` rules that would otherwise restyle the whole
 * app. The iframe also lets the browser parse a multi-megabyte document natively
 * instead of holding it in React's tree.
 *
 * The blob: URL is same-origin with this document, so the parent can still read
 * the frame's scroll position — no postMessage bridge needed.
 */
export const ReaderFrame = ({
  html,
  title,
  initialAnchor,
  fontSize,
  dark,
  onAnchorChange,
}: ReaderFrameProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blocks = useRef<Block[]>([]);
  const lastReported = useRef<string | null>(null);
  const frameRequest = useRef<number | null>(null);

  const blobUrl = useMemo(
    () => URL.createObjectURL(new Blob([html], { type: 'text/html' })),
    [html],
  );

  useEffect(() => () => URL.revokeObjectURL(blobUrl), [blobUrl]);

  const applySettings = useCallback(
    (doc: Document) => {
      const root = doc.documentElement;
      const palette = dark ? DARK_VARS : LIGHT_VARS;
      Object.entries(palette).forEach(([name, value]) => root.style.setProperty(name, value));
      root.style.setProperty('--body-size', `${fontSize}px`);
    },
    [dark, fontSize],
  );

  /**
   * Absolute offsets measured once, then binary-searched on scroll. Reading a
   * rect for every block on every scroll event would be unusable on a document
   * with tens of thousands of them.
   */
  const measure = useCallback((doc: Document) => {
    const view = doc.defaultView;
    if (!view) return;
    const scrollY = view.scrollY;
    blocks.current = Array.from(doc.querySelectorAll<HTMLElement>('[data-pagina][id]')).map(
      (element) => ({
        id: element.id,
        top: element.getBoundingClientRect().top + scrollY,
      }),
    );
  }, []);

  const reportAnchor = useCallback(
    (doc: Document) => {
      const view = doc.defaultView;
      const list = blocks.current;
      if (!view || list.length === 0) return;

      const target = view.scrollY + 8;
      let low = 0;
      let high = list.length - 1;
      let found = 0;
      while (low <= high) {
        const middle = (low + high) >> 1;
        if (list[middle].top <= target) {
          found = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }

      const anchor = list[found].id;
      if (anchor !== lastReported.current) {
        lastReported.current = anchor;
        onAnchorChange(anchor);
      }
    },
    [onAnchorChange],
  );

  const handleLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    const view = doc?.defaultView;
    if (!doc || !view) return;

    applySettings(doc);
    measure(doc);

    if (initialAnchor) {
      doc.getElementById(initialAnchor)?.scrollIntoView();
      lastReported.current = initialAnchor;
    }

    const onScroll = () => {
      if (frameRequest.current !== null) return;
      frameRequest.current = view.requestAnimationFrame(() => {
        frameRequest.current = null;
        reportAnchor(doc);
      });
    };

    view.addEventListener('scroll', onScroll, { passive: true });
    // Re-measuring on resize matters because the layout is width-dependent.
    view.addEventListener('resize', () => measure(doc), { passive: true });
  }, [applySettings, initialAnchor, measure, reportAnchor]);

  // Typography changes reflow the document, so every cached offset is stale.
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || doc.readyState === 'loading') return;
    applySettings(doc);
    measure(doc);
  }, [applySettings, measure]);

  return (
    <iframe
      ref={iframeRef}
      src={blobUrl}
      title={title}
      onLoad={handleLoad}
      className="h-full w-full border-0"
    />
  );
};
