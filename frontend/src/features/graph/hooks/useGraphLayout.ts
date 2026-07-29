import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { graphApi } from '../api/graph.api';
import { assembleLayout, computePositions, type Positions } from '../layout/simulate';
import type { GraphLayout } from '../types';

export const graphQueryKey = (studyspaceId: number) => ['graph', studyspaceId] as const;

const NO_NODES: never[] = [];
const NO_POSITIONS: Positions = new Map();

export const useGraphLayout = (studyspaceId: number) => {
  const query = useQuery({
    queryKey: graphQueryKey(studyspaceId),
    queryFn: () => graphApi.load(studyspaceId),
    enabled: Number.isFinite(studyspaceId),
    // The map is a snapshot of the notes as they were saved. Refetching while
    // the user is orbiting would relayout the scene under their hands.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const nodes = query.data?.nodes ?? NO_NODES;
  const edges = query.data?.edges ?? NO_NODES;

  /**
   * Which blocks are on the map, as one comparable string.
   *
   * This, and not the payload, is what the positions depend on.
   */
  const nodeSignature = useMemo(() => nodes.map((node) => node.id).join('|'), [nodes]);

  /**
   * Positions follow the NODE SET, not the relations.
   *
   * Re-running the simulation every time an edge appears would shuffle the whole
   * map the instant you drew a connection — the one moment you are certainly
   * looking at it. Stability is worth more here than an optimal arrangement:
   * the point of laying this out in space at all is that the same idea stays in
   * the same place. Writing a new block does re-run it, which is when a fresh
   * arrangement is expected anyway.
   *
   * The dependency is deliberately narrower than the values used.
   */
  const positions = useMemo(
    () => (nodes.length > 0 ? computePositions(nodes, edges) : NO_POSITIONS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodeSignature],
  );

  /** Cheap, so it follows the relations closely. */
  const layout: GraphLayout = useMemo(
    () => assembleLayout(nodes, edges, positions),
    [nodes, edges, positions],
  );

  return { ...query, layout };
};
