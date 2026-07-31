import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
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
  showEdges: boolean;
  onPick: (id: string | null) => void;
  onNodeMenu: (id: string, x: number, y: number) => void;
  /** The context died and is not coming back; only a fresh canvas will do. */
  onContextUnrecoverable: () => void;
}

/** Anything further than this from the focus stays a point, not a word. */
const LABEL_RADIUS = 46;
/** Ceiling on labels, so a hub with forty links does not become a wall of text. */
const MAX_LABELS = 14;

/**
 * How long to wait for the browser to hand the context back before rebuilding.
 *
 * Long enough for a genuine loss — a GPU reset, a laptop waking up — to restore
 * itself without the scene being thrown away, and short enough that a context
 * killed deliberately, which is never restored, does not leave a dead map on
 * screen while the user is looking at it.
 */
const RECOVERY_GRACE = 600;

export const GraphScene = ({
  layout,
  palette,
  focusedId,
  showEdges,
  onPick,
  onNodeMenu,
  onContextUnrecoverable,
}: GraphSceneProps) => {
  const { camera, gl, invalidate } = useThree();

  /**
   * Keeps picking working when the render loop is not.
   *
   * Raycasting is built from the camera's world matrix, and that matrix is
   * normally refreshed as a side effect of rendering a frame. Lose the WebGL
   * context — which a page holding two canvases does eventually, and which the
   * console announces as "THREE.WebGLRenderer: Context Lost" — and the loop
   * stops updating it while the last frame stays on screen. The map then looks
   * perfectly alive and every click is tested against where the camera used to
   * be, so they land on nothing. It is the same failure the initial framing
   * effect below already had to defend against, arriving by a different road.
   *
   * Capture phase, so it runs before r3f's own listener builds the ray.
   */
  useEffect(() => {
    const canvas = gl.domElement;
    const refresh = () => camera.updateMatrixWorld();

    canvas.addEventListener('pointerdown', refresh, { capture: true });
    canvas.addEventListener('pointermove', refresh, { capture: true });
    return () => {
      canvas.removeEventListener('pointerdown', refresh, { capture: true });
      canvas.removeEventListener('pointermove', refresh, { capture: true });
    };
  }, [gl, camera]);

  /**
   * Brings the map back after the WebGL context dies under it.
   *
   * This is not defensive programming for a rare driver hiccup — it happens on
   * ordinary navigation, and the cause is in r3f itself. Its teardown defers
   * cleanup by half a second with no guard:
   *
   *     setTimeout(() => { state.gl?.forceContextLoss(); _roots.delete(canvas) }, 500)
   *
   * while `createRoot` REUSES the previous renderer whenever the canvas is
   * still in `_roots`. Mount a canvas, unmount it, and mount another onto the
   * same DOM element inside that window — which is what a remount does — and
   * the stray timeout fires `forceContextLoss()` on the renderer that is now
   * live. The console says so twice: "R3F.createRoot should only be called
   * once!" on the way in, "THREE.WebGLRenderer: Context Lost" on the way out.
   *
   * What that leaves behind is the nastiest possible state: the last frame
   * stays on screen, so the map looks perfectly alive, but the render loop has
   * stopped refreshing the camera's world matrix — and picking is built from
   * that matrix. Every click is then tested against where the camera used to
   * be and lands on nothing.
   *
   * The first move is still to cancel the event, which is the only thing that
   * lets the browser offer the context back. But a context killed on purpose is
   * never offered back, so after a short grace we give up and ask to be rebuilt
   * on a FRESH canvas element — the one thing that guarantees r3f cannot hand
   * us the poisoned renderer again, since `_roots` is keyed by that element.
   */
  useEffect(() => {
    const canvas = gl.domElement;
    let recovery: number | undefined;

    const onLost = (event: Event) => {
      event.preventDefault();
      window.clearTimeout(recovery);
      recovery = window.setTimeout(onContextUnrecoverable, RECOVERY_GRACE);
    };

    const onRestored = () => {
      window.clearTimeout(recovery);
      // The loop resumes on its own, but the matrix it left stale is the one
      // picking reads, and nothing else will touch it until the camera moves.
      camera.updateMatrixWorld();
      invalidate();
    };

    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      window.clearTimeout(recovery);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [gl, camera, invalidate, onContextUnrecoverable]);
  // Typed off the component rather than reaching into three-stdlib: the impl
  // package is a transitive dependency, so importing it directly would break
  // the moment drei changed how it is vendored.
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const focused = focusedId ? (layout.byId.get(focusedId) ?? null) : null;

  /**
   * How far back the whole map fits on screen.
   *
   * One number for two jobs — the opening frame and where letting go returns
   * to — because they are the same viewpoint, and computing it twice is how
   * they would quietly drift apart.
   */
  const homeDistance = useMemo(
    () =>
      Math.max(...layout.nodes.map((node) => Math.hypot(node.x, node.y, node.z)), 20) * 2.4,
    [layout.nodes],
  );

  useCameraFlight(focused, controls, homeDistance);

  /**
   * Backs the camera off far enough to hold the whole map on arrival.
   *
   * A fixed starting distance shows a twelve-block graph as a speck and cuts a
   * five-hundred-block one in half.
   *
   * Keyed on WHICH blocks are on the map, not on the layout object. Comparing
   * object identity re-framed the camera every time the payload was refetched —
   * so drawing a relation yanked the view back to the whole graph, mid-thought.
   * Only a genuinely different set of blocks deserves a new frame.
   */
  const nodeSignature = useMemo(
    () => layout.nodes.map((node) => node.id).join('|'),
    [layout.nodes],
  );
  const framed = useRef<string | null>(null);

  useEffect(() => {
    if (layout.nodes.length === 0 || framed.current === nodeSignature) return;
    framed.current = nodeSignature;

    camera.position.set(0, 0, homeDistance);
    camera.lookAt(0, 0, 0);
    /**
     * Raycasting reads the camera's world matrix, and moving `position` alone
     * does not refresh it. Until something else recomputed it — an orbit drag,
     * a resize — clicks were being tested against where the camera used to be,
     * so they landed on nothing. `controls.update()` would do it too, but only
     * if the ref is already attached, which is not something to depend on.
     */
    camera.updateMatrixWorld();

    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
  }, [layout, nodeSignature, camera, homeDistance]);

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

  /**
   * The hovered node always gets a label, even with nothing focused.
   *
   * Without it the map is a field of anonymous points until you commit to
   * clicking one — you cannot tell what anything is before choosing it.
   */
  const hovered = hoveredId ? (layout.byId.get(hoveredId) ?? null) : null;
  const alreadyLabelled = hovered ? labelled.some((node) => node.id === hovered.id) : false;

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
        maxDistance={1200}
      />

      {/*
        Double click, not click.

        Dragging to orbit ends in a pointerup on this backdrop, which counts as
        a click — so every rotation dropped the focus, hid the labels and drained
        the colour out of the map. Turning the view is the most common thing
        anyone does here; it must not also be the gesture that undoes their
        selection. Letting go of a block is now something you have to mean.
      */}
      <mesh onDoubleClick={() => onPick(null)} visible={false}>
        <sphereGeometry args={[2000, 4, 4]} />
        <meshBasicMaterial side={2} />
      </mesh>

      {showEdges && <GraphEdges layout={layout} palette={palette} focusedId={focusedId} />}

      <GraphNodes
        layout={layout}
        palette={palette}
        focusedId={focusedId}
        neighbourIds={neighbourIds}
        hoveredId={hoveredId}
        onPick={onPick}
        onHover={setHoveredId}
        onContextMenu={onNodeMenu}
      />

      {labelled.map((node) => (
        <NodeLabel key={node.id} node={node} focused={node.id === focused?.id} />
      ))}

      {hovered && !alreadyLabelled && <NodeLabel node={hovered} focused />}
    </>
  );
};
