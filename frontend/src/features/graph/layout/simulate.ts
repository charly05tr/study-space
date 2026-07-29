import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  forceZ,
  type SimulationNode,
} from 'd3-force-3d';
import type { GraphEdge, GraphLayout, GraphNode, PositionedNode } from '../types';
import { seedPosition } from './seed';

/**
 * How far the seed scatters nodes before the forces pull them together.
 *
 * Scaled to the graph: a fixed radius starts a twelve-block map as spread out as
 * a five-hundred-block one, and the forces never fully close that gap.
 */
const seedRadius = (count: number) => 8 + Math.cbrt(count) * 6;

/**
 * Layout-only attraction between consecutive blocks of the same note.
 *
 * Without it, a block with no relations feels nothing but repulsion and drifts
 * to the edge of the scene — which is exactly where a brand new map puts
 * everything, making it almost impossible to pick two nodes and connect them.
 *
 * Reading order is real structure, not a trick to tidy the picture: blocks that
 * follow one another in a note ARE related, they just have no typed edge. The
 * result is that each note reads as a strand, and isolated blocks sit with
 * their own note instead of in the void. These never render — only the
 * relations do.
 */
const noteThreads = (nodes: GraphNode[]): { source: string; target: string }[] => {
  const threads: { source: string; target: string }[] = [];
  // Relies on the endpoint ordering by (note_id, position), so consecutive
  // entries of one note are consecutive in reading order.
  for (let index = 1; index < nodes.length; index += 1) {
    if (nodes[index].note === nodes[index - 1].note) {
      threads.push({ source: nodes[index - 1].id, target: nodes[index].id });
    }
  }
  return threads;
};

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
export type Positions = Map<string, { x: number; y: number; z: number }>;

/**
 * Deterministic replacement for `Math.random` inside the simulation.
 *
 * Seeding the starting positions is not enough on its own: d3's forces reach
 * for `Math.random()` to jiggle apart nodes that land on top of each other, so
 * two runs over identical input drifted to visibly different arrangements. That
 * quietly undid the whole reason for seeding — reopening the map put every idea
 * somewhere new.
 *
 * mulberry32: tiny, and its quality is far beyond what nudging coincident
 * points requires.
 */
const seededRandom = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Edges whose two ends are both on the map. */
const usableEdges = (nodes: GraphNode[], edges: GraphEdge[]) => {
  const present = new Set(nodes.map((node) => node.id));
  // A dangling end would make the force layout throw rather than merely look wrong.
  return edges.filter((edge) => present.has(edge.source) && present.has(edge.target));
};

/**
 * Runs the force layout. Pure: no three.js, no React, no DOM.
 *
 * Split from `assembleLayout` so the two can be recomputed on different
 * schedules — see the note in useGraphLayout about why drawing a relation must
 * not move the map.
 */
export const computePositions = (nodes: GraphNode[], edges: GraphEdge[]): Positions => {
  const usable = usableEdges(nodes, edges);

  const simulated: Simulated[] = nodes.map((node) => ({
    id: node.id,
    ...seedPosition(node.id, seedRadius(nodes.length)),
  }));

  /**
   * Typed relations pull hard; reading order pulls gently.
   *
   * The two are weighted differently on purpose — a note's sequence should
   * gather its blocks without competing with the relations the user drew, which
   * are the structure worth reading off the map.
   */
  const layoutLinks = [
    ...usable.map((edge) => ({ ...edge, weight: 0.9, span: 20 })),
    ...noteThreads(nodes).map((thread) => ({ ...thread, weight: 0.5, span: 12 })),
  ];

  const simulation = forceSimulation<Simulated>(simulated, 3)
    // Before the forces: each one captures the random source when it is
    // initialised, so setting this afterwards would leave them on Math.random.
    .randomSource(seededRandom(0x5eed))
    .force(
      'link',
      /**
       * `layoutLinks` is already a fresh array of fresh objects, which matters:
       * `forceLink` resolves ids IN PLACE, overwriting each link's `source` and
       * `target` with references to its own nodes. Handing it the edges from the
       * query cache turned those fields from strings into objects, so every
       * later `edge.source === node.id` comparison failed and the map lost all
       * of its relations.
       */
      forceLink<(typeof layoutLinks)[number]>(layoutLinks)
        .id((node: never) => (node as Simulated).id)
        // Related blocks sit close, but not on top of each other: the edge has
        // to stay long enough to read its style.
        .distance((link) => link.span)
        .strength((link) => link.weight),
    )
    // Repulsion capped by distance, or every node pushes every other one and the
    // cost goes quadratic on a graph that is mostly local.
    .force('charge', forceManyBody().strength(-24).distanceMax(90))
    /**
     * Centring, twice over.
     *
     * `forceCenter` only shifts the whole cloud so its average sits at the
     * origin — it does nothing about a node drifting away, because moving
     * everything moves that node too. The per-axis forces are what actually
     * pull each node home, and they are the standard answer to a graph whose
     * pieces are not all connected to each other.
     */
    .force('center', forceCenter(0, 0, 0).strength(0.1))
    .force('x', forceX(0).strength(0.09))
    .force('y', forceY(0).strength(0.09))
    .force('z', forceZ(0).strength(0.09))
    .alphaDecay(0.02)
    .stop();

  simulation.tick(ITERATIONS);

  return new Map(
    nodes.map((node, index) => [
      node.id,
      { x: simulated[index].x ?? 0, y: simulated[index].y ?? 0, z: simulated[index].z ?? 0 },
    ]),
  );
};

/**
 * Combines placed nodes with the current edges into what the scene renders.
 *
 * Cheap on purpose — it is a couple of passes over the arrays and no physics —
 * so it can re-run whenever the relations change while the positions stand
 * still.
 */
export const assembleLayout = (
  nodes: GraphNode[],
  edges: GraphEdge[],
  positions: Positions,
): GraphLayout => {
  const usable = usableEdges(nodes, edges);

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

  const positioned: PositionedNode[] = nodes.map((node) => ({
    ...node,
    ...(positions.get(node.id) ?? { x: 0, y: 0, z: 0 }),
    degree: degree.get(node.id) ?? 0,
  }));

  return {
    nodes: positioned,
    edges: usable,
    byId: new Map(positioned.map((node) => [node.id, node])),
    neighbours,
  };
};
