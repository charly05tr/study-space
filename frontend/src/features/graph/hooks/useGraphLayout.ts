import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { graphApi } from '../api/graph.api';
import { simulate } from '../layout/simulate';
import type { GraphLayout } from '../types';

export const graphQueryKey = (studyspaceId: number) => ['graph', studyspaceId] as const;

const EMPTY: GraphLayout = {
  nodes: [],
  edges: [],
  byId: new Map(),
  neighbours: new Map(),
};

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

  /**
   * The simulation runs once per payload, not per render — it is a few hundred
   * iterations over every node, which is cheap once and ruinous sixty times a
   * second.
   */
  const layout = useMemo(
    () => (query.data ? simulate(query.data.nodes, query.data.edges) : EMPTY),
    [query.data],
  );

  return { ...query, layout };
};
