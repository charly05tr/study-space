import { describe, expect, it } from 'vitest';
import { assembleLayout, computePositions } from './simulate';
import type { GraphEdge, GraphNode } from '../types';

const node = (n: number): GraphNode => ({
  id: `${n}`.padStart(8, '0') + '-0000-0000-0000-000000000000',
  note: 1,
  note_title: 'Notes',
  block_type: 'paragraph',
  text: `block ${n}`,
  orphan: false,
});

const nodes = Array.from({ length: 12 }, (_, index) => node(index));

const edges = (): GraphEdge[] => [
  { id: 1, source: nodes[0].id, target: nodes[1].id, kind: 'relates', origin: 'inline' },
  { id: 2, source: nodes[1].id, target: nodes[2].id, kind: 'supports', origin: 'graph' },
];

const fingerprint = (positions: ReturnType<typeof computePositions>) =>
  [...positions]
    .map(([id, at]) => `${id}:${at.x.toFixed(6)},${at.y.toFixed(6)},${at.z.toFixed(6)}`)
    .sort()
    .join('|');

describe('computePositions', () => {
  it('puts the same graph in the same place every time', () => {
    // The load-bearing property of the whole map: spatial memory only works if
    // reopening it does not rearrange everything. d3's forces reach for
    // Math.random to separate coincident nodes, so this needs a seeded source —
    // without one, two runs over identical input drifted apart.
    expect(fingerprint(computePositions(nodes, edges()))).toBe(
      fingerprint(computePositions(nodes, edges())),
    );
  });

  it('does not touch the edges it was given', () => {
    // `forceLink` resolves ids IN PLACE, overwriting source/target with its own
    // node objects. Handing it the array straight from the query cache turned
    // those fields into objects and every later id comparison failed.
    const given = edges();
    computePositions(nodes, given);

    expect(typeof given[0].source).toBe('string');
    expect(given[0].source).toBe(nodes[0].id);
  });
});

describe('assembleLayout', () => {
  it('keeps every edge whose ends are on the map', () => {
    const given = edges();
    const layout = assembleLayout(nodes, given, computePositions(nodes, given));

    expect(layout.edges).toHaveLength(2);
  });

  it('drops an edge pointing at a block that is not there', () => {
    const dangling: GraphEdge[] = [
      { id: 9, source: nodes[0].id, target: node(99).id, kind: 'relates', origin: 'graph' },
    ];
    const layout = assembleLayout(nodes, dangling, computePositions(nodes, dangling));

    expect(layout.edges).toEqual([]);
  });

  it('counts degree in both directions', () => {
    const given = edges();
    const layout = assembleLayout(nodes, given, computePositions(nodes, given));

    // Node 1 is the target of one edge and the source of another.
    expect(layout.byId.get(nodes[1].id)?.degree).toBe(2);
    expect(layout.byId.get(nodes[0].id)?.degree).toBe(1);
  });

  it('makes neighbours symmetric, so the map can be walked either way', () => {
    const given = edges();
    const layout = assembleLayout(nodes, given, computePositions(nodes, given));

    expect(layout.neighbours.get(nodes[0].id)).toContain(nodes[1].id);
    expect(layout.neighbours.get(nodes[1].id)).toContain(nodes[0].id);
  });
});
