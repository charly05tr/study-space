import { beforeEach, describe, expect, it } from 'vitest';
import {
  MARK_CLASS,
  clearHighlights,
  noteMarkOf,
  paintHighlights,
  rangesFromSelection,
} from './annotationDom';
import type { AnchorRange, AnnotationType } from '../annotations/types';

/** Mirrors what pdf_service emits: pages of blocks carrying data-pagina + id. */
const CONVERTED = `
<div class="pagina" id="pagina-1">
  <p data-pagina="1" id="b-aaa">The atomic bomb changed everything.</p>
  <p data-pagina="1" id="b-bbb">Hiroshima came first.</p>
  <p data-pagina="1" id="b-ccc">Nagasaki followed three days later.</p>
</div>
<div class="pagina" id="pagina-2">
  <p data-pagina="2" id="b-ddd">The aftermath lasted decades.</p>
</div>
`;

const block = (id: string) => document.getElementById(id) as HTMLElement;
const firstText = (id: string) => block(id).firstChild as Text;

/** Selects from one block's text node to another's, by character offset. */
const select = (fromId: string, start: number, toId: string, end: number) => {
  const range = document.createRange();
  range.setStart(firstText(fromId), start);
  range.setEnd(firstText(toId), end);

  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
};

beforeEach(() => {
  document.body.innerHTML = CONVERTED;
  document.getSelection()?.removeAllRanges();
});

describe('rangesFromSelection', () => {
  it('maps a selection inside one block to a single range', () => {
    select('b-aaa', 4, 'b-aaa', 10); // "atomic"

    const result = rangesFromSelection(document);

    expect(result).not.toBeNull();
    expect(result?.text).toBe('atomic');
    expect(result?.page).toBe(1);
    expect(result?.ranges).toEqual([{ anchor: 'b-aaa', start: 4, end: 10 }]);
  });

  it('splits a selection crossing blocks into one range per block', () => {
    // From "changed..." in the first block through "Hiroshima" in the second.
    select('b-aaa', 16, 'b-bbb', 9);

    const result = rangesFromSelection(document);

    expect(result?.ranges).toEqual([
      { anchor: 'b-aaa', start: 16, end: 35 },
      { anchor: 'b-bbb', start: 0, end: 9 },
    ]);
  });

  it('covers intermediate blocks in full', () => {
    select('b-aaa', 30, 'b-ccc', 8);

    expect(rangesFromSelection(document)?.ranges).toEqual([
      { anchor: 'b-aaa', start: 30, end: 35 },
      { anchor: 'b-bbb', start: 0, end: 21 },
      { anchor: 'b-ccc', start: 0, end: 8 },
    ]);
  });

  it('carries the page of the block the selection starts in', () => {
    select('b-ccc', 0, 'b-ddd', 3);

    const found = rangesFromSelection(document);

    expect(found?.page).toBe(1);
    expect(found?.ranges.map((entry) => entry.anchor)).toEqual(['b-ccc', 'b-ddd']);
  });

  it('returns null for a collapsed selection', () => {
    select('b-aaa', 5, 'b-aaa', 5);

    expect(rangesFromSelection(document)).toBeNull();
  });

  it('returns null when nothing is selected', () => {
    expect(rangesFromSelection(document)).toBeNull();
  });

  it('returns null for whitespace-only selections', () => {
    document.body.innerHTML = '<div class="pagina"><p data-pagina="1" id="b-x">   </p></div>';
    select('b-x', 0, 'b-x', 3);

    expect(rangesFromSelection(document)).toBeNull();
  });
});

describe('paintHighlights', () => {
  const paint = (
    annotationId: number,
    range: AnchorRange,
    annotationType: AnnotationType = 'highlight',
  ) => paintHighlights(document, [{ annotationId, annotationType, range }]);

  it('wraps exactly the selected characters', () => {
    paint(1, { anchor: 'b-aaa', start: 4, end: 10 });

    const marks = document.querySelectorAll(`.${MARK_CLASS}`);
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('atomic');
    expect((marks[0] as HTMLElement).dataset.annotationId).toBe('1');
  });

  it('leaves the block text unchanged', () => {
    const before = block('b-aaa').textContent;
    paint(1, { anchor: 'b-aaa', start: 4, end: 10 });

    expect(block('b-aaa').textContent).toBe(before);
  });

  it('paints several annotations in the same block without corrupting offsets', () => {
    paintHighlights(document, [
      { annotationId: 1, annotationType: 'highlight', range: { anchor: 'b-aaa', start: 0, end: 3 } },
      { annotationId: 2, annotationType: 'highlight', range: { anchor: 'b-aaa', start: 4, end: 10 } },
      { annotationId: 3, annotationType: 'note', range: { anchor: 'b-aaa', start: 16, end: 23 } },
    ]);

    const texts = Array.from(document.querySelectorAll(`.${MARK_CLASS}`)).map(
      (mark) => mark.textContent,
    );
    expect(texts).toEqual(['The', 'atomic', 'changed']);
    expect(block('b-aaa').textContent).toBe('The atomic bomb changed everything.');
  });

  it('paints every block of a multi-block annotation', () => {
    paintHighlights(document, [
      { annotationId: 7, annotationType: 'note', range: { anchor: 'b-aaa', start: 16, end: 35 } },
      { annotationId: 7, annotationType: 'note', range: { anchor: 'b-bbb', start: 0, end: 9 } },
    ]);

    const marks = Array.from(document.querySelectorAll(`.${MARK_CLASS}`));
    expect(marks.map((mark) => mark.textContent)).toEqual([
      'changed everything.',
      'Hiroshima',
    ]);
    expect(marks.every((mark) => (mark as HTMLElement).dataset.annotationId === '7')).toBe(true);
  });

  it('ignores an anchor that no longer exists', () => {
    expect(() => paint(1, { anchor: 'b-gone', start: 0, end: 5 })).not.toThrow();
    expect(document.querySelectorAll(`.${MARK_CLASS}`)).toHaveLength(0);
  });

  it('clamps a range that runs past the end of the block', () => {
    paint(1, { anchor: 'b-bbb', start: 10, end: 9999 });

    expect(document.querySelector(`.${MARK_CLASS}`)?.textContent).toBe('came first.');
  });
});

describe('noteMarkOf', () => {
  const markOfType = (annotationType: AnnotationType) => {
    paintHighlights(document, [
      { annotationId: 5, annotationType, range: { anchor: 'b-aaa', start: 4, end: 10 } },
    ]);
    return document.querySelector<HTMLElement>(`.${MARK_CLASS}`);
  };

  it('finds the mark of a note', () => {
    const mark = markOfType('note');

    expect(noteMarkOf(mark)).toBe(mark);
    expect(noteMarkOf(mark?.firstChild ?? null)).toBe(mark);
  });

  // The reader paints into an iframe, and that document has its own Element
  // constructor. An `instanceof Element` against this window's one is false for
  // every node in there, which is invisible to a same-document test.
  it('resolves a mark living in another document', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const frameDoc = iframe.contentDocument as Document;

    frameDoc.body.innerHTML =
      '<div class="pagina"><p data-pagina="1" id="f-aaa">The atomic bomb.</p></div>';
    paintHighlights(frameDoc, [
      { annotationId: 5, annotationType: 'note', range: { anchor: 'f-aaa', start: 4, end: 10 } },
    ]);

    const mark = frameDoc.querySelector<HTMLElement>(`.${MARK_CLASS}`);
    expect(mark?.textContent).toBe('atomic');
    expect(noteMarkOf(mark)).toBe(mark);
    expect(noteMarkOf(mark?.firstChild ?? null)).toBe(mark);
  });

  it('ignores a highlight mark and plain text', () => {
    const mark = markOfType('highlight');

    expect(noteMarkOf(mark)).toBeNull();
    expect(noteMarkOf(block('b-bbb'))).toBeNull();
    expect(noteMarkOf(null)).toBeNull();
  });
});

describe('clearHighlights', () => {
  it('restores the original markup', () => {
    const before = document.body.innerHTML;

    paintHighlights(document, [
      { annotationId: 1, annotationType: 'highlight', range: { anchor: 'b-aaa', start: 4, end: 10 } },
      { annotationId: 2, annotationType: 'note', range: { anchor: 'b-ccc', start: 0, end: 8 } },
    ]);
    expect(document.querySelectorAll(`.${MARK_CLASS}`).length).toBe(2);

    clearHighlights(document);

    expect(document.querySelectorAll(`.${MARK_CLASS}`)).toHaveLength(0);
    expect(document.body.innerHTML).toBe(before);
  });

  it('leaves a single text node behind so offsets stay computable', () => {
    paintHighlights(document, [
      { annotationId: 1, annotationType: 'highlight', range: { anchor: 'b-aaa', start: 4, end: 10 } },
    ]);
    clearHighlights(document);

    expect(block('b-aaa').childNodes).toHaveLength(1);
    expect(block('b-aaa').firstChild?.nodeType).toBe(Node.TEXT_NODE);
  });
});

describe('selection to paint round trip', () => {
  it('re-highlights exactly the text that was selected', () => {
    select('b-ccc', 9, 'b-ccc', 16); // "followed"? verify against real content
    const found = rangesFromSelection(document);
    const selectedText = found?.text ?? '';

    paintHighlights(
      document,
      (found?.ranges ?? []).map((range) => ({
        annotationId: 42,
        annotationType: 'highlight' as const,
        range,
      })),
    );

    const painted = Array.from(document.querySelectorAll(`.${MARK_CLASS}`))
      .map((mark) => mark.textContent)
      .join('');

    expect(painted).toBe(selectedText);
  });

  it('survives a multi-block round trip', () => {
    select('b-aaa', 4, 'b-ccc', 8);
    const found = rangesFromSelection(document);

    paintHighlights(
      document,
      (found?.ranges ?? []).map((range) => ({
        annotationId: 9,
        annotationType: 'highlight' as const,
        range,
      })),
    );

    const painted = Array.from(document.querySelectorAll(`.${MARK_CLASS}`))
      .map((mark) => mark.textContent)
      .join('');

    // toString() of a cross-block range includes the whitespace between blocks,
    // so compare against the concatenated block slices instead.
    expect(painted).toBe('atomic bomb changed everything.Hiroshima came first.Nagasaki');
  });
});

describe('clearHighlights', () => {
  /** One repaint: what the frame does whenever the annotation list changes. */
  const repaint = (targets: Array<{ annotationId: number; range: AnchorRange }>) => {
    clearHighlights(document);
    paintHighlights(
      document,
      targets.map(({ annotationId, range }) => ({
        annotationId,
        annotationType: 'highlight' as AnnotationType,
        range,
      })),
    );
  };

  it('takes the shading off the text', () => {
    repaint([{ annotationId: 1, range: { anchor: 'b-aaa', start: 4, end: 10 } }]);
    const before = block('b-aaa').textContent;

    clearHighlights(document);

    expect(document.querySelectorAll(`.${MARK_CLASS}`)).toHaveLength(0);
    expect(block('b-aaa').textContent).toBe(before);
  });

  it('leaves the surviving annotations painted when one is deleted', () => {
    repaint([
      { annotationId: 1, range: { anchor: 'b-aaa', start: 0, end: 3 } },
      { annotationId: 2, range: { anchor: 'b-aaa', start: 4, end: 10 } },
    ]);

    repaint([{ annotationId: 1, range: { anchor: 'b-aaa', start: 0, end: 3 } }]);

    const marks = document.querySelectorAll<HTMLElement>(`.${MARK_CLASS}`);
    expect(Array.from(marks, (mark) => mark.dataset.annotationId)).toEqual(['1']);
  });

  it('stitches the text back so the next paint still lands on the right characters', () => {
    // The bug this guards: unwrapping a mark leaves the block split across
    // several text nodes, and offsets are counted over that sequence. If the
    // pieces are not merged again the next paint is measured against a
    // different shape of the same text.
    repaint([{ annotationId: 1, range: { anchor: 'b-aaa', start: 4, end: 10 } }]);
    repaint([{ annotationId: 2, range: { anchor: 'b-aaa', start: 11, end: 15 } }]);

    const marks = document.querySelectorAll(`.${MARK_CLASS}`);
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('bomb');
  });

  it('clears a mark that was painted across several text nodes', () => {
    repaint([{ annotationId: 1, range: { anchor: 'b-aaa', start: 0, end: 3 } }]);
    repaint([{ annotationId: 2, range: { anchor: 'b-aaa', start: 4, end: 10 } }]);

    clearHighlights(document);

    expect(document.querySelectorAll(`.${MARK_CLASS}`)).toHaveLength(0);
    expect(block('b-aaa').childNodes).toHaveLength(1);
  });
});
