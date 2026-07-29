import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGraphLayout } from '../hooks/useGraphLayout';
import { GraphCanvas } from './GraphCanvas';

interface GraphSectionProps {
  studyspaceId: number;
}

/**
 * The map, embedded at the foot of a studyspace.
 *
 * Deliberately quieter than the full page: no search panel, no legend, no
 * keyboard traversal. A HUD floating over a section inside a scrolling document
 * fights the page around it, and stealing Tab from a page that has links and
 * buttons on it would be worse than useless. Orbiting and picking a node is
 * enough to answer "what does my thinking look like"; the rest lives one click
 * away.
 */
export const GraphSection = ({ studyspaceId }: GraphSectionProps) => {
  const { layout, isPending, isError } = useGraphLayout(studyspaceId);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focused = focusedId ? (layout.byId.get(focusedId) ?? null) : null;

  if (isPending) {
    return <p className="px-1 py-6 text-sm text-muted">Drawing the map…</p>;
  }

  if (isError) {
    return <p className="px-1 py-6 text-sm text-muted">The map could not be drawn.</p>;
  }

  if (layout.nodes.length === 0) {
    return (
      <p className="px-1 py-6 text-sm text-muted">
        The map draws itself from your notes. Write a few blocks, then connect them with{' '}
        <span className="font-mono text-xs">[[</span> inside a note.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="h-[55vh] min-h-80 overflow-hidden rounded-xs border border-rule">
        <GraphCanvas layout={layout} focusedId={focusedId} onPick={setFocusedId} />
      </div>

      {/* One line instead of a panel: it reports what was picked without
          covering the map or interrupting the page. */}
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-muted">
        <span className="min-w-0 flex-1 truncate">
          {focused ? (
            <>
              <span className="mr-2 font-heading text-[0.6rem] uppercase tracking-[0.14em]">
                {focused.note_title}
              </span>
              <span className="text-ink italic">{focused.text || '(empty block)'}</span>
            </>
          ) : (
            'Drag to turn it. Pick a block to light up what it connects to.'
          )}
        </span>

        <Link
          to={`/studyspace/${studyspaceId}/graph`}
          className="shrink-0 font-heading text-[0.6rem] uppercase tracking-[0.14em] text-primary-ink underline underline-offset-4 hover:text-ink"
        >
          Open the full map
        </Link>
      </p>
    </div>
  );
};
