import { MARK_CLASS } from './annotationDom';

export type ReaderMode = 'free' | 'focus';

export const READER_STYLE_ID = 'studyspace-reader-style';

/**
 * CSS injected into the converted document.
 *
 * Everything here is expressed through the variables the converted file already
 * defines on :root, so it follows the light/dark palette without a second
 * source of truth.
 */
export const readerCss = (mode: ReaderMode) => `
  /* The converted layout is a fixed measure centred in the viewport; a
     horizontal bar here only ever means an overflowing figure or code block. */
  html, body {
    overflow-x: hidden;
  }

  /* Firefox */
  html {
    scrollbar-width: thin;
    scrollbar-color: var(--rule-color) transparent;
  }

  /* WebKit and Blink */
  ::-webkit-scrollbar {
    width: 10px;
    height: 0;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background-color: var(--rule-color);
    border-radius: 999px;
    border: 3px solid var(--page-background);
  }
  ::-webkit-scrollbar-thumb:hover {
    background-color: var(--muted-color);
  }

  /* The converted document tints :target (pdf_service.py). Jumping to a page
     from the index left it permanently shaded. Overridden here rather than in
     the generator so it also fixes files that are already converted. */
  :target {
    background-color: transparent;
    box-shadow: none;
  }

  .${MARK_CLASS} {
    background-color: var(--target-tint);
    color: inherit;
    padding: 0.05em 0;
    border-radius: 2px;
    cursor: pointer;
  }

  ${mode === 'focus' ? focusCss : freeCss}
`;

const freeCss = `
  .pagina { display: block; }
`;

/**
 * Focus mode shows a single page filling the viewport. Pages are hidden with
 * display:none rather than moved, so the browser skips laying out the rest of
 * a multi-megabyte document.
 */
const focusCss = `
  /* No height:100% here. Constraining html/body moves scrolling off the window,
     which zeroes window.scrollY and breaks the anchor tracking that saves
     reading progress. The document keeps its normal scroll container. */
  .pagina {
    display: none;
  }

  .pagina[data-focus="1"] {
    display: block;
    min-height: 100vh;
    box-sizing: border-box;
    padding-top: 5vh;
    /* Room for the floating controls so they never cover the last lines. */
    padding-bottom: 12vh;
  }
`;
