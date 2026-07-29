import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../../components/ui/cn';
import { RELATION_LABEL } from '../../blocks/types';
import type { BlockLinkAttributes } from '../blockLinkNode';

/**
 * The `[[` mention as it reads inside a sentence.
 *
 * The relation type is shown, not hidden behind a hover: "contradicts" is the
 * thought the writer had, and a chip that only shows the target text throws it
 * away at exactly the moment it should be visible.
 */
export const BlockLinkChip = ({ node, selected }: ReactNodeViewProps) => {
  const navigate = useNavigate();
  const { targetNoteId, kind, label } = node.attrs as BlockLinkAttributes;

  return (
    <NodeViewWrapper as="span" className="inline">
      <button
        type="button"
        // Same reasoning as AnnotationCard: an <a> inside a contenteditable is
        // fought over by the browser and ProseMirror.
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (targetNoteId) navigate(`/note/${targetNoteId}`);
        }}
        className={cn(
          'mx-0.5 inline items-baseline rounded-xs border-b px-1 text-left align-baseline transition-colors',
          selected
            ? 'border-primary bg-tint text-ink'
            : 'border-primary/40 text-ink hover:border-primary hover:bg-tint/50',
        )}
      >
        <span className="mr-1 font-heading text-[0.6rem] uppercase tracking-[0.14em] text-muted">
          {RELATION_LABEL[kind] ?? kind}
        </span>
        {label}
      </button>
    </NodeViewWrapper>
  );
};
