import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, Loading } from '../../../components/ui';
import { getApiErrorMessage, getApiErrorStatus } from '../../../lib/apiError';
import { GraphCanvas } from '../components/GraphCanvas';
import { GraphHud } from '../components/GraphHud';
import { useGraphLayout } from '../hooks/useGraphLayout';

export const GraphPage = () => {
  const { studyspaceId } = useParams();
  const id = Number(studyspaceId);
  const { layout, isPending, isError, error, refetch } = useGraphLayout(id);

  const [focusedId, setFocusedId] = useState<string | null>(null);
  /** Where a Tab walk came from, so Escape retraces it instead of just clearing. */
  const trail = useRef<string[]>([]);
  const neighbourIndex = useRef(0);

  const focus = useCallback((next: string | null) => {
    setFocusedId((current) => {
      if (current && next && current !== next) trail.current.push(current);
      neighbourIndex.current = 0;
      return next;
    });
  }, []);

  /**
   * Walking the graph by its relations rather than by space.
   *
   * This is the interaction that makes the map a thinking tool instead of a
   * diagram: Tab moves along an edge, so the path you take through the scene is
   * the path of an argument.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof HTMLElement &&
        (event.target.tagName === 'INPUT' || event.target.isContentEditable);
      if (typing) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        const previous = trail.current.pop() ?? null;
        setFocusedId(previous);
        neighbourIndex.current = 0;
        return;
      }

      if (event.key !== 'Tab' || !focusedId) return;

      const neighbours = layout.neighbours.get(focusedId) ?? [];
      if (neighbours.length === 0) return;

      event.preventDefault();
      const step = event.shiftKey ? -1 : 1;
      neighbourIndex.current =
        (neighbourIndex.current + step + neighbours.length) % neighbours.length;
      focus(neighbours[neighbourIndex.current]);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusedId, layout, focus]);

  if (isPending) return <Loading full label="Drawing the map" />;

  if (isError) {
    return (
      <div className="mx-auto max-w-measure px-6 py-12">
        {getApiErrorStatus(error) === 404 ? (
          <EmptyState
            title="Studyspace not found"
            description="It may have been deleted, or it belongs to another account."
          />
        ) : (
          <ErrorState
            title="Could not draw the map"
            message={getApiErrorMessage(error)}
            onRetry={() => refetch()}
          />
        )}
      </div>
    );
  }

  if (layout.nodes.length === 0) {
    return (
      <div className="mx-auto flex max-w-measure flex-col gap-4 px-6 py-12">
        <EmptyState
          title="Nothing to map yet"
          description="The map draws itself from your notes. Write a few blocks, then connect them with [[ inside a note."
        />
        <Link
          to={`/studyspace/${id}`}
          className="font-heading text-xs uppercase tracking-[0.14em] text-muted hover:text-ink"
        >
          &larr; Back to studyspace
        </Link>
      </div>
    );
  }

  return (
    // Fills whatever the layout gives it: the map is the page, not a widget on
    // one. `relative` anchors the HUD over the canvas.
    <div className="relative -m-6 -my-8 h-[calc(100dvh-5rem)] overflow-hidden">
      <GraphCanvas layout={layout} focusedId={focusedId} onPick={focus} />
      <GraphHud
        layout={layout}
        focused={focusedId ? (layout.byId.get(focusedId) ?? null) : null}
        onPick={focus}
      />
    </div>
  );
};
