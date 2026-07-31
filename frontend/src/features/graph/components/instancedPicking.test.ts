import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

/**
 * Why this file exists.
 *
 * `InstancedMesh.raycast` rejects the whole mesh on a bounding sphere before it
 * looks at any instance, and it builds that sphere lazily on the first raycast
 * and then caches it. A mesh whose instances have not been placed yet is a mesh
 * at the origin with no size, so a single raycast arriving in that window
 * cached an empty sphere and every later pick was refused — the map rendered
 * normally and stopped answering the mouse for good.
 *
 * These tests pin the three.js behaviour rather than our component: it is the
 * part that is surprising, and the part that would silently change the meaning
 * of `computeBoundingSphere()` in GraphNodes if it were ever dropped.
 */

/** Two unit spheres, placed well away from the origin, as the map places them. */
const place = (mesh: THREE.InstancedMesh) => {
  const at = new THREE.Object3D();
  [-40, 40].forEach((x, index) => {
    at.position.set(x, 0, 0);
    at.scale.setScalar(2);
    at.updateMatrix();
    mesh.setMatrixAt(index, at.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
};

/** A ray aimed straight down the -Z axis at the first instance. */
const rayAt = (x: number) => {
  const raycaster = new THREE.Raycaster();
  raycaster.set(new THREE.Vector3(x, 0, 100), new THREE.Vector3(0, 0, -1));
  return raycaster;
};

const build = () =>
  new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial(), 2);

describe('picking an InstancedMesh', () => {
  it('finds the instance the ray passes through', () => {
    const mesh = build();
    place(mesh);
    mesh.computeBoundingSphere();
    mesh.updateMatrixWorld(true);

    const hits: THREE.Intersection[] = [];
    mesh.raycast(rayAt(-40), hits);

    expect(hits[0]?.instanceId).toBe(0);
  });

  it('is refused forever once the sphere was cached before the instances moved', () => {
    const mesh = build();
    mesh.updateMatrixWorld(true);

    // The poisoning raycast: it arrives while every instance matrix is still
    // zeroed, and computing the sphere is a side effect of it.
    mesh.raycast(rayAt(-40), []);

    place(mesh);
    mesh.updateMatrixWorld(true);

    const hits: THREE.Intersection[] = [];
    mesh.raycast(rayAt(-40), hits);

    // Placing the instances is not enough — the stale sphere still rejects it.
    expect(hits).toHaveLength(0);
  });

  it('recovers as soon as the sphere is recomputed', () => {
    const mesh = build();
    mesh.updateMatrixWorld(true);
    mesh.raycast(rayAt(-40), []);

    place(mesh);
    // The one line GraphNodes adds after writing its matrices.
    mesh.computeBoundingSphere();
    mesh.updateMatrixWorld(true);

    const hits: THREE.Intersection[] = [];
    mesh.raycast(rayAt(-40), hits);

    expect(hits[0]?.instanceId).toBe(0);
  });
});
