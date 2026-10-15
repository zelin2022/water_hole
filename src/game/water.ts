import type { Point, World } from './world';

const sweepDirections = new WeakMap<World, boolean>();

/** Cell quantities are 0..1. Gravity runs first, then supported water levels sideways. */
export function stepWater(world: World, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const rate = Math.min(1, dt * 30);
  const { water, solid, width, height } = world;

  // Bottom-up keeps a unit from falling through several cells in a single update.
  for (let y = height - 3; y >= 1; y -= 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const from = y * width + x;
      const below = from + width;
      if (solid[from] || solid[below] || water[from] <= 0) continue;
      const amount = Math.min(water[from], 1 - water[below]) * rate;
      water[from] -= amount;
      water[below] += amount;
    }
  }

  // Alternate the sweep to avoid a persistent left/right preference.
  const reverse = sweepDirections.get(world) ?? false;
  sweepDirections.set(world, !reverse);
  for (let y = height - 2; y >= 1; y -= 1) {
    for (let offset = 1; offset < width - 2; offset += 1) {
      const x = reverse ? width - 2 - offset : offset;
      const left = y * width + x;
      const right = left + 1;
      if (solid[left] || solid[right]) continue;
      const difference = water[left] - water[right];
      if (difference === 0) continue;
      const donor = difference > 0 ? left : right;
      const below = donor + width;
      if (!solid[below] && water[below] < 0.999) continue;
      const amount = Math.abs(difference) * 0.5 * rate;
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
