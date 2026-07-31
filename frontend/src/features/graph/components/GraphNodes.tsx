import { useEffect, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { nodeRadius, type GraphPalette } from '../graphStyle';
import type { GraphLayout } from '../types';

interface GraphNodesProps {
  layout: GraphLayout;
  palette: GraphPalette;
  focusedId: string | null;
  neighbourIds: Set<string>;
  hoveredId: string | null;
  onPick: (id: string) => void;
  onHover: (id: string | null) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
}

const dummy = new THREE.Object3D();
const colour = new THREE.Color();

/**
 * How far the pointer may travel between press and release and still count.
 *
 * Small enough that a deliberate orbit never selects anything — six pixels of
 * rotation is not a gesture anyone means — and large enough to absorb the drift
 * of pressing a mouse button, which is what was eating clicks.
 */
const CLICK_SLOP = 6;

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
  hoveredId,
  onPick,
  onHover,
  onContextMenu,
}: GraphNodesProps) => {
  const mesh = useRef<THREE.InstancedMesh>(null);

  /** The node the pointer went down on, and where on screen that happened. */
  const pressed = useRef<{ id: string; x: number; y: number } | null>(null);

  /**
   * Selection is resolved on pointerUP, from the node the press STARTED on.
   *
   * r3f's own `onClick` could not do this. It only forwards a click to an object
   * that was also hit on pointerdown (see `initialHits` in its event system),
   * and every node here lives in one InstancedMesh — so letting go a few pixels
   * off the sphere left the mesh out of the hit list and the click vanished with
   * no feedback at all. Nodes are barely ten pixels across at the distance the
   * camera frames the map from, and orbiting means the pointer is nearly always
   * drifting a little, so this was firing constantly.
   *
   * Listening on the window rather than on the mesh for the same reason: by the
   * time the button comes up the ray may be nowhere near the sphere, and a
   * handler on the mesh would never run.
   */
  useEffect(() => {
    const release = (event: PointerEvent) => {
      const start = pressed.current;
      pressed.current = null;
      if (!start) return;

      // A drag is an orbit, not a choice. Only a press that stayed put is a pick.
      const travelled = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (travelled > CLICK_SLOP) return;

      // `detail` counts the clicks of the run this release belongs to, so
      // anything past the first is part of a double click — a gesture that
      // means the opposite of picking. Without this, letting go of a node by
      // double clicking it re-selected the node in between, and one gesture
      // ended up firing three changes of state.
      if (event.detail > 1) return;

      onPick(start.id);
    };

    const abandon = () => {
      pressed.current = null;
    };

    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', abandon);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', abandon);
    };
  }, [onPick]);

  /**
   * Layout effect, not a passive one, and the difference is the whole bug.
   *
   * Instance matrices are what picking is tested against, and a plain effect
   * leaves them zeroed across a paint — a window in which a pointer move can
   * reach the canvas and poison the cached bounding sphere below. A layout
   * effect runs synchronously after the commit, before the browser paints and
   * therefore before it can dispatch a single pointer event, so the mesh is
   * never reachable in its blank state.
   */
  useLayoutEffect(() => {
    const instances = mesh.current;
    if (!instances) return;

    const ink = new THREE.Color(palette.ink);
    const muted = new THREE.Color(palette.muted);
    const primary = new THREE.Color(palette.primary);

    layout.nodes.forEach((node, index) => {
      dummy.position.set(node.x, node.y, node.z);
      const radius = nodeRadius(node.degree);
      // Hovering swells the node as well as labelling it: at a distance the
      // label alone does not tell you WHICH point it belongs to.
      const emphasis = node.id === focusedId ? 1.35 : node.id === hoveredId ? 1.25 : 1;
      dummy.scale.setScalar(radius * emphasis);
      dummy.updateMatrix();
      instances.setMatrixAt(index, dummy.matrix);

      if (node.id === focusedId) colour.copy(primary);
      else if (node.id === hoveredId) colour.copy(primary).lerp(ink, 0.25);
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

    /**
     * Recomputed here, and this is not an optimisation — picking does not work
     * without it.
     *
     * `InstancedMesh.raycast` tests a bounding sphere before it looks at a
     * single instance, and it builds that sphere LAZILY, on the first raycast,
     * then caches it forever:
     *
     *     if (this.boundingSphere === null) this.computeBoundingSphere()
     *     if (raycaster.ray.intersectsSphere(sphere) === false) return
     *
     * A mesh is created with its instance matrices zeroed, and the real ones
     * are written right here, in an effect — after the commit. r3f raycasts on
     * every pointer move over the canvas, so a single move landing in that gap
     * computes the sphere from nothing but zeroes and every later pick bails at
     * that `return`. The scene keeps drawing perfectly; the map simply stops
     * answering the mouse, permanently.
     *
     * The gap is only reachable when the canvas mounts UNDER the cursor, which
     * is exactly what happens when you come back to a studyspace already
     * scrolled to the map, or reload onto it — and never when you scroll down
     * to it yourself. That is why it survived a reload and looked random.
     */
    instances.computeBoundingSphere();
  }, [layout, palette, focusedId, neighbourIds, hoveredId]);

  if (layout.nodes.length === 0) return null;

  return (
    <instancedMesh
      ref={mesh}
      // The count is fixed at creation, so the key forces a fresh mesh when the
      // graph grows rather than silently dropping the extra nodes.
      key={layout.nodes.length}
      args={[undefined, undefined, layout.nodes.length]}
      onPointerDown={(event) => {
        const index = event.instanceId;
        if (index === undefined) return;
        // Left button only: a right press belongs to the context menu, and
        // selecting the node under it would move the camera out from under it.
        if (event.nativeEvent.button !== 0) return;

        // r3f-local only — it does not touch the native event, so OrbitControls
        // still gets its own listener and a drag that starts on a node orbits.
        event.stopPropagation();
        pressed.current = {
          id: layout.nodes[index].id,
          x: event.nativeEvent.clientX,
          y: event.nativeEvent.clientY,
        };
      }}
      onContextMenu={(event) => {
        const index = event.instanceId;
        if (index === undefined) return;
        event.stopPropagation();
        // Suppresses the browser's own menu, which would otherwise cover this
        // one; r3f only forwards the synthetic event.
        event.nativeEvent.preventDefault();
        onContextMenu(layout.nodes[index].id, event.nativeEvent.clientX, event.nativeEvent.clientY);
      }}
      // pointermove, not pointerover: one instanced mesh is a single object,
      // so moving between two nodes never fires over/out and the label would
      // stay stuck on whichever one was entered first.
      onPointerMove={(event) => {
        event.stopPropagation();
        const index = event.instanceId;
        onHover(index === undefined ? null : layout.nodes[index].id);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        onHover(null);
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
