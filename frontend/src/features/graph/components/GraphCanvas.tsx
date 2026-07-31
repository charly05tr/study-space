import {
  Canvas,
  events as pointerEvents,
  type ComputeFunction,
  type RootState,
} from '@react-three/fiber';
import { useCallback, useState } from 'react';
import { useGraphPalette } from '../hooks/useGraphPalette';
import type { GraphLayout } from '../types';
import { GraphScene } from './GraphScene';

/**
 * Aims the picking ray from where the canvas ACTUALLY is, right now.
 *
 * r3f's default builds it from `event.offsetX / state.size.width`, and
 * `state.size` is a cached measurement of the canvas's parent taken by a
 * ResizeObserver. When that measurement is stale the ray is divided by the
 * wrong number and shoots off somewhere else entirely — while the scene keeps
 * rendering perfectly, because rendering never consults it. The result is a map
 * that looks completely alive and silently ignores the mouse.
 *
 * That is what made this survive a reload: the measurement is not stale because
 * of anything left over in memory, it is taken wrong whenever the canvas is
 * mounted into a layout that has not settled — arriving at a page already
 * scrolled, which is exactly what happens when you come back to a studyspace
 * rather than scrolling down to the map yourself.
 *
 * `getBoundingClientRect` at event time cannot go stale. It is a read per
 * click and per move, which is nothing next to the raycast that follows it.
 */
const computeFromLiveRect: ComputeFunction = (event, state: RootState) => {
  const rect = state.gl.domElement.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  state.pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  state.raycaster.setFromCamera(state.pointer, state.camera);
};

interface GraphCanvasProps {
  layout: GraphLayout;
  focusedId: string | null;
  showEdges?: boolean;
  onPick: (id: string | null) => void;
  onNodeMenu?: (id: string, x: number, y: number) => void;
}

export const GraphCanvas = ({
  layout,
  focusedId,
  showEdges = true,
  onPick,
  // The embedded section stays read-only; only the full map offers actions.
  onNodeMenu = () => {},
}: GraphCanvasProps) => {
  const palette = useGraphPalette();

  /**
   * Bumped to rebuild the map on a brand new canvas element.
   *
   * The element itself is the point, not the React subtree: r3f keys its roots
   * by the canvas DOM node and will reuse the renderer it finds there, so
   * recovering from a killed context means arriving at a node it has never
   * seen. `key` is what makes React create one instead of reusing this one.
   */
  const [generation, setGeneration] = useState(0);

  // Stable, because the scene installs it in an effect that must not re-run.
  const rebuild = useCallback(() => setGeneration((current) => current + 1), []);

  return (
    <Canvas
      key={generation}
      // Drawn on the page colour rather than the usual black, so the map belongs
      // to the same sheet of paper as the notes it came from.
      style={{ background: palette.page }}
      // Only the starting guess; GraphScene reframes it around the actual
      // extent of the map as soon as the layout exists.
      camera={{ position: [0, 0, 140], fov: 55, near: 0.1, far: 6000 }}
      // Capped: a scene of static points gains nothing from rendering at 3x on a
      // retina display, and the cost is real.
      dpr={[1, 1.75]}
      events={(store) => ({ ...pointerEvents(store), compute: computeFromLiveRect })}
    >
      <GraphScene
        layout={layout}
        palette={palette}
        focusedId={focusedId}
        showEdges={showEdges}
        onPick={onPick}
        onNodeMenu={onNodeMenu}
        onContextUnrecoverable={rebuild}
      />
    </Canvas>
  );
};
