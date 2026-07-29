import type { RelationKind } from '../blocks/types';
import type { GraphLayout, PositionedNode } from './types';

/** One edge, read from the point of view of the node currently in focus. */
export interface Relation {
  id: number;
  other: PositionedNode;
  kind: RelationKind;
  /** False when the edge points AT the focused node. */
  outgoing: boolean;
  /** Only edges drawn on the map can be removed here; `[[` ones belong to the note. */
  origin: 'inline' | 'graph';
}

/**
 * Lives outside the HUD because the keyboard needs the same list the panel
 * shows — walking the map means moving down this list, so the two cannot each
 * compute their own version of it.
 */
export const relationsOf = (layout: GraphLayout, nodeId: string | null): Relation[] => {
  if (!nodeId) return [];

  return layout.edges
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .map((edge) => {
      const outgoing = edge.source === nodeId;
      const other = layout.byId.get(outgoing ? edge.target : edge.source);
      return other ? { id: edge.id, other, kind: edge.kind, outgoing, origin: edge.origin } : null;
    })
    .filter((relation): relation is Relation => relation !== null);
};
