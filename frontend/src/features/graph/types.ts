import type { RelationKind } from '../blocks/types';

/** A block, as the map sees it. Shape of GraphNodeSerializer. */
export interface GraphNode {
  id: string;
  note: number;
  note_title: string;
  block_type: string;
  text: string;
  /** No longer in any note. Drawn faded — the paragraph went, the thought did not. */
  orphan: boolean;
}

/** Shape of GraphEdgeSerializer. */
export interface GraphEdge {
  id: number;
  source: string;
  target: string;
  kind: RelationKind;
  origin: 'inline' | 'graph';
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** A node once the layout has placed it. */
export interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  z: number;
  /** How many edges touch it, in either direction. Drives the node's size. */
  degree: number;
}

export interface GraphLayout {
  nodes: PositionedNode[];
  /** Edges whose two ends both resolved to a placed node. */
  edges: GraphEdge[];
  byId: Map<string, PositionedNode>;
  /** Adjacency, both directions — the map is traversed by relation, not by space. */
  neighbours: Map<string, string[]>;
}
