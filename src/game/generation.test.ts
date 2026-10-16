import { describe, expect, it } from 'vitest';
import { generateSite, type WaterDistribution } from './generation';
import type { World } from './world';
import { createPlayer, stepPlayer } from './player';
import { totalWater } from './water';
import { collectWater } from './water';
import { damageStrike } from './digging';

const distributions: WaterDistribution[] = ['many-small', 'fewer-large'];

function waterBodies(world: World): { mass: number; row: number; cells: number[] }[] {
  const visited = new Set<number>();
  const bodies: { mass: number; row: number; cells: number[] }[] = [];
  for (let i = 0; i < world.water.length; i++) {
    if (visited.has(i) || world.water[i] === 0) continue;
    const cells = [i];
    visited.add(i);
    let mass = 0;
    let weightedRow = 0;
    for (let j = 0; j < cells.length; j++) {
      const cell = cells[j]!;
      mass += world.water[cell]!;
      weightedRow += Math.floor(cell / world.width) * world.water[cell]!;
      for (const neighbor of [cell - 1, cell + 1, cell - world.width, cell + world.width]) {
        if (visited.has(neighbor) || !world.water[neighbor]) continue;
        visited.add(neighbor);
        cells.push(neighbor);
      }
    }
    bodies.push({ mass, row: weightedRow / mass, cells });
  }
  return bodies;
}

function depthBands(world: World): ReturnType<typeof waterBodies>[] {
  const bodies = waterBodies(world);
  return [bodies.filter((body) => body.row < 120),
    bodies.filter((body) => body.row >= 120 && body.row < 185),
    bodies.filter((body) => body.row >= 185)];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2;
}

describe('finite seeded sites', () => {
  it.each(distributions)('reproduces terrain and water for %s, while different seeds change the site', (distribution) => {
    const a = generateSite(42, distribution);
    const b = generateSite(42, distribution);
    const c = generateSite(43, distribution);
    expect(a.world.solid).toEqual(b.world.solid);
    expect(a.world.material).toEqual(b.world.material);
    expect(a.world.water).toEqual(b.world.water);
    expect(a.spawn).toEqual(b.spawn);
    expect(a.world.material).not.toEqual(c.world.material);
    expect(a.world.water).not.toEqual(c.world.water);
  });

  it.each(distributions.flatMap((distribution) => [0, 1, 42, 999, 0xffffffff].map((seed) => [distribution, seed] as const)))
  ('provides a safe, sealed site with enough water for %s seed %i', (distribution, seed) => {
    const { world, spawn, hopper, surfaceY } = generateSite(seed, distribution);
    expect(world.width).toBe(384);
    expect(world.height).toBe(256);
    expect(totalWater(world)).toBeGreaterThanOrEqual(1500);
    expect(world.isSolidAtPixel(spawn.x, spawn.y)).toBe(false);
    expect(world.isSolidAtPixel(spawn.x + 15, spawn.y + 31)).toBe(false);
    expect(world.isSolidAtPixel(spawn.x + 8, spawn.y + 32)).toBe(true);
    expect(world.isSolidAtPixel(hopper.x, hopper.y)).toBe(false);
    expect(Math.hypot(spawn.x + 8 - hopper.x, spawn.y + 16 - hopper.y)).toBeLessThan(96);
    expect(surfaceY).toBe(spawn.y + 32);
    expect(world.material.includes(1)).toBe(true);
    expect(world.material.includes(2)).toBe(true);
    expect(world.damage.every((amount) => amount === 0)).toBe(true);
    for (let i = 0; i < world.water.length; i++) {
      if (world.water[i] > 0) expect(world.solid[i]).toBe(0);
    }
    const bodies = waterBodies(world);
    expect(bodies.length).toBeGreaterThanOrEqual(14);
    for (const body of bodies) {
      expect(body.mass).toBeGreaterThanOrEqual(15);
      expect(body.mass).toBeLessThanOrEqual(185);
      // Every reservoir starts surrounded by terrain, rather than leaking into
      // a neighboring reservoir, the starter shaft, or an air-filled cave.
      for (const cell of body.cells) {
        for (const neighbor of [cell - 1, cell + 1, cell - world.width, cell + world.width]) {
          if (!world.water[neighbor]) expect(world.solid[neighbor]).toBe(1);
        }
      }
    }
  });

  it.each([0, 1, 42, 999, 0xffffffff])('compares discovery frequency without changing depth budgets for seed %i', (seed) => {
    const small = generateSite(seed, 'many-small').world;
    const large = generateSite(seed, 'fewer-large').world;
    const smallBodies = waterBodies(small);
    const largeBodies = waterBodies(large);
    expect(smallBodies.length).toBeGreaterThanOrEqual(largeBodies.length * 1.5);
    expect(median(smallBodies.map((body) => body.mass))).toBeLessThan(median(largeBodies.map((body) => body.mass)) * 0.75);
    expect(totalWater(small)).toBeCloseTo(totalWater(large), 6);
    const smallBands = depthBands(small);
    const largeBands = depthBands(large);
    for (let band = 0; band < 3; band++) {
      const sum = (bodies: ReturnType<typeof waterBodies>) => bodies.reduce((mass, body) => mass + body.mass, 0);
      expect(sum(smallBands[band]!)).toBeCloseTo(sum(largeBands[band]!), 6);
    }
    expect(smallBands[0]!.reduce((mass, body) => mass + body.mass, 0)).toBeLessThan(400);
    // Changing the comparison must not reroll the underlying geology or caves.
    for (let cell = 0; cell < small.water.length; cell++) {
      if (!small.water[cell] && !large.water[cell]) expect(small.material[cell]).toBe(large.material[cell]);
    }
  });

  it.each(distributions)('increases typical pocket volume with depth while keeping a size mix in %s', (distribution) => {
    for (const seed of [0, 42, 999]) {
      const bands = depthBands(generateSite(seed, distribution).world);
      const means = bands.map((bodies) => bodies.reduce((mass, body) => mass + body.mass, 0) / bodies.length);
      expect(means[1]).toBeGreaterThan(means[0]! * 1.5);
      expect(means[2]).toBeGreaterThan(means[1]! * 1.2);
      for (const bodies of bands) {
        const masses = bodies.map((body) => Math.round(body.mass));
        expect(new Set(masses).size).toBeGreaterThanOrEqual(3);
        expect(Math.max(...masses) / Math.min(...masses)).toBeGreaterThan(1.4);
      }
    }
  });

  it.each(distributions)('keeps the shared starter pocket small enough to move on after a few loads in %s', (distribution) => {
    const world = generateSite(42, distribution).world;
    const starter = waterBodies(world).find((body) => body.cells.includes(world.index(112, 102)))!;
    expect(starter.mass).toBeGreaterThanOrEqual(40);
    expect(starter.mass).toBeLessThanOrEqual(60);
  });

  it('allows returning up the starter shaft without any digging or upgrades', () => {
    const { world, surfaceY } = generateSite(42);
    const player = createPlayer(88 * 4, 106 * 4 - 32);
    const input = { left: true, right: false, up: true, down: false, jumpPressed: true };
    stepPlayer(world, player, input, 1 / 60);
    input.jumpPressed = false;
    for (let frame = 0; frame < 600; frame++) stepPlayer(world, player, input, 1 / 60);
    expect(player.y + player.height).toBeLessThanOrEqual(surfaceY + 1);
  });

  it.each(distributions)('lets a standing worker reach starter water with the initial tool in %s', (distribution) => {
    const { world } = generateSite(42, distribution);
    const origin = { x: 104 * 4, y: 102 * 4 };
    const aim = { x: 116 * 4, y: 102 * 4 };
    const before = totalWater(world);
    expect(collectWater(world, origin, 28, 20)).toBe(0);
    for (let hit = 0; hit < 3; hit++) damageStrike(world, origin, aim, 12, 1);
    const collected = collectWater(world, origin, 28, 20);
    expect(collected).toBeGreaterThan(0);
    expect(totalWater(world) + collected).toBeCloseTo(before);
  });
});
