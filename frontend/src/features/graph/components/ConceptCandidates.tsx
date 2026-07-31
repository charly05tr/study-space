import { useState } from 'react';
import { cn } from '../../../components/ui/cn';
import { usePromotableBlocks } from '../../blocks/hooks/usePromotableBlocks';

interface ConceptCandidatesProps {
  studyspaceId: number;
  onPromote: (blockId: string) => void;
  promotingId: string | null;
}

/**
 * The blocks that are NOT on the map, and the way onto it.
 *
 * The map draws concepts, and a concept is anchored by a heading, an annotation
 * or a deliberate promotion. Everything else was absorbed into a larger idea or
 * hangs under no heading at all — which is the right default, but only if the
 * absorbed half stays reachable. Without this panel a note written as a flat
 * dump would declare no concepts and offer no way to declare any, and the
 * feature would read as "the map lost my notes".
 *
 * Closed by default. It is the longer of the two lists and it is not what the
 * map is for; you come here when an idea you wanted is missing.
 */
export const ConceptCandidates = ({
  studyspaceId,
  onPromote,
  promotingId,
}: ConceptCandidatesProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { data, isPending } = usePromotableBlocks(studyspaceId, query, open);
  const blocks = data ?? [];

  return (
    // Width comes from whoever places it: inside the HUD it shares the search
    // column, and on the empty state it stands on its own.
    <div className="pointer-events-auto w-full rounded-xs border border-rule bg-page/90 backdrop-blur-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="font-heading text-[0.6rem] uppercase tracking-[0.16em] text-muted">
          Not on the map
        </span>
        <span className="font-heading text-[0.6rem] text-muted">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="border-t border-rule">
          <input
            type="search"
            value={query}
            placeholder="Find a block"
            aria-label="Find a block to promote"
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent px-3 py-2 font-body text-sm text-ink placeholder:text-muted/60 focus:outline-none"
          />

          {isPending ? (
            <p className="px-3 pb-3 text-xs text-muted">Looking…</p>
          ) : blocks.length === 0 ? (
            <p className="px-3 pb-3 text-xs text-muted">
              {query
                ? 'Nothing matches.'
                : 'Every block belongs to an idea on the map.'}
            </p>
          ) : (
            // Capped short: it shares a column with the search results, and two
            // fully open lists would reach the panels at the bottom of the HUD.
            <ul className="max-h-56 overflow-y-auto border-t border-rule">
              {blocks.map((block) => (
                <li key={block.id}>
                  <button
                    type="button"
                    disabled={promotingId === block.id}
                    onClick={() => onPromote(block.id)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 border-l-2 border-transparent px-3 py-2 text-left transition-colors',
                      'hover:border-primary hover:bg-tint/50 disabled:opacity-45',
                    )}
                  >
                    <span className="line-clamp-2 text-sm text-ink">
                      {block.text || '(empty)'}
                    </span>
                    <span className="truncate font-heading text-[0.6rem] uppercase tracking-[0.14em] text-muted">
                      {block.note_title} · Raise to an idea
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
