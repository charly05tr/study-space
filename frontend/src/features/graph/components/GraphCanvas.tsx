import { Canvas } from '@react-three/fiber';
import { useGraphPalette } from '../hooks/useGraphPalette';
import type { GraphLayout } from '../types';
import { GraphScene } from './GraphScene';

interface GraphCanvasProps {
  layout: GraphLayout;
  focusedId: string | null;
  onPick: (id: string | null) => void;
}

export const GraphCanvas = ({ layout, focusedId, onPick }: GraphCanvasProps) => {
  const palette = useGraphPalette();

  return (
    <Canvas
      // Drawn on the page colour rather than the usual black, so the map belongs
      // to the same sheet of paper as the notes it came from.
      style={{ background: palette.page }}
      camera={{ position: [0, 0, 140], fov: 55, near: 0.1, far: 2000 }}
      // Capped: a scene of static points gains nothing from rendering at 3x on a
      // retina display, and the cost is real.
      dpr={[1, 1.75]}
    >
      <GraphScene layout={layout} palette={palette} focusedId={focusedId} onPick={onPick} />
    </Canvas>
  );
};
