import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import type { Annotation, AnchorRange } from '../../annotations/types';
import {
  BLOCK_SELECTOR,
  clearHighlights,
  markById,
  noteMarkOf,
  paintHighlights,
  rangesFromSelection,
  scrollToAnchor,
} from '../annotationDom';
import type { NoteHover } from '../noteCard';
import { READER_STYLE_ID, readerCss, type ReaderMode } from '../readerStyles';
import { mostVisiblePageIndex } from '../visiblePage';

interface Block {
  id: string;
  top: number;
}

/**
 * The converted document sets `html { scroll-behavior: smooth }`, so any
 * scroll call without an explicit behavior animates — which both looks wrong
 * for a page turn and makes the measurement below read a position the browser
 * has not reached yet.
 */
const INSTANT = { behavior: 'instant' } as const;

/**
 * Dark palette over the converted document's own :root variables. 13.5:1 body,
 * 6.1:1 muted.
 *
 * --selection-tint is deliberately a deeper gold than --target-tint: a live
 * selection and a saved highlight sit side by side in this document, and if
 * they shared a colour there would be no telling which is which.
 */
const DARK_VARS: Record<string, string> = {
  '--page-background': '#1c1b21',
  '--text-color': '#e8e4da',
  '--muted-color': '#a09a8c',
  '--rule-color': '#34323a',
  '--target-tint': '#4a4128',
  '--selection-tint': '#5f5330', // 6.0:1 under --text-color
};

const LIGHT_VARS: Record<string, string> = {
  '--page-background': '#fdfbf7',
  '--text-color': '#3d3b49',
  '--muted-color': '#6f685c',
  '--rule-color': '#e6e0d4',
  '--target-tint': '#f3e8cd',
  '--selection-tint': '#ecd694', // 7.6:1 under --text-color
};

export interface SelectionInfo {
  ranges: AnchorRange[];
  page: number;
  text: string;
  /** Viewport coordinates of the parent document, ready for a fixed-position toolbar. */
  top: number;
  left: number;
}

export interface ReaderFrameHandle {
  scrollToAnchor: (anchor: string) => void;
  clearSelection: () => void;
  /** Page holding the block currently being read; used when entering focus mode. */
  currentPageFromReading: () => number;
}

interface ReaderFrameProps {
  html: string;
  title: string;
  initialAnchor: string;
  fontSize: number;
  dark: boolean;
  mode: ReaderMode;
  /**
   * Controlled: which page focus mode shows. The frame never decides this on
   * its own — keeping it as internal ref state alongside React state was what
   * made paging unreliable.
   */
  focusPage: number;
  annotations: Annotation[];
  onAnchorChange: (anchor: string) => void;
  onSelection: (selection: SelectionInfo | null) => void;
  /** Note mark under the pointer, or null when it leaves. */
  onNoteHover: (hover: NoteHover | null) => void;
  /**
   * Controlled: the note whose card is on screen. The frame re-measures it on
   * every scroll so the card travels with the text rather than with the
   * viewport — by id, because the pointer has usually left the mark by then.
   */
  trackedNoteId: number | null;
  onNoteMove: (hover: NoteHover) => void;
  onPagesCounted: (total: number) => void;
  /** Keyboard paging from inside the frame, where key events do not bubble out. */
  onNavigate: (delta: number) => void;
}

/**
 * Renders the converted source inside an iframe.
 *
 * An iframe rather than dangerouslySetInnerHTML because the converted file is a
 * complete HTML document: its own <head>, an @import for its webfont, and global
 * body/p/h1..h6 rules that would otherwise restyle the whole app. It also lets
 * the browser parse a multi-megabyte document natively.
 *
 * The blob: URL is same-origin with this document, so the parent can read the
 * frame's DOM directly — no postMessage bridge.
 */
export const ReaderFrame = forwardRef<ReaderFrameHandle, ReaderFrameProps>(
  (
    {
      html,
      title,
      initialAnchor,
      fontSize,
      dark,
      mode,
      focusPage,
      annotations,
      onAnchorChange,
      onSelection,
      onNoteHover,
      trackedNoteId,
      onNoteMove,
      onPagesCounted,
      onNavigate,
    },
    ref,
  ) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const blocks = useRef<Block[]>([]);
    const lastReported = useRef<string | null>(null);
    /** Pixels between the anchor block's top and the viewport top. */
    const lastOffset = useRef(0);
    const frameRequest = useRef<number | null>(null);
    const ready = useRef(false);
    const hoveredMark = useRef<HTMLElement | null>(null);
    /**
     * What the focus effect saw last time. Turning a page and entering focus
     * mode both reach that effect, and only one of them should start the reader
     * at the top of the page.
     */
    const previous = useRef({ mode, focusPage });

    // Read from inside frame listeners, which are attached once on load and
    // would otherwise capture the first render's props forever.
    const latest = useRef({ onNavigate, onSelection, onNoteHover, onNoteMove, trackedNoteId });
    latest.current = { onNavigate, onSelection, onNoteHover, onNoteMove, trackedNoteId };

    const blobUrl = useMemo(
      () => URL.createObjectURL(new Blob([html], { type: 'text/html' })),
      [html],
    );

    useEffect(() => () => URL.revokeObjectURL(blobUrl), [blobUrl]);

    const getDoc = () => {
      const doc = iframeRef.current?.contentDocument;
      return doc && ready.current ? doc : null;
    };

    /**
     * Offsets measured once, then binary-searched on scroll. Reading a rect per
     * block per scroll event is unusable at tens of thousands of blocks.
     * Hidden blocks (focus mode) have no offsetParent and are skipped.
     */
    const measure = useCallback((doc: Document) => {
      const view = doc.defaultView;
      if (!view) return;
      const scrollY = view.scrollY;
      blocks.current = Array.from(doc.querySelectorAll<HTMLElement>(BLOCK_SELECTOR))
        .filter((element) => element.offsetParent !== null)
        .map((element) => ({
          id: element.id,
          top: element.getBoundingClientRect().top + scrollY,
        }));
    }, []);

    const applySettings = useCallback(
      (doc: Document) => {
        const root = doc.documentElement;
        const palette = dark ? DARK_VARS : LIGHT_VARS;
        Object.entries(palette).forEach(([name, value]) => root.style.setProperty(name, value));
        root.style.setProperty('--body-size', `${fontSize}px`);

        let style = doc.getElementById(READER_STYLE_ID) as HTMLStyleElement | null;
        if (!style) {
          style = doc.createElement('style');
          style.id = READER_STYLE_ID;
          doc.head.appendChild(style);
        }
        style.textContent = readerCss(mode);
      },
      [dark, fontSize, mode],
    );

    /** Index of the last measured block starting at or above a document position. */
    const blockIndexAt = useCallback((position: number) => {
      const list = blocks.current;
      let low = 0;
      let high = list.length - 1;
      let found = 0;
      while (low <= high) {
        const middle = (low + high) >> 1;
        if (list[middle].top <= position) {
          found = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      return found;
    }, []);

    const reportAnchor = useCallback(
      (doc: Document) => {
        const view = doc.defaultView;
        const list = blocks.current;
        if (!view || list.length === 0) return;

        const found = blockIndexAt(view.scrollY + 8);

        // How far past the block's top the viewport sits. Blocks are taller than
        // a line, so restoring the block alone lands above where you were
        // reading; this is the remainder that makes the restore exact.
        lastOffset.current = view.scrollY - list[found].top;

        const anchor = list[found].id;
        if (anchor !== lastReported.current) {
          lastReported.current = anchor;
          onAnchorChange(anchor);
        }
      },
      [blockIndexAt, onAnchorChange],
    );

    /**
     * Puts the reader back exactly where it was after a reflow: the anchor
     * gives the block, the stored remainder gives the position inside it.
     *
     * Returns false when there is nothing to restore, so callers that need the
     * document to end up somewhere can fall back.
     */
    const restoreAnchor = useCallback((doc: Document) => {
      const view = doc.defaultView;
      const anchor = lastReported.current;
      if (!view || !anchor) return false;

      const element = doc.getElementById(anchor);
      if (!element) return false;

      const top = element.getBoundingClientRect().top + view.scrollY;
      view.scrollTo({ top: Math.max(0, top + lastOffset.current), ...INSTANT });
      return true;
    }, []);

    /**
     * Emits at most once per mark: `mouseover` fires for every element under
     * the pointer, and a mark can wrap several inline nodes.
     */
    /** Where a mark sits, in the parent's viewport. Null if it cannot be placed. */
    const hoverFrom = useCallback((mark: HTMLElement): NoteHover | null => {
      const frame = iframeRef.current?.getBoundingClientRect();
      const annotationId = Number(mark.dataset.annotationId);
      // A mark on a page focus mode has hidden measures as a zero-sized rect at
      // the document origin, which would fling the card into the corner.
      if (!frame || !annotationId || !mark.offsetParent) return null;

      // Frame-relative rect plus the frame's own position = parent viewport.
      const rect = mark.getBoundingClientRect();
      return {
        annotationId,
        top: frame.top + rect.top,
        bottom: frame.top + rect.bottom,
        left: frame.left + rect.left + rect.width / 2,
      };
    }, []);

    const emitNoteHover = useCallback(
      (mark: HTMLElement | null) => {
        if (mark === hoveredMark.current) return;

        const hover = mark && hoverFrom(mark);
        hoveredMark.current = hover ? mark : null;
        latest.current.onNoteHover(hover);
      },
      [hoverFrom],
    );

    /** Re-anchors the open card to its mark after the document moved under it. */
    const trackNote = useCallback(
      (doc: Document) => {
        const id = latest.current.trackedNoteId;
        if (id === null) return;

        const mark = markById(doc, id);
        const hover = mark && hoverFrom(mark);
        if (hover) latest.current.onNoteMove(hover);
      },
      [hoverFrom],
    );

    const repaint = useCallback(
      (doc: Document) => {
        // The hovered mark is about to be removed and re-created, so the card
        // would be pointing at a node that no longer exists.
        emitNoteHover(null);
        clearHighlights(doc);
        paintHighlights(
          doc,
          annotations.flatMap((annotation) =>
            annotation.ranges.map((range) => ({
              annotationId: annotation.id,
              annotationType: annotation.annotation_type,
              range,
            })),
          ),
        );
      },
      [annotations, emitNoteHover],
    );

    const emitSelection = useCallback((doc: Document) => {
      const found = rangesFromSelection(doc);
      if (!found) {
        latest.current.onSelection(null);
        return;
      }

      const domRange = doc.getSelection()?.getRangeAt(0);
      const frame = iframeRef.current?.getBoundingClientRect();
      if (!domRange || !frame) return;

      // Frame-relative rect plus the frame's own position = parent viewport.
      const rect = domRange.getBoundingClientRect();
      latest.current.onSelection({
        ranges: found.ranges,
        page: found.page,
        text: found.text,
        top: frame.top + rect.top,
        left: frame.left + rect.left + rect.width / 2,
      });
    }, []);

    const handleLoad = useCallback(() => {
      const doc = iframeRef.current?.contentDocument;
      const view = doc?.defaultView;
      if (!doc || !view) return;

      ready.current = true;
      onPagesCounted(doc.querySelectorAll('.pagina').length);

      const onScroll = () => {
        if (frameRequest.current !== null) return;
        frameRequest.current = view.requestAnimationFrame(() => {
          frameRequest.current = null;
          reportAnchor(doc);
          trackNote(doc);
        });
      };

      view.addEventListener('scroll', onScroll, { passive: true });
      // Same reasoning as the mode switch: a resize reflows the document (this
      // fires on leaving fullscreen), so the position has to be re-anchored,
      // not just re-measured.
      view.addEventListener(
        'resize',
        () => {
          restoreAnchor(doc);
          measure(doc);
        },
        { passive: true },
      );
      doc.addEventListener('mouseover', (event) => emitNoteHover(noteMarkOf(event.target)));
      doc.addEventListener('mouseout', (event) => {
        // Moving onto a child of the same mark also fires mouseout; only a
        // pointer that actually left every note mark should close the card.
        if (!noteMarkOf(event.relatedTarget)) emitNoteHover(null);
      });

      // mouseup, not selectionchange: the latter fires on every drag tick.
      doc.addEventListener('mouseup', () => emitSelection(doc));
      doc.addEventListener('keyup', () => emitSelection(doc));

      doc.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight' || event.key === 'PageDown') {
          latest.current.onNavigate(1);
        } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
          latest.current.onNavigate(-1);
        }
      });

      // The layout effects below run after this, applying styles, paging and
      // highlights against a document that is now ready.
      ready.current = true;
      applySettings(doc);
      repaint(doc);

      if (mode === 'free' && initialAnchor) {
        doc.getElementById(initialAnchor)?.scrollIntoView(INSTANT);
        lastReported.current = initialAnchor;
      }
      measure(doc);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      applySettings,
      emitNoteHover,
      emitSelection,
      initialAnchor,
      measure,
      onPagesCounted,
      repaint,
      reportAnchor,
      trackNote,
    ]);

    /**
     * Single owner of what focus mode displays. Runs on mode change, on page
     * change, and whenever typography reflows the document.
     */
    useEffect(() => {
      const doc = getDoc();
      if (!doc) return;

      // A page turn is the only transition that belongs at the top of a page.
      // Entering focus mode, and reflowing while already inside it, have to keep
      // the reader on the line being read.
      const turned = previous.current.mode === 'focus' && previous.current.focusPage !== focusPage;
      previous.current = { mode, focusPage };

      applySettings(doc);

      if (mode !== 'focus') {
        // Leaving focus, only one page had been laid out, so scrollY is a small
        // number. Revealing every page makes the document tall and that same
        // scrollY now lands near the beginning — the reader appears to jump
        // backwards. Nothing moved the page; the content grew underneath it.
        // Re-anchoring on the block being read is what actually restores it.
        // This also keeps the position when typography reflows the document.
        measure(doc);
        restoreAnchor(doc);
        return;
      }

      const pages = Array.from(doc.querySelectorAll<HTMLElement>('.pagina'));
      if (pages.length === 0) return;

      const index = Math.min(Math.max(focusPage, 1), pages.length) - 1;
      pages.forEach((element, position) => {
        if (position === index) element.dataset.focus = '1';
        else delete element.dataset.focus;
      });

      // After the pages above are hidden, so the offsets describe the layout
      // the restore below is about to scroll through.
      measure(doc);

      // Only the shown page is laid out: an anchor on any other page measures as
      // a zero rect and would restore to a meaningless position.
      const anchored =
        lastReported.current !== null &&
        pages[index].contains(doc.getElementById(lastReported.current));

      if (!turned && anchored && restoreAnchor(doc)) return;

      doc.defaultView?.scrollTo({ top: 0, ...INSTANT });

      const first = pages[index].querySelector<HTMLElement>(BLOCK_SELECTOR);
      if (first?.id && first.id !== lastReported.current) {
        lastReported.current = first.id;
        onAnchorChange(first.id);
      }
    }, [applySettings, focusPage, measure, mode, onAnchorChange, restoreAnchor]);

    useEffect(() => {
      const doc = getDoc();
      if (doc) repaint(doc);
    }, [repaint]);

    useImperativeHandle(ref, () => ({
      scrollToAnchor: (anchor) => {
        const doc = getDoc();
        if (doc) scrollToAnchor(doc, anchor);
      },
      clearSelection: () => {
        getDoc()?.getSelection()?.removeAllRanges();
      },
      currentPageFromReading: () => {
        const doc = getDoc();
        const view = doc?.defaultView;
        if (!doc || !view) return 1;

        const pages = Array.from(doc.querySelectorAll<HTMLElement>('.pagina'));
        if (pages.length === 0) return 1;

        // The block being read wins over the page covering most of the viewport.
        // Both name a page, but only this one agrees with the anchor focus mode
        // restores: choosing by area can land on the neighbouring page, and then
        // there is no reading position left inside it to go back to.
        const anchor = lastReported.current;
        const block = anchor ? doc.getElementById(anchor) : null;
        const owner = block?.closest<HTMLElement>('.pagina') ?? null;
        const anchored = owner ? pages.indexOf(owner) : -1;
        if (anchored !== -1) return anchored + 1;

        const boxes = pages.map((page) => {
          const rect = page.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom };
        });

        // Returns a position in this same list rather than data-pagina, so it
        // cannot disagree with how the focus effect indexes pages.
        return mostVisiblePageIndex(boxes, view.innerHeight) + 1;
      },
    }));

    return (
      <iframe
        ref={iframeRef}
        src={blobUrl}
        title={title}
        onLoad={handleLoad}
        className="h-full w-full border-0"
      />
    );
  },
);

ReaderFrame.displayName = 'ReaderFrame';
