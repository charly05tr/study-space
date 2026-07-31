import type { RelationKind } from '../blocks/types';

/**
 * A CONCEPT, as the map sees it. Shape of GraphNodeSerializer.
 *
 * Not a paragraph: the block that anchors the idea plus everything it absorbed.
 * A heading owns the blocks written under it, so the map reads at the level a
 * person thinks at rather than at the level they pressed Enter. The rules live
 * in `assign_concepts`, backend/apps/studyspace/services/block_service.py.
 */
export interface GraphNode {
  id: string;
  note: number;
  note_title: string;
  /** The anchor's type. `heading` and `annotation` are the two that anchor on their own. */
  block_type: string;
  /** The anchor's own text — the name of the idea. */
  text: string;
  /** How the body of the concept starts. A heading alone rarely says enough. */
  preview: string;
  /** Blocks inside the idea, the anchor included. Never below 1. */
  block_count: number;
  /** Raised by hand rather than by being a heading or an annotation. */
  promoted: boolean;
  /** No longer in any note. Drawn faded — the paragraph went, the thought did not. */
  orphan: boolean;
}

/**
 * One relation between two concepts. Shape of GraphEdgeSerializer.
 *
 * Several written links can collapse into one edge — two paragraphs of a
 * chapter citing two of another are, between ideas, a single connection.
 */
export interface GraphEdge {
  /** Stable key for rendering. NOT what deletes it: use `link_ids`. */
  id: number;
  source: string;
  target: string;
  kind: RelationKind;
  /** `inline` as soon as ANY underlying link was written with `[[`. */
  origin: 'inline' | 'graph';
  /** Every relation under this edge. Removing it means removing all of them. */
  link_ids: number[];
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

/**
 * Drawing a relation, one click at a time.
 *
 * Not a drag: OrbitControls already owns dragging, and a drag across a three
 * dimensional scene is ambiguous about depth anyway — you cannot tell which of
 * two overlapping nodes you released over. Clicking is unambiguous and stays
 * keyboard-reachable.
 */
export type Connecting =
  | null
  | { sourceId: string; targetId: null }
  | { sourceId: string; targetId: string };

export interface GraphLayout {
  nodes: PositionedNode[];
  /** Edges whose two ends both resolved to a placed node. */
  edges: GraphEdge[];
  byId: Map<string, PositionedNode>;
  /** Adjacency, both directions — the map is traversed by relation, not by space. */
  neighbours: Map<string, string[]>;
}
