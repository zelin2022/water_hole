import { describe, expect, it } from 'vitest';
import { detachSmallDirt, DIRT_GRAVITY, stepFallingDirt } from './dirt';
import { totalWater } from './water';
import { World } from './world';

describe('small detached dirt islands', () => {
  it('removes a mixed sand-and-earth island rather than treating sand as an anchor', () => {
    const world = new World(20, 20);
    world.setMaterial(5, 5, 1);
    world.setMaterial(6, 5, 4);
    world.setMaterial(6, 6, 4);
    expect(detachSmallDirt(world)).toHaveLength(3);
    expect(world.isSolid(5, 5)).toBe(false);
    expect(world.isSolid(6, 5)).toBe(false);
    expect(world.isSolid(6, 6)).toBe(false);
  });

  it.each([5, 6] as const)('keeps material %i and the loose sand attached to it', (material) => {
    const world = new World(20, 20);
    world.setMaterial(5, 5, material);
    world.setMaterial(6, 5, 4);
    expect(detachSmallDirt(world)).toEqual([]);
    expect(world.isSolid(6, 5)).toBe(true);
  });

  it('preserves reinforced foundation and the dirt attached to it', () => {
    const world = new World(20, 20, 4);
    world.setMaterial(5, 5, 3);
    world.setMaterial(6, 5, 1);
    expect(detachSmallDirt(world)).toEqual([]);
    expect(world.material[world.index(5, 5)]).toBe(3);
    expect(world.isSolid(6, 5)).toBe(true);
  });

  it('clears a one-cell island immediately without touching water', () => {
    const world = new World(20, 20, 4);
    world.setMaterial(5, 5, 1);
    world.damage[world.index(5, 5)] = 0.5;
    world.water[world.index(5, 6)] = 0.75;
    const beforeVersion = world.terrainVersion;
    const particles = detachSmallDirt(world);
    expect(particles).toEqual([{ x: 20, y: 20, vy: 0 }]);
    expect(world.isSolid(5, 5)).toBe(false);
    expect(world.material[world.index(5, 5)]).toBe(0);
    expect(world.damage[world.index(5, 5)]).toBe(0);
    expect(world.terrainVersion).toBe(beforeVersion + 1);
    expect(totalWater(world)).toBe(0.75);
  });

  it('removes a complete connected three-cell island', () => {
    const world = new World(20, 20, 4);
    for (const [x, y] of [[5, 5], [6, 5], [6, 6]]) world.setMaterial(x, y, 1);
    const particles = detachSmallDirt(world);
    expect(particles).toHaveLength(3);
    expect(new Set(particles.map(particle => `${particle.x},${particle.y}`)))
      .toEqual(new Set(['20,20', '24,20', '24,24']));
    for (const [x, y] of [[5, 5], [6, 5], [6, 6]]) expect(world.isSolid(x, y)).toBe(false);
  });

  it('preserves islands larger than three cells rather than removing a subset', () => {
    const world = new World(20, 20, 4);
    for (let x = 5; x < 9; x++) world.setMaterial(x, 5, 1);
    expect(detachSmallDirt(world)).toEqual([]);
    for (let x = 5; x < 9; x++) expect(world.isSolid(x, 5)).toBe(true);
  });

  it('preserves stone and any dirt attached to stone or the sealed boundary', () => {
    const world = new World(20, 20, 4);
    world.setMaterial(5, 5, 2);
    world.setMaterial(6, 5, 1);
    world.setMaterial(1, 10, 1);
    expect(detachSmallDirt(world)).toEqual([]);
    expect(world.material[world.index(5, 5)]).toBe(2);
    expect(world.isSolid(6, 5)).toBe(true);
    expect(world.isSolid(1, 10)).toBe(true);
  });

  it('treats only four-neighbor contact as attachment', () => {
    const world = new World(20, 20, 4);
    world.setMaterial(5, 5, 2);
    world.setMaterial(6, 6, 1);
    world.setMaterial(7, 7, 1);
    expect(detachSmallDirt(world)).toHaveLength(2);
    expect(world.isSolid(5, 5)).toBe(true);
  });

  it('limits strike cleanup to nearby candidates while checking whole components', () => {
    const world = new World(30, 20, 4);
    for (const [x, y] of [[5, 5], [6, 5], [7, 5], [20, 5]]) world.setMaterial(x, y, 1);
    expect(detachSmallDirt(world, { center: { x: 20, y: 20 }, radius: 1 })).toHaveLength(3);
    expect(world.isSolid(20, 5)).toBe(true);
  });
});

describe('falling dirt animation physics', () => {
  it('falls under gravity without becoming terrain or disturbing water', () => {
    const world = new World(20, 30, 4);
    world.setMaterial(5, 5, 1);
    world.water[world.index(5, 10)] = 0.75;
    const particles = detachSmallDirt(world);
    stepFallingDirt(world, particles, 0.1);
    expect(particles).toHaveLength(1);
    expect(particles[0].x).toBe(20);
    expect(particles[0].vy).toBeCloseTo(DIRT_GRAVITY * 0.1);
    expect(particles[0].y).toBeGreaterThan(20);
    expect(world.isSolid(5, 5)).toBe(false);
    expect(totalWater(world)).toBe(0.75);
  });

  it('disappears on the first solid ground even with a large time step', () => {
    const world = new World(20, 30, 4);
    world.setMaterial(5, 15, 2);
    const particles = [{ x: 20, y: 20, vy: 640 }];
    stepFallingDirt(world, particles, 1);
    expect(particles).toEqual([]);
    expect(world.material[world.index(5, 15)]).toBe(2);
  });

  it('despawns at the sealed map bottom and ignores invalid time steps', () => {
    const world = new World(20, 20, 4);
    const particles = [{ x: 20, y: 20, vy: 0 }];
    stepFallingDirt(world, particles, Number.NaN);
    stepFallingDirt(world, particles, -1);
    expect(particles).toEqual([{ x: 20, y: 20, vy: 0 }]);
    stepFallingDirt(world, particles, 1);
    expect(particles).toEqual([]);
  });
});
