import type { Annotation } from '../../annotations/types';
import type { NoteHover } from '../noteCard';

interface NoteTooltipProps {
  annotation: Annotation;
  hover: NoteHover;
  pinned: boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onClick: () => void;
}

/** Space a card needs above its mark before it flips underneath instead. */
const ROOM_ABOVE = 170;

/**
 * Reading card for a note mark hovered inside the frame.
 *
 * Rendered in the parent document — the frame only reports where the mark is —
 * so it is not clipped by the frame and follows the app's own styling.
 *
 * Its coordinates are the mark's, re-measured on every scroll, so `fixed`
 * positioning still leaves the card travelling with the text it belongs to.
 */
export const NoteTooltip = ({
  annotation,
  hover,
  pinned,
  onPointerEnter,
  onPointerLeave,
  onClick,
}: NoteTooltipProps) => {
  // Nothing clamps the card into view any more — that would peg it to the
  // viewport, which is exactly what it must not do. It flips below its mark
  // instead, and scrolls away with the text like any other page content.
  const below = hover.top < ROOM_ABOVE;

  return (
    <div
      role="tooltip"
      aria-label={'Note'}
      style={{ top: below ? hover.bottom + 8 : hover.top - 8, left: hover.left }}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      onClick={onClick}
      className={`fixed z-30 w-72 max-w-[80vw] -translate-x-1/2 cursor-pointer rounded-xs border bg-page p-3 ${
        below ? '' : '-translate-y-full'
      } ${pinned ? 'border-primary' : 'border-rule'}`}
    >
      <span className="font-heading text-xs uppercase tracking-[0.12em] text-muted">
        {'Note'}
      </span>
      <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{annotation.content}</p>
    </div>
  );
};
