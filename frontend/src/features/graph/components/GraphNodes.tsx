import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { nodeRadius, type GraphPalette } from '../graphStyle';
import type { GraphLayout } from '../types';

interface GraphNodesProps {
  layout: GraphLayout;
  palette: GraphPalette;
  focusedId: string | null;
  neighbourIds: Set<string>;
  onPick: (id: string) => void;
}

const dummy = new THREE.Object3D();
const colour = new THREE.Color();

/**
 * Every node in one instanced mesh.
 *
 * A mesh per node would put the draw call count on the same curve as the user's
 * note-taking, which is the wrong thing to make expensive.
 *
 * Colour carries the whole navigation story: the graph is ink on paper, and
 * goldenrod means "this is what you are looking at". Nothing else is coloured,
 * so attention has somewhere to land.
 */
export const GraphNodes = ({
  layout,
  palette,
  focusedId,
  neighbourIds,
  onPick,
}: GraphNodesProps) => {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const instances = mesh.current;
    if (!instances) return;

    const ink = new THREE.Color(palette.ink);
    const muted = new THREE.Color(palette.muted);
    const primary = new THREE.Color(palette.primary);

    layout.nodes.forEach((node, index) => {
      dummy.position.set(node.x, node.y, node.z);
      const radius = nodeRadius(node.degree);
      dummy.scale.setScalar(node.id === focusedId ? radius * 1.35 : radius);
      dummy.updateMatrix();
      instances.setMatrixAt(index, dummy.matrix);

      if (node.id === focusedId) colour.copy(primary);
      else if (neighbourIds.has(node.id)) colour.copy(primary).lerp(ink, 0.45);
      // An orphan is still a node — its paragraph is gone, the thinking is not.
      // Drawn as a ghost so it reads as absent without disappearing.
      else if (node.orphan) colour.copy(muted).lerp(new THREE.Color(palette.page), 0.55);
      else colour.copy(ink);

      // Everything outside the neighbourhood recedes towards the paper.
      if (focusedId && node.id !== focusedId && !neighbourIds.has(node.id)) {
        colour.lerp(new THREE.Color(palette.page), 0.6);
      }

      instances.setColorAt(index, colour);
    });

    instances.instanceMatrix.needsUpdate = true;
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
  }, [layout, palette, focusedId, neighbourIds]);

  if (layout.nodes.length === 0) return null;

  return (
    <instancedMesh
      ref={mesh}
      // The count is fixed at creation, so the key forces a fresh mesh when the
      // graph grows rather than silently dropping the extra nodes.
      key={layout.nodes.length}
      args={[undefined, undefined, layout.nodes.length]}
      onClick={(event) => {
        event.stopPropagation();
        const index = event.instanceId;
        if (index !== undefined) onPick(layout.nodes[index].id);
      }}
      onPointerOver={() => {
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      <sphereGeometry args={[1, 20, 20]} />
      {/* Unlit on purpose: shading a sphere gives it a plastic highlight, and
          the page should read as paper and ink, not as a rendered object. */}
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
};
