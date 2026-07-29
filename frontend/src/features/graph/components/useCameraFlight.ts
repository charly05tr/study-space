import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { PositionedNode } from '../types';

/** How far the camera settles from the node it framed. */
const VIEWING_DISTANCE = 34;
/** Long enough to read as travel, short enough not to be a wait. */
const FLIGHT_MS = 650;

/** Slow at both ends, quick through the middle. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

interface OrbitLike {
  target: THREE.Vector3;
  update: () => void;
  // Narrowed to the one event this needs: OrbitControls types its listeners
  // against a keyed event map, so a plain `string` is not assignable.
  addEventListener: (type: 'start', listener: () => void) => void;
  removeEventListener: (type: 'start', listener: () => void) => void;
}

interface Flight {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  elapsed: number;
}

/**
 * Flies the camera to a node instead of letting the user fly themselves.
 *
 * Free orbit is the fastest way to get lost in a three-dimensional graph: after
 * a few seconds of dragging there is no up, no origin and no way back. Moving
 * *to* things keeps every journey anchored to something the user chose, and the
 * approach itself is what reveals the labels.
 *
 * Timed and eased, not a fixed fraction per frame. A `lerp(goal, 0.08)` never
 * actually arrives — it approaches asymptotically, so the last stretch crawls
 * and the camera reads as if it were stuck just short of the target. A duration
 * with an ease has a real beginning and a real end.
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
  const flight = useRef<Flight | null>(null);

  useEffect(() => {
    if (!target) return;

    const destination = new THREE.Vector3(target.x, target.y, target.z);
    const origin = controls.current?.target ?? new THREE.Vector3();
    const direction = camera.position.clone().sub(origin);

    // A degenerate direction happens only if the camera sits exactly on its own
    // target; any fixed axis is as good as another to back away along.
    if (direction.lengthSq() < 1e-6) direction.set(0, 0, 1);

    flight.current = {
      from: camera.position.clone(),
      to: destination.clone().add(direction.normalize().multiplyScalar(VIEWING_DISTANCE)),
      fromTarget: origin.clone(),
      toTarget: destination,
      elapsed: 0,
    };
  }, [target, camera, controls]);

  /**
   * Taking hold of the map abandons the trip.
   *
   * Otherwise a drag during a flight is two things writing to the same camera
   * every frame, which is exactly the fight that makes a 3D view feel broken.
   */
  useEffect(() => {
    const instance = controls.current;
    if (!instance) return;

    const cancel = () => {
      flight.current = null;
    };
    instance.addEventListener('start', cancel);
    return () => instance.removeEventListener('start', cancel);
  }, [controls]);

  useFrame((_, delta) => {
    const current = flight.current;
    if (!current) return;

    // Driven by elapsed time, not by frame count, so the same journey takes the
    // same time on a 144Hz display as on a struggling one.
    current.elapsed = Math.min(current.elapsed + delta * 1000, FLIGHT_MS);
    const progress = ease(current.elapsed / FLIGHT_MS);

    camera.position.lerpVectors(current.from, current.to, progress);
    if (controls.current) {
      controls.current.target.lerpVectors(current.fromTarget, current.toTarget, progress);
      controls.current.update();
    }

    if (current.elapsed >= FLIGHT_MS) flight.current = null;
  });
};
