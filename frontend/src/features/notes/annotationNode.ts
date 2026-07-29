import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { AnnotationType } from '../annotations/types';
import { AnnotationCard } from './components/AnnotationCard';

export interface AnnotationNodeAttributes {
  /** The row this was pulled from. Kept for reconciliation, not for rendering. */
  annotationId: number | null;
  sourceId: number | null;
  sourceTitle: string;
  page: number | null;
  /** Block id inside the source's converted HTML — what the reader scrolls to. */
  anchor: string;
  content: string;
  annotationType: AnnotationType;
}

const ATTRIBUTE_MAP: Record<keyof AnnotationNodeAttributes, string> = {
  annotationId: 'data-annotation-id',
  sourceId: 'data-source-id',
  sourceTitle: 'data-source-title',
  page: 'data-page',
  anchor: 'data-anchor',
  content: 'data-content',
  annotationType: 'data-annotation-type',
};

/**
 * A quote lifted out of a source and embedded in a note.
 *
 * An atom: the text is not editable in place, because it is a record of what
 * the source says. Editing it inside the note would quietly turn a citation
 * into a paraphrase while still pointing at the original page.
 *
 * The quote is stored on the node rather than fetched by id. That is a
 * deliberate copy: it costs a little duplication and buys a note that still
 * reads if the annotation is deleted, and that renders with no request fan-out.
 */
export const AnnotationNode = Node.create({
  name: 'annotation',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return Object.fromEntries(
      Object.entries(ATTRIBUTE_MAP).map(([name, attribute]) => [
        name,
        {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute(attribute),
          renderHTML: (attributes: Record<string, unknown>) =>
            attributes[name] == null ? {} : { [attribute]: String(attributes[name]) },
        },
      ]),
    );
  },

  parseHTML() {
    return [{ tag: 'aside[data-annotation-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // Only reached by copy/paste and getHTML(); the note itself is stored as
    // JSON, where the attributes round-trip on their own.
    return ['aside', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AnnotationCard);
  },
});
