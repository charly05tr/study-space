/**
 * Deterministic starting positions.
 *
 * A force simulation seeded at random lands somewhere different every run, and
 * that quietly destroys the only reason to draw this in three dimensions:
 * spatial memory. "It was over there, behind the big cluster" is worth nothing
 * if `over there` moves each time the page loads.
 *
 * Deriving the seed from the block's own id fixes that with no schema change —
 * the same idea starts in the same place forever, and the simulation then
 * settles it the same way.
 */

/** FNV-1a. Small, fast, and good enough to scatter ids evenly. */
const hash = (text: string): number => {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
};

/** Three uncorrelated numbers in [0,1) from one id. */
const triple = (id: string): [number, number, number] => [
  hash(id) / 0xffffffff,
  hash(`${id}/y`) / 0xffffffff,
  hash(`${id}/z`) / 0xffffffff,
];

/**
 * Places the id on a sphere rather than in a cube.
 *
 * A cube seeds the corners as densely as the middle, and the simulation then
 * spends its first iterations undoing that. Starting on a shell gets the forces
 * a rounder problem, so it converges to something readable sooner.
 */
export const seedPosition = (id: string, radius: number): { x: number; y: number; z: number } => {
  const [a, b, c] = triple(id);

  // Uniform on the sphere: acos keeps the poles from bunching up.
  const theta = 2 * Math.PI * a;
  const phi = Math.acos(2 * b - 1);
  // Cube root spreads points evenly through the volume instead of on the skin.
  const r = radius * Math.cbrt(0.2 + 0.8 * c);

  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.sin(phi) * Math.sin(theta),
    z: r * Math.cos(phi),
  };
};
