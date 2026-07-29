import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { PositionedNode } from '../types';

/** How far the camera settles from the node it framed. */
const VIEWING_DISTANCE = 34;
/** Fraction of the remaining distance covered each frame. */
const EASING = 0.08;

interface OrbitLike {
  target: THREE.Vector3;
  update: () => void;
}

/**
 * Flies the camera to a node instead of letting the user fly themselves.
 *
 * Free orbit is the fastest way to get lost in a three-dimensional graph: after
 * a few seconds of dragging there is no up, no origin and no way back. Moving
 * *to* things keeps every journey anchored to something the user chose, and the
 * approach itself is what reveals the labels.
 *
 * The camera keeps its current direction and only closes the distance, so
 * arriving somewhere never spins the world around — the map the user has in
 * their head survives the trip.
 */
export const useCameraFlight = (
  target: PositionedNode | null,
  controls: React.RefObject<OrbitLike | null>,
) => {
  const { camera } = useThree();
  const goal = useRef<THREE.Vector3 | null>(null);
  const lookAt = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (!target) return;

    const destination = new THREE.Vector3(target.x, target.y, target.z);
    const direction = camera.position.clone().sub(controls.current?.target ?? new THREE.Vector3());

    // A degenerate direction happens only if the camera sits exactly on its own
    // target; any fixed axis is as good as another to back away along.
    if (direction.lengthSq() < 1e-6) direction.set(0, 0, 1);

    goal.current = destination.clone().add(direction.normalize().multiplyScalar(VIEWING_DISTANCE));
    lookAt.current = destination;
  }, [target, camera, controls]);

  useFrame(() => {
    if (!goal.current || !lookAt.current) return;

    camera.position.lerp(goal.current, EASING);
    if (controls.current) {
      controls.current.target.lerp(lookAt.current, EASING);
      controls.current.update();
    }

    // Close enough that another frame would move it by less than a pixel.
    if (camera.position.distanceTo(goal.current) < 0.05) {
      goal.current = null;
      lookAt.current = null;
    }
  });
};
