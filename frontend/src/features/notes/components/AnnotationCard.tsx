import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { Link } from 'react-router-dom';
import type { AnnotationNodeAttributes } from '../annotationNode';

/**
 * A quote pulled out of a source, rendered inside a note.
 *
 * Everything shown here comes from the node's own attributes rather than a
 * lookup: a note has to read the same a year from now, even if the annotation
 * was deleted in the reader. The `annotationId` is kept so the two can still be
 * reconciled — the text is a copy, the link is the reference.
 */
export const AnnotationCard = ({ node, selected }: ReactNodeViewProps) => {
  const { sourceId, sourceTitle, page, anchor, content, annotationType } =
    node.attrs as AnnotationNodeAttributes;

  const isNote = annotationType === 'note';

  return (
    <NodeViewWrapper
      // contentEditable={false} is implied by the atom node, but the card still
      // has to opt out of the prose margins to sit flush with the text.
      className={`not-prose my-6 border-l-2 pl-4 transition-colors ${
        selected ? 'border-primary bg-tint/60' : 'border-primary/50'
      }`}
    >
      <p className="font-heading text-[0.68rem] uppercase tracking-[0.16em] text-muted">
        {isNote ? 'Note' : 'Highlight'}
      </p>

      <blockquote className="mt-1 font-body text-ink italic">{content}</blockquote>

      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
        <span className="truncate">{sourceTitle}</span>
        <span aria-hidden>·</span>
        <span>Page {page}</span>
        <span aria-hidden>·</span>
        {/*
          A real link, not a button: the anchor is a location, so middle-click
          and open-in-new-tab should work. `anchor` is the block id inside the
          converted HTML — the reader already knows how to scroll to it.
        */}
        <Link
          to={`/source/${sourceId}?anchor=${encodeURIComponent(anchor)}&page=${page}`}
          className="text-primary-ink underline underline-offset-4 hover:text-ink"
        >
          Open in source
        </Link>
      </p>
    </NodeViewWrapper>
  );
};
