import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
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
          A button, not a link.

          An <a> inside a contenteditable is fought over by two parties: the
          browser applies its own rules for anchors in editable content, and
          ProseMirror handles the same mousedown to select the node. A
          ctrl/middle click ended up both opening a tab AND navigating the tab
          the note was in, so the note was lost either way. One deterministic
          in-place navigation is worth more than a new tab that costs you the
          page you came from.

          `anchor` is the block id inside the converted HTML — the reader
          already knows how to scroll to it.
        */}
        <button
          type="button"
          // Keeps ProseMirror from turning the click into a node selection
          // before the navigation runs.
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            navigate(`/source/${sourceId}?anchor=${encodeURIComponent(anchor)}`);
          }}
          className="text-primary-ink underline underline-offset-4 hover:text-ink"
        >
          Open in source
        </button>
      </p>
    </NodeViewWrapper>
  );
};
