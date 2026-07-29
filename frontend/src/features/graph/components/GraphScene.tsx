import { OrbitControls } from '@react-three/drei';
import { useMemo, useRef, type ComponentRef } from 'react';
import type { GraphPalette } from '../graphStyle';
import type { GraphLayout } from '../types';
import { GraphEdges } from './GraphEdges';
import { GraphNodes } from './GraphNodes';
import { NodeLabel } from './NodeLabel';
import { useCameraFlight } from './useCameraFlight';

interface GraphSceneProps {
  layout: GraphLayout;
  palette: GraphPalette;
  focusedId: string | null;
  onPick: (id: string | null) => void;
}

/** Anything further than this from the focus stays a point, not a word. */
const LABEL_RADIUS = 46;
/** Ceiling on labels, so a hub with forty links does not become a wall of text. */
const MAX_LABELS = 14;

export const GraphScene = ({ layout, palette, focusedId, onPick }: GraphSceneProps) => {
  // Typed off the component rather than reaching into three-stdlib: the impl
  // package is a transitive dependency, so importing it directly would break
  // the moment drei changed how it is vendored.
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const focused = focusedId ? (layout.byId.get(focusedId) ?? null) : null;

  useCameraFlight(focused, controls);

  const neighbourIds = useMemo(
    () => new Set(focusedId ? (layout.neighbours.get(focusedId) ?? []) : []),
    [layout, focusedId],
  );

  /**
   * Which nodes get words.
   *
   * Labelling everything turns the scene into text soup and costs one DOM node
   * per block; labelling nothing makes it a pretty diagram of nothing. The rule
   * is proximity: what you are looking at, what it connects to, and whatever
   * else is close enough to be part of the same thought.
   */
  const labelled = useMemo(() => {
    if (!focused) return [];

    const nearby = layout.nodes
      .filter((node) => {
        if (node.id === focused.id || neighbourIds.has(node.id)) return true;
        const distance = Math.hypot(node.x - focused.x, node.y - focused.y, node.z - focused.z);
        return distance < LABEL_RADIUS;
      })
      .sort((a, b) => {
        // The focus first, then its neighbours, then the merely close.
        const rank = (id: string) => (id === focused.id ? 0 : neighbourIds.has(id) ? 1 : 2);
        return rank(a.id) - rank(b.id);
      });

    return nearby.slice(0, MAX_LABELS);
  }, [layout, focused, neighbourIds]);

  return (
    <>
      {/* No lights: every material is unlit, so the scene reads as ink on paper
          rather than as shaded objects sitting in a room. */}
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        // Damping is what stops the graph from feeling like a spreadsheet.
        enableDamping
        dampingFactor={0.08}
        minDistance={8}
        maxDistance={400}
      />

      {/* A click that hits no node clears the focus and returns the whole map
          to full contrast. */}
      <mesh onClick={() => onPick(null)} visible={false}>
        <sphereGeometry args={[900, 4, 4]} />
        <meshBasicMaterial side={2} />
      </mesh>

      <GraphEdges layout={layout} palette={palette} focusedId={focusedId} />

      <GraphNodes
        layout={layout}
        palette={palette}
        focusedId={focusedId}
        neighbourIds={neighbourIds}
        onPick={onPick}
      />

      {labelled.map((node) => (
        <NodeLabel key={node.id} node={node} focused={node.id === focused?.id} />
      ))}
    </>
  );
};
