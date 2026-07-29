import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { RelationKind } from '../blocks/types';
import { BlockLinkChip } from './components/BlockLinkChip';

export interface BlockLinkAttributes {
  targetId: string | null;
  /** Where the target lives, so the chip can navigate without a lookup. */
  targetNoteId: number | null;
  kind: RelationKind;
  /** Snapshot of the target's text at the time of writing — see below. */
  label: string;
}

const ATTRIBUTE_MAP: Record<keyof BlockLinkAttributes, string> = {
  targetId: 'data-target-id',
  targetNoteId: 'data-target-note',
  kind: 'data-kind',
  label: 'data-label',
};

/**
 * A typed relation written inside the text — the `[[` mention.
 *
 * Inline and atom: it is a reference, not prose. It carries no id of its own,
 * because the edge belongs to the block that contains it; that is exactly what
 * `extract_links` in block_service.py reads.
 *
 * `label` is a copy of the target's text, for the same reason the annotation
 * node copies its quote: the chip has to render without fetching, and a note
 * whose target was deleted should still read as a sentence. The database is the
 * authority on the relation; this is a legible stand-in.
 */
export const BlockLinkNode = Node.create({
  name: 'blockLink',
  group: 'inline',
  inline: true,
  atom: true,

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
    return [{ tag: 'span[data-target-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlockLinkChip);
  },
});
