import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNode,
} from 'd3-force-3d';
import type { GraphEdge, GraphLayout, GraphNode, PositionedNode } from '../types';
import { seedPosition } from './seed';

/** Roughly how far the seed scatters nodes before the forces pull them together. */
const SEED_RADIUS = 60;

/**
 * Iterations run before the positions are read.
 *
 * The simulation is run to completion and then STOPPED, rather than animated.
 * A graph that keeps drifting cannot be read and turns every node into a moving
 * target; worse, it means the same idea is never twice in the same place, which
 * is the one thing this view exists to provide.
 */
const ITERATIONS = 320;

interface Simulated extends SimulationNode {
  id: string;
}

/**
 * Places the graph in space. Pure: no three.js, no React, no DOM.
 *
 * Keeping the layout free of the renderer is what makes it testable, and what
 * would let the same positions be computed on a server or feed a flat view
 * later without touching any of this.
 */
export const simulate = (nodes: GraphNode[], edges: GraphEdge[]): GraphLayout => {
  const present = new Set(nodes.map((node) => node.id));
  // An edge can outlive its target's row only in theory, but a dangling end
  // would make the force layout throw rather than merely look wrong.
  const usable = edges.filter((edge) => present.has(edge.source) && present.has(edge.target));

  const degree = new Map<string, number>();
  const neighbours = new Map<string, string[]>();
  for (const node of nodes) neighbours.set(node.id, []);

  for (const edge of usable) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    // Both directions: the neighbourhood of an idea includes what cites it.
    neighbours.get(edge.source)?.push(edge.target);
    neighbours.get(edge.target)?.push(edge.source);
  }

  const simulated: Simulated[] = nodes.map((node) => ({
    id: node.id,
    ...seedPosition(node.id, SEED_RADIUS),
  }));

  const simulation = forceSimulation<Simulated>(simulated, 3)
    .force(
      'link',
      forceLink<GraphEdge>(usable)
        .id((node: never) => (node as Simulated).id)
        // Related blocks sit close, but not on top of each other: the edge has
        // to stay long enough to read its style.
        .distance(28)
        .strength(0.35),
    )
    // Repulsion capped by distance, or every node pushes every other one and the
    // cost goes quadratic on a graph that is mostly local.
    .force('charge', forceManyBody().strength(-90).distanceMax(220))
    .force('center', forceCenter(0, 0, 0).strength(0.05))
    .alphaDecay(0.02)
    .stop();

  simulation.tick(ITERATIONS);

  const positioned: PositionedNode[] = nodes.map((node, index) => ({
    ...node,
    x: simulated[index].x ?? 0,
    y: simulated[index].y ?? 0,
    z: simulated[index].z ?? 0,
    degree: degree.get(node.id) ?? 0,
  }));

  return {
    nodes: positioned,
    edges: usable,
    byId: new Map(positioned.map((node) => [node.id, node])),
    neighbours,
  };
};
