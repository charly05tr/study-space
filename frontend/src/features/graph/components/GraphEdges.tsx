import { useMemo } from 'react';
import * as THREE from 'three';
import type { RelationKind } from '../../blocks/types';
import { EDGE_STYLES, type GraphPalette } from '../graphStyle';
import type { GraphLayout } from '../types';

interface GraphEdgesProps {
  layout: GraphLayout;
  palette: GraphPalette;
  /** Edges not touching the focus are dimmed rather than hidden. */
  focusedId: string | null;
}

/**
 * Every edge of one relation kind in a single geometry.
 *
 * One `Line` object per edge would mean a draw call per edge — hundreds of them
 * on a graph that is meant to grow. Grouping by kind keeps the count at six,
 * which is also exactly how many materials the stroke styles need.
 */
export const GraphEdges = ({ layout, palette, focusedId }: GraphEdgesProps) => {
  const groups = useMemo(() => {
    const byKind = new Map<RelationKind, { points: number[]; touching: boolean[] }>();

    for (const edge of layout.edges) {
      const source = layout.byId.get(edge.source);
      const target = layout.byId.get(edge.target);
      if (!source || !target) continue;

      const group = byKind.get(edge.kind) ?? { points: [], touching: [] };
      group.points.push(source.x, source.y, source.z, target.x, target.y, target.z);
      group.touching.push(
        focusedId !== null && (edge.source === focusedId || edge.target === focusedId),
      );
      byKind.set(edge.kind, group);
    }

    return [...byKind].map(([kind, group]) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(group.points, 3));

      /**
       * Dashes are measured along the line, so a dashed material renders solid
       * without this attribute. `computeLineDistances` lives on the LineSegments
       * object rather than the geometry, and calling it through a ref would
       * depend on mount order; the maths is two lines, so it is done here.
       *
       * Each pair is independent in LineSegments: every segment restarts at 0,
       * which is why the dash pattern reads the same on a short edge as a long
       * one.
       */
      const distances = new Float32Array((group.points.length / 3));
      for (let index = 0; index < group.points.length; index += 6) {
        const length = Math.hypot(
          group.points[index + 3] - group.points[index],
          group.points[index + 4] - group.points[index + 1],
          group.points[index + 5] - group.points[index + 2],
        );
        const vertex = index / 3;
        distances[vertex] = 0;
        distances[vertex + 1] = length;
      }
      geometry.setAttribute('lineDistance', new THREE.BufferAttribute(distances, 1));

      return {
        kind,
        geometry,
        // With a focus, an edge that does not touch it fades into the paper.
        highlighted: focusedId !== null && group.touching.some(Boolean),
      };
    });
  }, [layout, focusedId]);

  // With a focus chosen, everything not touching it recedes.
  const dimmed = focusedId !== null;

  return (
    <group>
      {groups.map(({ kind, geometry, highlighted }) => {
        const style = EDGE_STYLES[kind];
        // `muted` rather than `rule`: the rule token is a hairline meant for
        // borders and all but vanished against the paper at these opacities.
        const color = style.tone === 'danger' ? palette.danger : palette.muted;
        const opacity = dimmed && !highlighted ? style.opacity * 0.3 : style.opacity;

        return (
          <lineSegments key={kind} geometry={geometry}>
            {style.dash ? (
              <lineDashedMaterial
                color={highlighted ? palette.primary : color}
                dashSize={style.dash.size}
                gapSize={style.dash.gap}
                transparent
                opacity={opacity}
              />
            ) : (
              <lineBasicMaterial
                color={highlighted ? palette.primary : color}
                transparent
                opacity={opacity}
              />
            )}
          </lineSegments>
        );
      })}
    </group>
  );
};
