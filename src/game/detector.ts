import { World, type Point } from './world';

export interface WaterDetection { position: Point; distance: number; }

export function findNearestWater(world: World, position: Point, radius: number): WaterDetection | null {
  if (![position.x, position.y, radius].every(Number.isFinite) || radius < 0) return null;
  const minX = Math.max(1, Math.floor((position.x - radius) / world.cellSize));
  const maxX = Math.min(world.width - 2, Math.floor((position.x + radius) / world.cellSize));
  const minY = Math.max(1, Math.floor((position.y - radius) / world.cellSize));
  const maxY = Math.min(world.height - 2, Math.floor((position.y + radius) / world.cellSize));
  let nearest: WaterDetection | null = null;
  let nearestSquared = radius * radius;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const index = world.index(x, y);
      if (world.solid[index] || world.water[index] <= 0.001) continue;
      const center = { x: (x + 0.5) * world.cellSize, y: (y + 0.5) * world.cellSize };
      const squared = (center.x - position.x) ** 2 + (center.y - position.y) ** 2;
      if (squared > nearestSquared || (nearest && squared === nearestSquared)) continue;
      nearestSquared = squared;
      nearest = { position: center, distance: Math.sqrt(squared) };
    }
  }
  return nearest;
}
