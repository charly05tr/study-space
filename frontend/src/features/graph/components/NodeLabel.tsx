import { Html } from '@react-three/drei';
import { nodeRadius } from '../graphStyle';
import type { PositionedNode } from '../types';

interface NodeLabelProps {
  node: PositionedNode;
  focused: boolean;
}

/**
 * Real DOM, not text painted into the scene.
 *
 * Only a handful of labels ever exist at once — the focused node and its direct
 * neighbours — so the usual reason to avoid HTML overlays does not apply, and
 * in exchange the map is lettered in the app's own serif rather than whatever
 * font a texture atlas happens to carry.
 */
export const NodeLabel = ({ node, focused }: NodeLabelProps) => (
  <Html
    position={[node.x, node.y + nodeRadius(node.degree) + 1.6, node.z]}
    center
    // Stops the label from being scaled by distance into illegibility, and from
    // eating clicks meant for the node behind it.
    distanceFactor={undefined}
    zIndexRange={[10, 0]}
    style={{ pointerEvents: 'none' }}
  >
    <span
      className={
        focused
          ? 'block max-w-56 truncate rounded-xs border border-primary/40 bg-page/90 px-2 py-0.5 text-center text-sm text-ink shadow-sm'
          : 'block max-w-40 truncate text-center text-xs text-muted'
      }
    >
      {node.text || <em className="text-muted/70">empty block</em>}
    </span>
  </Html>
);
