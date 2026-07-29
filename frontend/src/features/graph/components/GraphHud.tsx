import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../../components/ui/cn';
import { RELATION_LABEL, type RelationKind } from '../../blocks/types';
import { EDGE_STYLES } from '../graphStyle';
import type { GraphLayout, PositionedNode } from '../types';

interface GraphHudProps {
  layout: GraphLayout;
  focused: PositionedNode | null;
  onPick: (id: string) => void;
}

/** The relations touching a node, with the direction read from its side. */
interface Relation {
  other: PositionedNode;
  kind: RelationKind;
  outgoing: boolean;
}

const Panel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div
    className={cn(
      'pointer-events-auto rounded-xs border border-rule bg-page/90 backdrop-blur-sm',
      className,
    )}
  >
    {children}
  </div>
);

export const GraphHud = ({ layout, focused, onPick }: GraphHudProps) => {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return layout.nodes.filter((node) => node.text.toLowerCase().includes(needle)).slice(0, 8);
  }, [layout, query]);

  const relations = useMemo<Relation[]>(() => {
    if (!focused) return [];

    return layout.edges
      .filter((edge) => edge.source === focused.id || edge.target === focused.id)
      .map((edge) => {
        const outgoing = edge.source === focused.id;
        const other = layout.byId.get(outgoing ? edge.target : edge.source);
        return other ? { other, kind: edge.kind, outgoing } : null;
      })
      .filter((relation): relation is Relation => relation !== null);
  }, [layout, focused]);

  return (
    // The HUD floats over the canvas and lets pointer events through, so
    // dragging the map still works between the panels.
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-4">
        <Panel className="w-72 p-2">
          <input
            type="search"
            value={query}
            placeholder="Find a block"
            aria-label="Find a block"
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent px-2 py-1 font-body text-sm text-ink placeholder:text-muted/60 focus:outline-none"
          />

          {results.length > 0 && (
            <ul className="scrollbar-slim mt-1 max-h-64 overflow-y-auto border-t border-rule pt-1">
              {results.map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(node.id);
                      setQuery('');
                    }}
                    className="flex w-full flex-col gap-0.5 border-l-2 border-transparent px-2 py-1 text-left transition-colors hover:border-primary hover:bg-tint/50"
                  >
                    <span className="truncate text-sm text-ink">{node.text || '(empty)'}</span>
                    <span className="truncate font-heading text-[0.6rem] uppercase tracking-[0.14em] text-muted">
                      {node.note_title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="px-3 py-2">
          <p className="font-heading text-[0.6rem] uppercase tracking-[0.16em] text-muted">
            {layout.nodes.length} blocks · {layout.edges.length} relations
          </p>
        </Panel>
      </div>

      <div className="flex items-end justify-between gap-4">
        {focused ? (
          <Panel className="max-w-md p-3">
            <p className="font-heading text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              {focused.note_title}
              {focused.orphan && ' · no longer in the note'}
            </p>

            <p className="mt-1 max-h-32 overflow-y-auto font-body text-sm text-ink italic scrollbar-slim">
              {focused.text || '(empty block)'}
            </p>

            {relations.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 border-t border-rule pt-2">
                {relations.map((relation) => (
                  <li key={`${relation.kind}-${relation.other.id}`}>
                    <button
                      type="button"
                      onClick={() => onPick(relation.other.id)}
                      className="flex w-full items-baseline gap-2 text-left text-sm text-muted transition-colors hover:text-ink"
                    >
                      <span className="shrink-0 font-heading text-[0.6rem] uppercase tracking-[0.14em] text-primary-ink">
                        {/* Direction matters: "supports" read from the other end
                            is a different claim. */}
                        {relation.outgoing ? '' : '← '}
                        {RELATION_LABEL[relation.kind]}
                      </span>
                      <span className="min-w-0 truncate">{relation.other.text || '(empty)'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Link
              to={`/note/${focused.note}`}
              className="mt-3 inline-block font-heading text-[0.6rem] uppercase tracking-[0.14em] text-primary-ink underline underline-offset-4 hover:text-ink"
            >
              Open the note
            </Link>
          </Panel>
        ) : (
          <Panel className="px-3 py-2">
            <p className="font-heading text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              Pick a block to explore · Tab walks its relations · Esc steps back
            </p>
          </Panel>
        )}

        <Panel className="px-3 py-2">
          <ul className="flex flex-col gap-1">
            {(Object.keys(EDGE_STYLES) as RelationKind[]).map((kind) => (
              <li
                key={kind}
                className="flex items-center gap-2 font-heading text-[0.6rem] uppercase tracking-[0.14em] text-muted"
              >
                <span
                  aria-hidden
                  className={cn(
                    'h-px w-6',
                    EDGE_STYLES[kind].tone === 'danger' ? 'bg-danger' : 'bg-ink/40',
                  )}
                  style={
                    EDGE_STYLES[kind].dash
                      ? {
                          backgroundImage: `repeating-linear-gradient(to right, currentColor 0 ${EDGE_STYLES[kind].dash.size}px, transparent ${EDGE_STYLES[kind].dash.size}px ${EDGE_STYLES[kind].dash.size + EDGE_STYLES[kind].dash.gap}px)`,
                          backgroundColor: 'transparent',
                        }
                      : undefined
                  }
                />
                {RELATION_LABEL[kind]}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
};
