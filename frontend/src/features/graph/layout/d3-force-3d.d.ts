/**
 * d3-force-3d ships no types and has no @types package.
 *
 * Declared narrowly on purpose: only the surface `simulate.ts` actually uses.
 * A wider `any` module would type-check code that does not exist.
 */
declare module 'd3-force-3d' {
  export interface SimulationNode {
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    fx?: number | null;
    fy?: number | null;
    fz?: number | null;
  }

  export interface Force {
    (alpha: number): void;
  }

  export interface LinkForce<Link> extends Force {
    id(accessor: (node: never) => string): this;
    links(links: Link[]): this;
    distance(value: number | ((link: Link) => number)): this;
    strength(value: number | ((link: Link) => number)): this;
  }

  export interface ManyBodyForce extends Force {
    strength(value: number | ((node: never) => number)): this;
    distanceMax(value: number): this;
  }

  export interface CenterForce extends Force {
    strength(value: number): this;
  }

  export interface CollideForce extends Force {
    radius(value: number | ((node: never) => number)): this;
    strength(value: number): this;
  }

  export interface Simulation<Node> {
    nodes(nodes: Node[]): this;
    force(name: string, force: Force | null): this;
    alpha(value: number): this;
    alphaDecay(value: number): this;
    alphaMin(value: number): this;
    velocityDecay(value: number): this;
    tick(iterations?: number): this;
    stop(): this;
  }

  export function forceSimulation<Node extends SimulationNode>(
    nodes?: Node[],
    numDimensions?: number,
  ): Simulation<Node>;

  export function forceLink<Link>(links?: Link[]): LinkForce<Link>;
  export function forceManyBody(): ManyBodyForce;
  export function forceCenter(x?: number, y?: number, z?: number): CenterForce;
  export function forceCollide(radius?: number): CollideForce;
}
