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
import { byTop, indexAt } from '../readerIndex';
import { paletteFor } from '../readerPalette';
import { READER_STYLE_ID, readerCss, type ReaderMode } from '../readerStyles';
import { DEFAULT_FONT_SIZE } from '../store/readerPrefsStore';
import { mostVisiblePageIndex } from '../visiblePage';

interface Block {
  id: string;
  top: number;
}

interface Page {
  element: HTMLElement;
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
 * The rest of the palette, derived once the reader picks its own two colours.
 *
 * Rules, tints and muted text are hand-tuned against the two palettes above; on
 * an arbitrary pair they would be anything from invisible to unreadable. Mixing
 * them out of the chosen ink and paper keeps every one of them at a fixed
 * distance from both, whatever the reader picked.
 */
const DERIVED_VARS: Record<string, string> = {
  '--muted-color': 'color-mix(in srgb, var(--text-color) 68%, var(--page-background))',
  '--rule-color': 'color-mix(in srgb, var(--text-color) 22%, var(--page-background))',
  '--target-tint': 'color-mix(in srgb, var(--text-color) 20%, var(--page-background))',
  '--selection-tint': 'color-mix(in srgb, var(--text-color) 32%, var(--page-background))',
};

/** Breathing room either side of a layout-converted page, in CSS pixels. */
const PAGE_GUTTER = 24;

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
  /** Overrides the light/dark palette when set. Null follows the theme. */
  pageColor: string | null;
  textColor: string | null;
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
      pageColor,
      textColor,
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
    /** Page boxes, measured once per reflow. */
    const pages = useRef<Page[]>([]);
    /** Blocks of a page, measured the first time the reader reaches it. */
    const blocksByPage = useRef(new Map<number, Block[]>());
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
     * Re-reads the page boxes. Every reflow has to go through here.
     *
     * Pages only — deliberately. Measuring every block meant a rect per block,
     * and a rect read is a forced layout: on a layout-converted book, where a
     * block is one drawn line, that is tens of thousands of them for a single
     * call. It ran on load, on resize, on every page turn, and on every change
     * to `applySettings` — which is why switching to dark mode used to freeze
     * the reader for seconds on a long document.
     *
     * Blocks are measured one page at a time instead, on the way past. Pages
     * hidden by focus mode have no offsetParent and are left out.
     */
    const measure = useCallback((doc: Document) => {
      const view = doc.defaultView;
      if (!view) return;
      const scrollY = view.scrollY;

      pages.current = Array.from(doc.querySelectorAll<HTMLElement>('.pagina'))
        .filter((element) => element.offsetParent !== null)
        .map((element) => ({
          element,
          top: element.getBoundingClientRect().top + scrollY,
        }))
        .sort(byTop);

      // Every cached offset was measured against the layout being replaced.
      blocksByPage.current.clear();
    }, []);

    /**
     * Blocks of one page, measured on first use and kept until the next reflow.
     *
     * Sorted rather than left in document order: the binary search needs it,
     * and the two only agree while the page reads top to bottom — a
     * layout-converted page emits its lines in reading order, so on a
     * two-column page the whole second column follows the first while sitting
     * above it.
     */
    const blocksOfPage = useCallback((index: number, view: Window): Block[] => {
      const cached = blocksByPage.current.get(index);
      if (cached) return cached;

      const page = pages.current[index];
      if (!page) return [];

      const scrollY = view.scrollY;
      const measured: Block[] = [];
      let rendered = false;

      page.element.querySelectorAll<HTMLElement>(BLOCK_SELECTOR).forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.height > 0) rendered = true;
        measured.push({ id: element.id, top: rect.top + scrollY });
      });

      // A page with nothing to point at has a real, permanent answer.
      if (measured.length === 0) {
        blocksByPage.current.set(index, measured);
        return measured;
      }

      // Every block an empty rect means the browser has not laid this page out
      // yet — `content-visibility: auto` releases a page's contents on the
      // frame after it becomes relevant, and a synchronous scroll can land here
      // first. Caching those offsets would pin the reading position to zero for
      // the rest of the session; leaving it uncached costs one more query on
      // the next tick, by which time the page is real.
      if (!rendered) return [];

      measured.sort(byTop);
      blocksByPage.current.set(index, measured);
      return measured;
    }, []);

    /**
     * Colour only, and kept apart from the rest on purpose.
     *
     * Recolouring does not move a single line, so it must not drag a reflow
     * behind it. While this lived together with the typography, changing the
     * theme invalidated `applySettings`, which the layout effect below depends
     * on — so every dark-mode toggle re-measured the whole document and rewrote
     * its stylesheet. On a book that was seconds of frozen reader for a change
     * the browser can paint on its own.
     */
    const applyPalette = useCallback(
      (doc: Document) => {
        const root = doc.documentElement;

        Object.entries(paletteFor(dark)).forEach(([name, value]) =>
          root.style.setProperty(name, value),
        );

        // After the palette, so a chosen colour wins, and before the derived
        // tokens, which are expressed in terms of these two.
        if (pageColor) root.style.setProperty('--page-background', pageColor);
        if (textColor) root.style.setProperty('--text-color', textColor);
        if (pageColor || textColor) {
          Object.entries(DERIVED_VARS).forEach(([name, value]) =>
            root.style.setProperty(name, value),
          );
        }
      },
      [dark, pageColor, textColor],
    );

    /**
     * Everything that changes where the text sits: type size, page zoom, and
     * the mode stylesheet. Every call here has to be followed by a re-measure.
     */
    const applyLayout = useCallback(
      (doc: Document) => {
        const root = doc.documentElement;
        // Written by the layout converter. Absent on every reflowed document,
        // including the ones converted before this existed.
        const layout = root.dataset.converter === 'layout';

        if (layout) {
          // Nothing to grow: the type size is baked into the page. The same
          // A+/A- drives the zoom instead, on top of the fit-to-width scale, so
          // the control keeps meaning "make this bigger" in both converters.
          const pageWidth = Number(root.dataset.pageWidth);
          const available = root.clientWidth - PAGE_GUTTER * 2;
          const fit = pageWidth > 0 && available > 0 ? available / pageWidth : 1;
          root.style.setProperty('--page-zoom', (fit * (fontSize / DEFAULT_FONT_SIZE)).toFixed(4));
        } else {
          root.style.setProperty('--body-size', `${fontSize}px`);
        }

        let style = doc.getElementById(READER_STYLE_ID) as HTMLStyleElement | null;
        if (!style) {
          style = doc.createElement('style');
          style.id = READER_STYLE_ID;
          doc.head.appendChild(style);
        }

        // Replacing a stylesheet restyles the document whether or not anything
        // in it changed, and only `mode` can change it.
        const css = readerCss(mode, layout);
        if (style.textContent !== css) style.textContent = css;
      },
      [fontSize, mode],
    );

    /**
     * The frame's listeners are attached once, on load, so they close over the
     * first render's callback forever. Resizing has to reach the current one:
     * in a layout-converted document the fit-to-width zoom is a function of the
     * viewport, and a stale closure would refit against the old size.
     */
    const applyLatest = useRef(applyLayout);
    applyLatest.current = applyLayout;

    const reportAnchor = useCallback(
      (doc: Document) => {
        const view = doc.defaultView;
        if (!view || pages.current.length === 0) return;

        const position = view.scrollY + 8;
        // Two searches instead of one over everything: the page, then the block
        // inside it. Only the page being read is ever measured.
        const list = blocksOfPage(indexAt(pages.current, position), view);
        if (list.length === 0) return;

        const found = indexAt(list, position);

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
      [blocksOfPage, onAnchorChange],
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

      const offset = lastOffset.current;
      const settle = () => {
        const top = element.getBoundingClientRect().top + view.scrollY;
        view.scrollTo({ top: Math.max(0, top + offset), ...INSTANT });
      };

      // A block with no box is one the browser has not laid out: a
      // layout-converted document hands each page to `content-visibility:auto`,
      // and the contents of a page nowhere near the viewport are skipped. The
      // page box itself is always exact — its height is declared — so landing
      // on the page is a valid scroll, and by the next frame the page is on
      // screen and the block can be measured for real.
      const page =
        element.getBoundingClientRect().height === 0
          ? element.closest<HTMLElement>('.pagina')
          : null;

      if (!page) {
        settle();
        return true;
      }

      view.scrollTo({
        top: Math.max(0, page.getBoundingClientRect().top + view.scrollY),
        ...INSTANT,
      });
      view.requestAnimationFrame(settle);
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
          // Refit before restoring: the zoom decides where every block lands,
          // so restoring first would anchor against the layout being replaced.
          applyLatest.current(doc);
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
      applyPalette(doc);
      applyLayout(doc);
      repaint(doc);

      // Pages before the anchor: the scroll below reads page boxes to reach a
      // block whose own page may not be rendered yet.
      measure(doc);

      if (mode === 'free' && initialAnchor) {
        scrollToAnchor(doc, initialAnchor, INSTANT);
        lastReported.current = initialAnchor;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      applyLayout,
      applyPalette,
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

      applyLayout(doc);

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
    }, [applyLayout, focusPage, measure, mode, onAnchorChange, restoreAnchor]);

    // Its own effect, with no re-measure: colour cannot move anything.
    useEffect(() => {
      const doc = getDoc();
      if (doc) applyPalette(doc);
    }, [applyPalette]);

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

        // The document's own list, not the measured one: this index has to line
        // up with how the focus effect below numbers pages, and that walks
        // every page including any the current mode is hiding.
        const allPages = Array.from(doc.querySelectorAll<HTMLElement>('.pagina'));
        if (allPages.length === 0) return 1;

        // The block being read wins over the page covering most of the viewport.
        // Both name a page, but only this one agrees with the anchor focus mode
        // restores: choosing by area can land on the neighbouring page, and then
        // there is no reading position left inside it to go back to.
        const anchor = lastReported.current;
        const block = anchor ? doc.getElementById(anchor) : null;
        const owner = block?.closest<HTMLElement>('.pagina') ?? null;
        const anchored = owner ? allPages.indexOf(owner) : -1;
        if (anchored !== -1) return anchored + 1;

        const boxes = allPages.map((page) => {
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
