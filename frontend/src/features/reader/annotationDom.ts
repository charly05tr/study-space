import type { AnchorRange, AnnotationType } from '../annotations/types';

export const BLOCK_SELECTOR = '[data-pagina][id]';
export const MARK_CLASS = 'studyspace-mark';

/**
 * Element to start a `closest()` walk from.
 *
 * Checks `nodeType` rather than `instanceof Element`: these nodes come from the
 * reader iframe, and that document has its own Element constructor, so an
 * instanceof against this window's one is always false.
 */
const elementOf = (node: EventTarget | null): Element | null => {
  const candidate = node as Node | null;
  if (!candidate || typeof candidate.nodeType !== 'number') return null;
  return candidate.nodeType === Node.ELEMENT_NODE
    ? (candidate as Element)
    : (candidate.parentElement ?? null);
};

/** Nearest converted-document block that owns a node. */
const blockOf = (node: Node | null): HTMLElement | null =>
  elementOf(node)?.closest<HTMLElement>(BLOCK_SELECTOR) ?? null;

/** Ordered text nodes of a block, with the character offset each one starts at. */
const textNodesOf = (block: Element): Array<{ node: Text; start: number }> => {
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; start: number }> = [];
  let offset = 0;

  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    nodes.push({ node: text, start: offset });
    offset += text.length;
    current = walker.nextNode();
  }
  return nodes;
};

const textLengthOf = (block: Element): number =>
  textNodesOf(block).reduce((total, entry) => total + entry.node.length, 0);

/** Character offset of (node, offset) measured from the start of the block. */
const offsetWithinBlock = (block: Element, node: Node, offset: number): number => {
  if (node === block) return 0;

  for (const entry of textNodesOf(block)) {
    if (entry.node === node) return entry.start + offset;
  }
  return 0;
};

/**
 * Converts a live selection into anchor-relative ranges.
 *
 * Offsets are counted in characters inside a block rather than as DOM paths,
 * which is what makes a highlight survive re-conversion: the block anchor is
 * derived from its content, and the text inside it does not move.
 */
export const rangesFromSelection = (
  doc: Document,
): { ranges: AnchorRange[]; page: number; text: string } | null => {
  const selection = doc.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const domRange = selection.getRangeAt(0);
  const text = domRange.toString().trim();
  if (!text) return null;

  const startBlock = blockOf(domRange.startContainer);
  const endBlock = blockOf(domRange.endContainer);
  if (!startBlock || !endBlock) return null;

  const startOffset = offsetWithinBlock(startBlock, domRange.startContainer, domRange.startOffset);
  const endOffset = offsetWithinBlock(endBlock, domRange.endContainer, domRange.endOffset);
  const page = Number(startBlock.dataset.pagina ?? 0);

  if (startBlock === endBlock) {
    if (endOffset <= startOffset) return null;
    return {
      ranges: [{ anchor: startBlock.id, start: startOffset, end: endOffset }],
      page,
      text,
    };
  }

  // Multi-block selection: head, whole middles, tail.
  const blocks = Array.from(doc.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
  const from = blocks.indexOf(startBlock);
  const to = blocks.indexOf(endBlock);
  if (from === -1 || to === -1 || to < from) return null;

  const ranges: AnchorRange[] = [];
  for (let index = from; index <= to; index += 1) {
    const block = blocks[index];
    const length = textLengthOf(block);
    const start = index === from ? startOffset : 0;
    const end = index === to ? endOffset : length;
    if (end > start) ranges.push({ anchor: block.id, start, end });
  }

  return ranges.length > 0 ? { ranges, page, text } : null;
};

/** Removes every painted mark and stitches the split text nodes back together. */
export const clearHighlights = (doc: Document) => {
  doc.querySelectorAll<HTMLElement>(`.${MARK_CLASS}`).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
};

interface PaintTarget {
  annotationId: number;
  annotationType: AnnotationType;
  range: AnchorRange;
}

/**
 * Wraps each range in a <mark>. Ranges are resolved against the current DOM, so
 * this must run after the frame has loaded and after any clearHighlights().
 */
export const paintHighlights = (doc: Document, targets: PaintTarget[]) => {
  targets.forEach(({ annotationId, annotationType, range }) => {
    const block = doc.getElementById(range.anchor);
    if (!block) return;

    // Collected before mutating: wrapping splits text nodes and would
    // invalidate offsets computed from a live walk.
    const slices: Array<{ node: Text; from: number; to: number }> = [];

    for (const { node, start } of textNodesOf(block)) {
      const nodeEnd = start + node.length;
      if (nodeEnd <= range.start || start >= range.end) continue;
      slices.push({
        node,
        from: Math.max(0, range.start - start),
        to: Math.min(node.length, range.end - start),
      });
    }

    slices.forEach(({ node, from, to }) => {
      if (to <= from) return;
      const domRange = doc.createRange();
      domRange.setStart(node, from);
      domRange.setEnd(node, to);

      const mark = doc.createElement('mark');
      mark.className = MARK_CLASS;
      mark.dataset.annotationId = String(annotationId);
      mark.dataset.annotationType = annotationType;
      try {
        domRange.surroundContents(mark);
      } catch {
        // Range crossing element boundaries: skip rather than corrupt the DOM.
      }
    });
  });
};

/** The painted note mark owning a node, if the node sits inside one. */
export const noteMarkOf = (node: EventTarget | null): HTMLElement | null =>
  elementOf(node)?.closest<HTMLElement>(`.${MARK_CLASS}[data-annotation-type="note"]`) ?? null;

/**
 * First painted mark of an annotation. The card is re-measured from it on
 * scroll, and the pointer is long gone by then, so it is looked up by id
 * rather than remembered as a node.
 */
export const markById = (doc: Document, annotationId: number): HTMLElement | null =>
  doc.querySelector<HTMLElement>(`.${MARK_CLASS}[data-annotation-id="${annotationId}"]`);

/**
 * Scrolls to a block, whether or not its page has been rendered yet.
 *
 * A layout-converted document hands every page to `content-visibility: auto`,
 * so the contents of a page the reader is nowhere near are skipped and a block
 * inside one has no box to scroll to. Its page always does — the height is
 * declared on the element — so the jump is taken in two steps: land on the
 * page, then centre on the block once the browser has laid the page out.
 */
export const scrollToAnchor = (
  doc: Document,
  anchor: string,
  options: ScrollIntoViewOptions = { block: 'center' },
) => {
  const element = doc.getElementById(anchor);
  if (!element) return;

  if (element.getBoundingClientRect().height > 0) {
    element.scrollIntoView(options);
    return;
  }

  const page = element.closest('.pagina');
  if (!page) {
    element.scrollIntoView(options);
    return;
  }

  page.scrollIntoView({ ...options, block: 'start' });
  doc.defaultView?.requestAnimationFrame(() => element.scrollIntoView(options));
};
