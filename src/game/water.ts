import type { Point, World } from './world';

const sweepDirections = new WeakMap<World, boolean>();
const scratchBuffers = new WeakMap<World, { supported: Uint8Array; activeRows: Uint8Array }>();
export const WATER_STEPS_PER_SECOND = 120;
// Keep sub-pixel residue accounted for in place. Repeated transfers below
// Float32 precision should not erode the conserved volume.
const MIN_WATER_FLOW = 1e-6;

/** Capacity-limited transfers keep a body coherent, with bounded small fluid steps. */
export function stepWater(world: World, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const steps = Math.min(8, Math.ceil(dt * WATER_STEPS_PER_SECOND));
  const rate = Math.min(1, dt * WATER_STEPS_PER_SECOND / steps);
  let scratch = scratchBuffers.get(world);
  if (!scratch) {
    scratch = { supported: new Uint8Array(world.water.length), activeRows: new Uint8Array(world.height) };
    scratchBuffers.set(world, scratch);
  }
  const { activeRows } = scratch, { water, width, height } = world;
  activeRows.fill(0);
  // Rebuild cheaply from the actual liquid, so generation, collection and old
  // saves need no extra bookkeeping. Empty rows need no fluid or support work.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (water[y * width + x] > MIN_WATER_FLOW) { activeRows[y] = 1; break; }
    }
  }
  for (let step = 0; step < steps; step++) flowWater(world, scratch.supported, activeRows, rate);
}

function flowWater(world: World, supported: Uint8Array, activeRows: Uint8Array, rate: number): void {
  const { water, solid, width, height } = world;

  // Move into available capacity, rather than multiplying each row's vacancy
  // by a fraction. A full column can then follow its leading edge together.
  for (let y = height - 3; y >= 1; y -= 1) {
    if (!activeRows[y]) continue;
    for (let x = 1; x < width - 1; x += 1) {
      const from = y * width + x;
      const below = from + width;
      if (solid[from] || solid[below] || water[from] <= 0) continue;
      const amount = Math.min(water[from], 1 - water[below], rate);
      if (amount <= MIN_WATER_FLOW) continue;
      water[from] -= amount;
      water[below] += amount;
      activeRows[y + 1] = 1;
    }
  }

  // A liquid column that has landed can spread at every height, even while new
  // water arrives above it. Local transfer activity alone cannot distinguish
  // that column from an unsupported falling body. Propagate floor support up
  // through actual liquid, never through air gaps or solid terrain.
  supported.fill(0);
  for (let y = height - 2; y >= 1; y--) {
    if (!activeRows[y]) continue;
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x, below = index + width;
      if (!solid[index] && water[index] > MIN_WATER_FLOW && (solid[below] || supported[below])) supported[index] = 1;
    }
  }

  // Alternate the sweep to avoid a persistent left/right preference.
  const reverse = sweepDirections.get(world) ?? false;
  sweepDirections.set(world, !reverse);

  // Supported water can spill over a ledge or down an excavated staircase.
  // Both orthogonal cells must be open: touching rock corners never leak.
  // A moving body over air keeps falling instead of dispersing sideways.
  for (let y = height - 3; y >= 1; y--) {
    if (!activeRows[y]) continue;
    for (let offset = 1; offset < width - 1; offset++) {
      const x = reverse ? width - 1 - offset : offset;
      const from = y * width + x, below = from + width;
      if (!supported[from] || water[from] <= 0) continue;
      for (let side = 0; side < 2 && water[from] > 0; side++) {
        const direction = (side === 0) !== reverse ? -1 : 1;
        const adjacent = from + direction, destination = below + direction;
        if (solid[adjacent] || solid[destination]) continue;
        const amount = Math.min(water[from], 1 - water[destination], rate);
        if (amount <= MIN_WATER_FLOW) continue;
        water[from] -= amount;
        water[destination] += amount;
        activeRows[y + 1] = 1;
      }
    }
  }

  for (let y = height - 2; y >= 1; y -= 1) {
    if (!activeRows[y]) continue;
    for (let offset = 1; offset < width - 2; offset += 1) {
      const x = reverse ? width - 2 - offset : offset;
      const left = y * width + x;
      const right = left + 1;
      if (solid[left] || solid[right]) continue;
      const difference = water[left] - water[right];
      if (difference === 0) continue;
      const donor = difference > 0 ? left : right;
      if (!supported[donor]) continue;
      const amount = Math.abs(difference) * 0.5 * rate;
      if (amount <= MIN_WATER_FLOW) continue;
      if (difference > 0) {
        water[left] -= amount;
        water[right] += amount;
      } else {
        water[right] -= amount;
        water[left] += amount;
      }
    }
  }
}

export function totalWater(world: World): number {
  let total = 0;
  for (const amount of world.water) total += amount;
  return total;
}

/** Removes visible nearby water; returns the quantity transferred to the caller. */
export function collectWater(world: World, position: Point, radius: number, maxAmount: number): number {
  if (![position.x, position.y, radius, maxAmount].every(Number.isFinite)
    || radius <= 0 || maxAmount <= 0 || world.isSolidAtPixel(position.x, position.y)) return 0;
  const size = world.cellSize;
  const minX = Math.max(1, Math.floor((position.x - radius) / size));
  const maxX = Math.min(world.width - 2, Math.floor((position.x + radius) / size));
  const minY = Math.max(1, Math.floor((position.y - radius) / size));
  const maxY = Math.min(world.height - 2, Math.floor((position.y + radius) / size));
  const radiusSquared = radius * radius;
  let collected = 0;

  for (let y = minY; y <= maxY && collected < maxAmount; y += 1) {
    for (let x = minX; x <= maxX && collected < maxAmount; x += 1) {
      const index = world.index(x, y);
      if (world.solid[index] || world.water[index] <= 0) continue;
      const target = { x: (x + 0.5) * size, y: (y + 0.5) * size };
      if ((target.x - position.x) ** 2 + (target.y - position.y) ** 2 > radiusSquared
        || !clearPath(world, position, target)) continue;
      const amount = Math.min(world.water[index], maxAmount - collected);
      world.water[index] -= amount;
      collected += amount;
    }
  }
  return collected;
}

/** Traverse every grid cell intersected by a ray, including both sides of corners. */
function clearPath(world: World, from: Point, to: Point): boolean {
  const size = world.cellSize;
  let x = Math.floor(from.x / size);
  let y = Math.floor(from.y / size);
  const endX = Math.floor(to.x / size);
  const endY = Math.floor(to.y / size);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const deltaX = dx === 0 ? Infinity : size / Math.abs(dx);
  const deltaY = dy === 0 ? Infinity : size / Math.abs(dy);
  let nextX = dx === 0 ? Infinity : ((stepX > 0 ? (x + 1) * size : x * size) - from.x) / dx;
  let nextY = dy === 0 ? Infinity : ((stepY > 0 ? (y + 1) * size : y * size) - from.y) / dy;

  while (x !== endX || y !== endY) {
    if (nextX < nextY) {
      x += stepX;
      nextX += deltaX;
    } else if (nextY < nextX) {
      y += stepY;
      nextY += deltaY;
    } else {
      if (world.isSolid(x + stepX, y) || world.isSolid(x, y + stepY)) return false;
      x += stepX;
      y += stepY;
      nextX += deltaX;
      nextY += deltaY;
    }
    if (world.isSolid(x, y)) return false;
  }
  return true;
}
