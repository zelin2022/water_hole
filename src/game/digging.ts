import { type Point, type World } from './world';

export const DIG_REACH_PADDING = 12;
export const MATERIAL_DURABILITY: Readonly<Record<number, number>> = { 1: 1, 2: 3 };

export interface StrikeResult {
  damaged: number;
  removed: number;
  center: Point;
}

/** Mouse distance cannot change reach. A coincident aim uses character facing. */
export function strikeCenter(origin: Point, aim: Point, radius: number, facing = 1): Point {
  const dx = aim.x - origin.x;
  const dy = aim.y - origin.y;
  const distance = Math.hypot(dx, dy);
  const reach = radius + DIG_REACH_PADDING;
  if (distance === 0) return { x: origin.x + Math.sign(facing || 1) * reach, y: origin.y };
  return { x: origin.x + dx / distance * reach, y: origin.y + dy / distance * reach };
}

/**
 * A single impact, independent of swing timing. Damage the circular brush as one
 * snapshot: a closer face outside the brush intercepts the hit, but contiguous
 * rock within the brush can break together so one swing removes a useful bite.
 * Intercepted faces also receive the strike, avoiding an undiggable near gap.
 */
export function damageStrike(
  world: World, origin: Point, aim: Point, radius: number, damage: number, facing = 1,
): StrikeResult {
  const center = strikeCenter(origin, aim, radius, facing);
  const result = { damaged: 0, removed: 0, center };
  if (![origin.x, origin.y, aim.x, aim.y, radius, damage].every(Number.isFinite)
    || radius <= 0 || damage <= 0) return result;

  const size = world.cellSize;
  const withinBrush = (x: number, y: number): boolean => (
    ((x + 0.5) * size - center.x) ** 2 + ((y + 0.5) * size - center.y) ** 2 <= radius ** 2
  );
  const brushTouchesCell = (x: number, y: number): boolean => {
    const dx = Math.max(x * size - center.x, 0, center.x - (x + 1) * size);
    const dy = Math.max(y * size - center.y, 0, center.y - (y + 1) * size);
    return dx * dx + dy * dy <= radius * radius;
  };
  const minX = Math.max(1, Math.floor((center.x - radius) / size));
  const maxX = Math.min(world.width - 2, Math.floor((center.x + radius) / size));
  const minY = Math.max(1, Math.floor((center.y - radius) / size));
  const maxY = Math.min(world.height - 2, Math.floor((center.y + radius) / size));
  const struck = new Set<number>();

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!withinBrush(x, y)) continue;
      const dx = (x + 0.5) * size - origin.x;
      const dy = (y + 0.5) * size - origin.y;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (size / 3)));
      let blocked = false;
      let lastRock = -1;
      for (let step = 1; step < steps; step++) {
        const rayX = Math.floor((origin.x + dx * step / steps) / size);
        const rayY = Math.floor((origin.y + dy * step / steps) / size);
        if (!world.isSolid(rayX, rayY)) {
          // A separate rock face beyond a nearer one cannot be hit through it.
          if (lastRock >= 0) {
            struck.add(lastRock);
            blocked = true;
            break;
          }
          continue;
        }
        if (brushTouchesCell(rayX, rayY)) {
          lastRock = world.index(rayX, rayY);
          continue;
        }
        if (rayX > 0 && rayY > 0 && rayX < world.width - 1 && rayY < world.height - 1) {
          struck.add(world.index(rayX, rayY));
        }
        blocked = true;
        break;
      }
      if (!blocked && world.isSolid(x, y)) struck.add(world.index(x, y));
    }
  }

  for (const index of struck) {
    result.damaged++;
    world.damage[index] += damage;
    if (world.damage[index] >= (MATERIAL_DURABILITY[world.material[index]] ?? 1)) {
      world.setSolid(index % world.width, Math.floor(index / world.width), false);
      result.removed++;
    } else {
      // Damage cracks are a terrain visual change even before collision changes.
      world.terrainVersion++;
    }
  }
  return result;
}
