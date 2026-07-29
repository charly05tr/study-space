import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../../components/ui/cn';
import { RELATION_KINDS, RELATION_LABEL, type RelationKind } from '../../blocks/types';
import { EDGE_STYLES } from '../graphStyle';
import type { Relation } from '../relations';
import type { Connecting, GraphLayout, PositionedNode } from '../types';

interface GraphHudProps {
  layout: GraphLayout;
  focused: PositionedNode | null;
  connecting: Connecting;
  relations: Relation[];
  /** Row the arrow keys are on; Enter travels to it. */
  relationIndex: number;
  onHoverRelation: (index: number) => void;
  onPick: (id: string) => void;
  onStartConnect: () => void;
  onCancelConnect: () => void;
  onConfirmConnect: (kind: RelationKind, note: string) => void;
  onDeleteRelation: (linkId: number) => void;
  saving: boolean;
  deletingId: number | null;
  showEdges: boolean;
  onToggleEdges: () => void;
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

export const GraphHud = ({
  layout,
  focused,
  connecting,
  relations,
  relationIndex,
  onHoverRelation,
  onPick,
  onStartConnect,
  onCancelConnect,
  onConfirmConnect,
  onDeleteRelation,
  saving,
  deletingId,
  showEdges,
  onToggleEdges,
}: GraphHudProps) => {
  const [query, setQuery] = useState('');
  const [why, setWhy] = useState('');

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return layout.nodes.filter((node) => node.text.toLowerCase().includes(needle)).slice(0, 8);
  }, [layout, query]);

  const source = connecting ? (layout.byId.get(connecting.sourceId) ?? null) : null;
  const target = connecting?.targetId ? (layout.byId.get(connecting.targetId) ?? null) : null;

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
            <ul className="mt-1 max-h-64 overflow-y-auto border-t border-rule pt-1">
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

        <Panel className="flex items-center gap-3 px-3 py-2">
          <p className="font-heading text-[0.6rem] uppercase tracking-[0.16em] text-muted">
            {layout.nodes.length} blocks · {layout.edges.length} relations
          </p>

          {/* Hiding the lines is not a cosmetic switch: on a dense map they
              cover the nodes you are trying to pick, which is most of what
              makes connecting two blocks fiddly. */}
          <button
            type="button"
            aria-pressed={showEdges}
            onClick={onToggleEdges}
            className={cn(
              'border-b-2 pb-0.5 font-heading text-[0.6rem] uppercase tracking-[0.14em] transition-colors',
              showEdges
                ? 'border-primary text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            Lines
          </button>
        </Panel>
      </div>

      <div className="flex items-end justify-between gap-4">
        {connecting ? (
          <Panel className="max-w-md p-3">
            <p className="font-heading text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              {target ? 'How do they relate?' : 'Pick the other block'}
            </p>

            <p className="mt-1 truncate text-sm text-ink italic">{source?.text || '(empty block)'}</p>

            {target ? (
              <>
                <p className="mt-1 truncate border-l-2 border-primary pl-2 text-sm text-ink italic">
                  {target.text || '(empty block)'}
                </p>

                {/* Optional, and the better half of the edge: the type says what
                    kind of connection it is, this says why you saw it. */}
                <input
                  autoFocus
                  value={why}
                  placeholder="Why? (optional)"
                  aria-label="Why are they related"
                  onChange={(event) => setWhy(event.target.value)}
                  className="mt-3 w-full border-b border-rule bg-transparent py-1 font-body text-sm text-ink placeholder:text-muted/60 focus:border-primary focus:outline-none"
                />

                <ul className="mt-3 flex flex-wrap gap-1">
                  {RELATION_KINDS.map((relation) => (
                    <li key={relation.kind}>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          onConfirmConnect(relation.kind, why.trim());
                          setWhy('');
                        }}
                        className="rounded-xs border border-rule px-2 py-1 font-heading text-[0.6rem] uppercase tracking-[0.14em] text-muted transition-colors hover:border-primary hover:text-ink disabled:opacity-45"
                      >
                        {relation.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Click any other block on the map. Esc cancels.
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                onCancelConnect();
                setWhy('');
              }}
              className="mt-3 font-heading text-[0.6rem] uppercase tracking-[0.14em] text-muted underline underline-offset-4 hover:text-ink"
            >
              Cancel
            </button>
          </Panel>
        ) : focused ? (
          <Panel className="max-w-md p-3">
            <p className="font-heading text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              {focused.note_title}
              {focused.orphan && ' · no longer in the note'}
            </p>

            <p className="mt-1 max-h-32 overflow-y-auto font-body text-sm text-ink italic">
              {focused.text || '(empty block)'}
            </p>

            {relations.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 border-t border-rule pt-2">
                {relations.map((relation, index) => (
                  <li
                    key={relation.id}
                    className={cn(
                      'flex items-baseline gap-2 border-l-2 pl-2 transition-colors',
                      index === relationIndex ? 'border-primary bg-tint/60' : 'border-transparent',
                    )}
                  >
                    <button
                      type="button"
                      onMouseEnter={() => onHoverRelation(index)}
                      onClick={() => onPick(relation.other.id)}
                      className="flex min-w-0 flex-1 items-baseline gap-2 text-left text-sm text-muted transition-colors hover:text-ink"
                    >
                      <span className="shrink-0 font-heading text-[0.6rem] uppercase tracking-[0.14em] text-primary-ink">
                        {/* Direction matters: "supports" read from the other end
                            is a different claim. */}
                        {relation.outgoing ? '' : '← '}
                        {RELATION_LABEL[relation.kind]}
                      </span>
                      <span className="min-w-0 truncate">{relation.other.text || '(empty)'}</span>
                    </button>

                    {/* Only edges drawn on the map. One written with `[[` is
                        governed by the note, and the API refuses to delete it —
                        offering a button that always fails would be a lie. */}
                    {relation.origin === 'graph' && (
                      <button
                        type="button"
                        aria-label="Remove this relation"
                        disabled={deletingId === relation.id}
                        onClick={() => onDeleteRelation(relation.id)}
                        className="shrink-0 px-1 text-muted transition-colors hover:text-danger disabled:opacity-45"
                      >
                        &times;
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-baseline gap-4">
              <button
                type="button"
                onClick={onStartConnect}
                className="font-heading text-[0.6rem] uppercase tracking-[0.14em] text-primary-ink underline underline-offset-4 hover:text-ink"
              >
                Connect to…
              </button>

              <Link
                to={`/note/${focused.note}`}
                className="font-heading text-[0.6rem] uppercase tracking-[0.14em] text-primary-ink underline underline-offset-4 hover:text-ink"
              >
                Open the note
              </Link>

              {/* The gesture is deliberately hard to trigger by accident, which
                  also makes it impossible to stumble on. */}
              <span className="font-heading text-[0.6rem] uppercase tracking-[0.14em] text-muted/70">
                Double click the background to let go
              </span>
            </div>
          </Panel>
        ) : (
          <Panel className="px-3 py-2">
            <p className="font-heading text-[0.6rem] uppercase tracking-[0.16em] text-muted">
              Pick a block to explore · C connects it · ↑↓ then Enter follows a relation
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
