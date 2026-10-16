import type { Point, World } from './world';

/** A cosmetic dirt cell: terrain collision is removed before it starts falling. */
export interface FallingDirt { x: number; y: number; vy: number }
export interface DirtRegion { center: Point; radius: number }
export const MAX_DIRT_ISLAND = 3;
export const DIRT_GRAVITY = 640;
export const DIRT_TERMINAL_SPEED = 640;

/**
 * A bounded flood fill needs at most four dirt cells to reject a large island.
 * Stone or reinforced foundation anchors dirt, even when itself floating. Strike
 * cleanup only considers nearby seeds; generation uses the one-time full scan.
 */
export function detachSmallDirt(world: World, region?: DirtRegion): FallingDirt[] {
  const size = world.cellSize;
  if (region && ![region.center.x, region.center.y, region.radius].every(Number.isFinite)) return [];
  const minX = region ? Math.max(1, Math.floor((region.center.x - region.radius) / size)) : 1;
  const maxX = region ? Math.min(world.width - 2, Math.floor((region.center.x + region.radius) / size)) : world.width - 2;
  const minY = region ? Math.max(1, Math.floor((region.center.y - region.radius) / size)) : 1;
  const maxY = region ? Math.min(world.height - 2, Math.floor((region.center.y + region.radius) / size)) : world.height - 2;
  const examined = new Set<number>();
  const particles: FallingDirt[] = [];

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const seed = world.index(x, y);
      if (world.material[seed] !== 1 || examined.has(seed)) continue;
      const component = [seed];
      const included = new Set(component);
      let attached = false;
      for (let cursor = 0; cursor < component.length && !attached; cursor++) {
        const index = component[cursor];
        examined.add(index);
        for (const neighbor of [index - 1, index + 1, index - world.width, index + world.width]) {
          if (world.material[neighbor] >= 2) { attached = true; break; }
          if (world.material[neighbor] !== 1 || included.has(neighbor)) continue;
          included.add(neighbor);
          component.push(neighbor);
          if (component.length > MAX_DIRT_ISLAND) { attached = true; break; }
        }
      }
      if (attached) continue;
      for (const index of component) {
        const cellX = index % world.width, cellY = Math.floor(index / world.width);
        world.setSolid(cellX, cellY, false);
        particles.push({ x: cellX * size, y: cellY * size, vy: 0 });
      }
    }
  }
  return particles;
}

/** Cosmetic particles cannot block the player, displace water, or leave new terrain. */
export function stepFallingDirt(world: World, particles: FallingDirt[], dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const size = world.cellSize;
  let retained = 0;
  for (const particle of particles) {
    particle.vy = Math.min(DIRT_TERMINAL_SPEED, particle.vy + DIRT_GRAVITY * dt);
    const nextY = particle.y + particle.vy * dt;
    const minX = Math.floor(particle.x / size);
    const maxX = Math.floor((particle.x + size - 0.000001) / size);
    const firstY = Math.floor((particle.y + size - 0.000001) / size);
    const lastY = Math.min(world.height, Math.floor((nextY + size) / size));
    let landed = false;
    // Sweep every crossed row: a long frame cannot tunnel through a thin floor.
    for (let y = firstY; y <= lastY && !landed; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (world.isSolid(x, y)) { landed = true; break; }
      }
    }
    if (landed || nextY >= world.height * size) continue;
    particle.y = nextY;
    particles[retained++] = particle;
  }
  particles.length = retained;
}
