import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, ErrorState, Loading, useNotification } from '../../../components/ui';
import { useCreateBlockLink, useDeleteBlockLink } from '../../blocks/hooks/useBlockLinkMutations';
import { useSetBlockExcluded, useSetBlockPromoted } from '../../blocks/hooks/useBlockVisibility';
import type { RelationKind } from '../../blocks/types';
import { getApiErrorMessage, getApiErrorStatus } from '../../../lib/apiError';
import { ConceptCandidates } from '../components/ConceptCandidates';
import { GraphCanvas } from '../components/GraphCanvas';
import { GraphHud } from '../components/GraphHud';
import { NodeMenu, type NodeMenuTarget } from '../components/NodeMenu';
import { useGraphLayout } from '../hooks/useGraphLayout';
import { relationsOf, type Relation } from '../relations';
import type { Connecting } from '../types';

export const GraphPage = () => {
  const { studyspaceId } = useParams();
  const id = Number(studyspaceId);
  const { layout, isPending, isError, error, refetch } = useGraphLayout(id);

  const { notify } = useNotification();
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<Connecting>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showEdges, setShowEdges] = useState(true);
  /** Which row of the relation list the arrow keys are sitting on. */
  const [relationIndex, setRelationIndex] = useState(0);

  const [menu, setMenu] = useState<NodeMenuTarget | null>(null);

  const relations = useMemo(() => relationsOf(layout, focusedId), [layout, focusedId]);

  const createLink = useCreateBlockLink(id);
  const deleteLink = useDeleteBlockLink(id);
  const setExcluded = useSetBlockExcluded(id);
  const setPromoted = useSetBlockPromoted(id);
  /** Which candidate is being raised, so only its own row goes quiet. */
  const [promotingId, setPromotingId] = useState<string | null>(null);

  /** Where the walk came from, so Escape retraces it instead of just clearing. */
  const trail = useRef<string[]>([]);

  const focus = useCallback((next: string | null) => {
    setRelationIndex(0);
    setFocusedId((current) => {
      if (current && next && current !== next) trail.current.push(current);
      return next;
    });
  }, []);

  /**
   * A click on a node means two different things depending on the mode.
   *
   * While connecting it names the other end rather than moving the focus —
   * flying the camera away mid-gesture would lose sight of the block the
   * relation starts from.
   */
  const pick = useCallback(
    (next: string | null) => {
      if (!connecting || next === null) {
        if (!connecting) focus(next);
        return;
      }
      if (next === connecting.sourceId) return;
      setConnecting({ sourceId: connecting.sourceId, targetId: next });
    },
    [connecting, focus],
  );

  const confirmConnect = (kind: RelationKind, why: string) => {
    if (!connecting?.targetId) return;

    createLink.mutate(
      { source: connecting.sourceId, target: connecting.targetId, kind, note: why },
      {
        onSuccess: () => setConnecting(null),
        onError: (mutationError) =>
          notify({
            variant: 'error',
            title: 'Could not connect them',
            message: getApiErrorMessage(mutationError),
          }),
      },
    );
  };

  const openNodeMenu = useCallback(
    (nodeId: string, x: number, y: number) => {
      const node = layout.byId.get(nodeId);
      if (node) setMenu({ node, x, y });
    },
    [layout],
  );

  const removeFromMap = () => {
    if (!menu) return;
    const nodeId = menu.node.id;

    setExcluded.mutate(
      { blockId: nodeId, excluded: true },
      {
        onSuccess: () => {
          setMenu(null);
          // Leaving the focus on a node that is no longer drawn would keep
          // its panel open over an empty patch of space.
          if (focusedId === nodeId) setFocusedId(null);
          notify({
            variant: 'success',
            title: 'Taken off the map',
            message: 'Its blocks are still in the note.',
          });
        },
        onError: (mutationError) =>
          notify({
            variant: 'error',
            title: 'Could not remove it',
            message: getApiErrorMessage(mutationError),
          }),
      },
    );
  };

  /**
   * Raises a block to an idea of its own, or folds it back into its section.
   *
   * Both directions are the same field, so they are one handler: promoting is
   * how a paragraph under no heading reaches the map, and folding back is how a
   * node that turned out not to be its own idea leaves it WITHOUT being hidden.
   * That distinction matters — "remove from the map" is a different answer.
   */
  const promote = (blockId: string, promoted: boolean) => {
    setPromotingId(blockId);
    setPromoted.mutate(
      { blockId, promoted },
      {
        onSettled: () => setPromotingId(null),
        onSuccess: () => {
          if (!promoted) {
            setMenu(null);
            // The node is about to stop existing as a node; leaving the focus on
            // it would keep its panel open over an empty patch of space.
            if (focusedId === blockId) setFocusedId(null);
          }
        },
        onError: (mutationError) =>
          notify({
            variant: 'error',
            title: promoted ? 'Could not raise it' : 'Could not fold it back',
            message: getApiErrorMessage(mutationError),
          }),
      },
    );
  };

  const removeRelation = (relation: Relation) => {
    // Keyed by the edge, but deleting every written link under it: one relation
    // between two ideas can rest on several `[[` written in different blocks.
    setDeletingId(relation.id);
    deleteLink.mutate(relation.linkIds, {
      onSettled: () => setDeletingId(null),
      onError: (mutationError) =>
        notify({
          variant: 'error',
          title: 'Could not remove it',
          message: getApiErrorMessage(mutationError),
        }),
    });
  };

  /**
   * Walking the graph by its relations rather than by space.
   *
   * This is the interaction that makes the map a thinking tool instead of a
   * diagram: you move along an edge you have read first, so the path you take
   * through the scene is the path of an argument.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof HTMLElement &&
        (event.target.tagName === 'INPUT' || event.target.isContentEditable);
      if (typing) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        // Escape unwinds one step at a time: first the gesture in progress, and
        // only once there is none does it start retracing the walk.
        if (connecting) {
          setConnecting(null);
          return;
        }
        const previous = trail.current.pop() ?? null;
        setFocusedId(previous);
        setRelationIndex(0);
        return;
      }

      // Walking away mid-gesture would leave a half-drawn relation behind.
      if (connecting) return;

      // The shortcut exists because 'Connect to…' is buried in a panel, and
      // reaching for the mouse is the slowest part of drawing a relation.
      if ((event.key === 'c' || event.key === 'C') && focusedId) {
        event.preventDefault();
        setConnecting({ sourceId: focusedId, targetId: null });
        return;
      }

      if (event.key === 'l' || event.key === 'L') {
        event.preventDefault();
        setShowEdges((visible) => !visible);
        return;
      }

      if (relations.length === 0) return;

      /**
       * Arrows move down the list the panel is showing; Enter travels.
       *
       * Tab used to cycle the neighbours blindly, which is unusable the
       * moment a block has more than two of them: you could not see where
       * the next press would land, so every step was a guess. Reading the
       * row first and then committing is how you follow an argument.
       */
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setRelationIndex((current) => (current + step + relations.length) % relations.length);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        focus(relations[relationIndex].other.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusedId, focus, connecting, relations, relationIndex]);

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
          title="No ideas on the map yet"
          description="The map draws one node per idea, not one per paragraph — and it reads your headings to know where an idea starts. Add a heading or two to a note, or raise a block by hand below."
        />
        {/*
          The panel belongs here more than anywhere else. A note written as a
          flat run of paragraphs declares no concepts at all, so this screen is
          exactly what its author sees — and telling them the map is empty
          without showing the way onto it would be a dead end.
        */}
        <ConceptCandidates
          studyspaceId={id}
          promotingId={promotingId}
          onPromote={(blockId) => promote(blockId, true)}
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
      <GraphCanvas
        layout={layout}
        // While connecting, the source keeps the light so you can see where
        // the relation is starting from.
        focusedId={connecting?.sourceId ?? focusedId}
        showEdges={showEdges}
        onPick={pick}
        onNodeMenu={openNodeMenu}
      />
      <GraphHud
        layout={layout}
        focused={focusedId ? (layout.byId.get(focusedId) ?? null) : null}
        connecting={connecting}
        relations={relations}
        relationIndex={relationIndex}
        onHoverRelation={setRelationIndex}
        onPick={pick}
        onStartConnect={() => focusedId && setConnecting({ sourceId: focusedId, targetId: null })}
        onCancelConnect={() => setConnecting(null)}
        onConfirmConnect={confirmConnect}
        onDeleteRelation={removeRelation}
        saving={createLink.isPending}
        deletingId={deletingId}
        showEdges={showEdges}
        onToggleEdges={() => setShowEdges((visible) => !visible)}
        candidates={
          <ConceptCandidates
            studyspaceId={id}
            promotingId={promotingId}
            onPromote={(blockId) => promote(blockId, true)}
          />
        }
      />

      {menu && (
        <NodeMenu
          target={menu}
          removing={setExcluded.isPending}
          onRemove={removeFromMap}
          demoting={promotingId === menu.node.id}
          onDemote={() => promote(menu.node.id, false)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
};
