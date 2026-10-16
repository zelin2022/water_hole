import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_WATER_DISTRIBUTION, generateSite, type WaterDistribution } from './generation';
import * as waterPockets from './water-pockets';
import type { World } from './world';
import { createPlayer, stepPlayer } from './player';
import { stepWater, totalWater } from './water';
import { collectWater } from './water';
import { damageStrike } from './digging';

const legacyDistributions: WaterDistribution[] = ['many-small', 'fewer-large'];
const distributions: WaterDistribution[] = ['depth-weighted', ...legacyDistributions];

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

/** Sealed cavities include dry draws, and exclude the sky-connected starter shaft. */
function cavities(world: World): { mass: number; row: number; cells: number[]; water: number }[] {
  const visited = new Set<number>();
  const bodies: { mass: number; row: number; cells: number[]; water: number }[] = [];
  for (let i = 0; i < world.solid.length; i++) {
    if (visited.has(i) || world.solid[i]) continue;
    const cells = [i];
    visited.add(i);
    let skyConnected = false;
    for (let j = 0; j < cells.length; j++) {
      const cell = cells[j]!;
      const x = cell % world.width;
      const y = Math.floor(cell / world.width);
      if (y === 1) skyConnected = true;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (!world.inBounds(nx!, ny!)) continue;
        const neighbor = world.index(nx!, ny!);
        if (visited.has(neighbor) || world.solid[neighbor]) continue;
        visited.add(neighbor);
        cells.push(neighbor);
      }
    }
    if (!skyConnected) bodies.push({
      cells, mass: cells.length,
      row: cells.reduce((sum, cell) => sum + Math.floor(cell / world.width), 0) / cells.length,
      water: cells.reduce((sum, cell) => sum + world.water[cell]!, 0),
    });
  }
  return bodies;
}

function depthBands(world: World): ReturnType<typeof cavities>[] {
  const bodies = cavities(world);
  return [bodies.filter((body) => body.row < 120),
    bodies.filter((body) => body.row >= 120 && body.row < 185),
    bodies.filter((body) => body.row >= 185)];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2;
}

describe('finite seeded sites', () => {
  it.each(distributions)('separates the starter shaft from the platform with a flat walkable approach in %s', (distribution) => {
    const { world, spawn, surfaceY } = generateSite(42, distribution);
    // A 480-world-pixel approach reads as roughly two thirds of the default
    // 1,280-pixel view at 1.8 zoom, without making generation viewport-dependent.
    expect((144 - 24) * world.cellSize).toBe(480);
    for (let x = 24; x < 144; x++) {
      expect(world.isSolid(x, 43)).toBe(false);
      expect(world.isSolid(x, 44)).toBe(true);
      expect(world.material[world.index(x, 44)]).toBe(1);
    }
    for (let y = 44; y < 106; y++) {
      expect(world.isSolid(143, y)).toBe(true);
      expect(world.isSolid(144, y)).toBe(false);
      expect(world.isSolid(161, y)).toBe(false);
      expect(world.isSolid(162, y)).toBe(true);
    }
    expect(world.isSolid(144, 106)).toBe(true);
    expect(world.isSolid(161, 106)).toBe(true);
    // The worker can walk from the platform to the shaft without jumping,
    // climbing, digging, or tripping over a surface step.
    const player = createPlayer(spawn.x, spawn.y);
    const input = { left: false, right: true, up: false, down: false, jumpPressed: false };
    for (let frame = 0; frame < 240 && player.x + player.width <= 144 * world.cellSize; frame++) {
      stepPlayer(world, player, input, 1 / 60);
      expect(player.y + player.height).toBeCloseTo(surfaceY, 3);
    }
    expect(player.x + player.width).toBeGreaterThan(144 * world.cellSize);
  });

  it.each(distributions)('replaces separate hollow caves with occasional dry pockets in %s', (distribution) => {
    const world = generateSite(42, distribution).world;
    const pockets = cavities(world);
    expect(pockets).toHaveLength(distribution === 'fewer-large' ? 16 : 28);
    expect(pockets.some((pocket) => pocket.water === 0)).toBe(true);
    expect(pockets.some((pocket) => pocket.water === pocket.mass)).toBe(true);
    expect(pockets.every((pocket) => pocket.water === 0 || pocket.water === pocket.mass)).toBe(true);
  });

  it('rolls dryness independently of pocket size without excluding the starter', () => {
    const sample = vi.spyOn(waterPockets, 'sampleWaterPocketVolume');
    try {
      sample.mockReturnValue(45);
      const small = cavities(generateSite(42).world);
      sample.mockReturnValue(60);
      const larger = cavities(generateSite(42).world);
      const centerX = (pocket: ReturnType<typeof cavities>[number]) =>
        pocket.cells.reduce((sum, cell) => sum + cell % 384, 0) / pocket.mass;
      for (const pocket of small) {
        const closest = [...larger].sort((a, b) =>
          Math.hypot(centerX(a) - centerX(pocket), a.row - pocket.row)
          - Math.hypot(centerX(b) - centerX(pocket), b.row - pocket.row))[0]!;
        expect(closest.water === 0).toBe(pocket.water === 0);
      }
      expect(small.every((pocket) => pocket.mass === 45)).toBe(true);
      expect(larger.every((pocket) => pocket.mass === 60)).toBe(true);
    } finally {
      sample.mockRestore();
    }
    const starters = Array.from({ length: 40 }, (_, index) => {
      const world = generateSite(Math.imul(index + 1, 0x9e3779b1) >>> 0).world;
      return cavities(world).find((pocket) => pocket.cells.includes(world.index(168, 102)))!.water;
    });
    expect(starters.some((water) => water === 0)).toBe(true);
    expect(starters.some((water) => water > 0)).toBe(true);
  });

  it('produces approximately one dry pocket in five without a fixed per-map quota', () => {
    let dry = 0;
    let total = 0;
    const counts = new Set<number>();
    for (let index = 0; index < 100; index++) {
      const world = generateSite(Math.imul(index + 1, 0x9e3779b1) >>> 0).world;
      const pockets = cavities(world);
      const dryCount = pockets.filter((pocket) => pocket.water === 0).length;
      dry += dryCount;
      total += pockets.length;
      counts.add(dryCount);
    }
    expect(dry / total).toBeGreaterThan(0.17);
    expect(dry / total).toBeLessThan(0.23);
    expect(counts.size).toBeGreaterThan(5);
  });

  it.each(distributions)('places the machine on a continuous left-edge foundation in %s', (distribution) => {
    const { world, hopper, spawn, surfaceY } = generateSite(42, distribution);
    expect(hopper).toEqual({ x: 48, y: 120 });
    expect(spawn).toEqual({ x: 80, y: 144 });
    expect(surfaceY).toBe(176);
    for (let y = 44; y < world.height - 1; y++) {
      for (let x = 1; x <= 23; x++) {
        expect(world.material[world.index(x, y)]).toBe(3);
        expect(world.isSolid(x, y)).toBe(true);
        expect(world.water[world.index(x, y)]).toBe(0);
      }
      // The playable side of the foundation is flush at every depth.
      expect(world.isSolid(23, y)).toBe(true);
    }
    expect(world.isSolid(24, 44)).toBe(true);
    expect(world.isSolid(24, 105)).toBe(true);
    expect(world.isSolid(23, world.height - 1)).toBe(true);
  });

  it('keeps maximum-volume pockets sealed without rejecting a large-class draw', () => {
    const sample = vi.spyOn(waterPockets, 'sampleWaterPocketVolume')
      .mockImplementation((_depth, classSample) => classSample === 0 ? 45 : 240);
    try {
      for (let seed = 0; seed < 100; seed++) {
        const world = generateSite(Math.imul(seed + 1, 0x9e3779b1) >>> 0).world;
        const bodies = cavities(world);
        expect(bodies).toHaveLength(28);
        expect(bodies.filter((body) => body.mass === 240)).toHaveLength(27);
        for (const body of bodies) {
          for (const cell of body.cells) {
            for (const neighbor of [cell - 1, cell + 1, cell - world.width, cell + world.width]) {
              if (!body.cells.includes(neighbor)) expect(world.solid[neighbor]).toBe(1);
            }
          }
        }
      }
    } finally {
      sample.mockRestore();
    }
  });
  it('defaults to three variable-volume pocket classes with enough water for the demo', () => {
    expect(DEFAULT_WATER_DISTRIBUTION).toBe('depth-weighted');
    const world = generateSite(42).world;
    const bodies = cavities(world);
    expect(bodies).toHaveLength(28);
    expect(bodies.every((body) => Number.isInteger(body.mass) && body.mass >= 30 && body.mass <= 240)).toBe(true);
    expect(bodies.some((body) => ![45, 90, 180].includes(body.mass))).toBe(true);
    expect(new Set(bodies.map((body) => body.mass)).size).toBeGreaterThan(8);
    expect(totalWater(world)).toBeGreaterThanOrEqual(400);
  });

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
    expect(totalWater(world)).toBeGreaterThanOrEqual(400);
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
    const bodies = cavities(world);
    expect(bodies).toHaveLength(distribution === 'fewer-large' ? 16 : 28);
    for (const body of bodies) {
      expect(body.mass).toBeGreaterThanOrEqual(distribution === 'depth-weighted' ? 30 : 15);
      expect(body.mass).toBeLessThanOrEqual(distribution === 'depth-weighted' ? 240 : 185);
      // Every reservoir starts surrounded by terrain, rather than leaking into
      // a neighboring reservoir, the starter shaft, or an air-filled cave.
      for (const cell of body.cells) {
        for (const neighbor of [cell - 1, cell + 1, cell - world.width, cell + world.width]) {
          if (!body.cells.includes(neighbor)) expect(world.solid[neighbor]).toBe(1);
        }
      }
    }
  });

  it.each([0, 1, 42, 999, 0xffffffff])('compares discovery frequency without changing depth budgets for seed %i', (seed) => {
    const small = generateSite(seed, 'many-small').world;
    const large = generateSite(seed, 'fewer-large').world;
    const smallBodies = cavities(small);
    const largeBodies = cavities(large);
    expect(smallBodies.length).toBeGreaterThanOrEqual(largeBodies.length * 1.5);
    expect(median(smallBodies.map((body) => body.mass))).toBeLessThan(median(largeBodies.map((body) => body.mass)) * 0.75);
    expect(smallBodies.reduce((sum, body) => sum + body.mass, 0))
      .toBe(largeBodies.reduce((sum, body) => sum + body.mass, 0));
    const smallBands = depthBands(small);
    const largeBands = depthBands(large);
    for (let band = 0; band < 3; band++) {
      const sum = (bodies: ReturnType<typeof cavities>) => bodies.reduce((mass, body) => mass + body.mass, 0);
      expect(sum(smallBands[band]!)).toBeCloseTo(sum(largeBands[band]!), 6);
    }
    expect(smallBands[0]!.reduce((mass, body) => mass + body.mass, 0)).toBeLessThan(400);
    // Changing the comparison must not reroll the underlying geology or caves.
    for (let cell = 0; cell < small.water.length; cell++) {
      if (small.solid[cell] && large.solid[cell]) expect(small.material[cell]).toBe(large.material[cell]);
    }
  });

  it.each(legacyDistributions)('increases typical pocket volume with depth while keeping a size mix in legacy %s', (distribution) => {
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

  it('allows all variable-volume classes in the shallow band without conditioning a site budget', () => {
    const shallowSizes = new Set<string>();
    const volumes = new Set<number>();
    const totals = new Set<number>();
    for (let seed = 0; seed < 32; seed++) {
      const { world } = generateSite(seed);
      const bodies = cavities(world);
      expect(bodies).toHaveLength(28);
      for (const body of bodies) {
        expect(body.mass).toBeGreaterThanOrEqual(30);
        expect(body.mass).toBeLessThanOrEqual(240);
        volumes.add(body.mass);
        // Touching endpoints belong to either neighboring class; interior
        // values prove every class can occur in the shallow band.
        if (body.row < 120 && body.mass !== 60 && body.mass !== 120) {
          shallowSizes.add(body.mass < 60 ? 'small' : body.mass < 120 ? 'medium' : 'large');
        }
      }
      totals.add(totalWater(world));
    }
    expect([...shallowSizes].sort()).toEqual(['large', 'medium', 'small']);
    expect(volumes.size).toBeGreaterThan(100);
    // Independent size draws are not subsequently reweighted to a fixed budget.
    expect(totals.size).toBeGreaterThan(1);
  });

  it.each(distributions)('keeps every sealed pocket accounted for after water simulation starts in %s', (distribution) => {
    const { world } = generateSite(42, distribution);
    const before = totalWater(world);
    stepWater(world, 1 / 60);
    expect(totalWater(world)).toBeCloseTo(before, 10);
    expect(waterBodies(world).length).toBe(cavities(world).filter((pocket) => pocket.water > 0).length);
  });

  it.each(distributions)('keeps the starter pocket small enough to move on after a few loads in %s', (distribution) => {
    const world = generateSite(42, distribution).world;
    const starter = cavities(world).find((body) => body.cells.includes(world.index(168, 102)))!;
    expect(starter.mass).toBeGreaterThanOrEqual(distribution === 'depth-weighted' ? 30 : 40);
    expect(starter.mass).toBeLessThanOrEqual(60);
  });

  it('varies the small starter volume while preserving initial tool reach at both limits', () => {
    const sample = vi.spyOn(waterPockets, 'sampleWaterPocketVolume');
    try {
      for (let mass = 30; mass <= 60; mass++) {
        sample.mockImplementation((_depth, classSample) => classSample === 0 ? mass : 30);
        const { world } = generateSite(42);
        const starter = waterBodies(world).find((body) => body.cells.includes(world.index(168, 102)))!;
        expect(starter.mass).toBe(mass);
        expect(Math.min(...starter.cells.map((cell) => cell % world.width))).toBe(163);
        expect(Math.max(...starter.cells.map((cell) => Math.floor(cell / world.width)))).toBe(105);
        const origin = { x: 160 * 4, y: 102 * 4 };
        const aim = { x: 172 * 4, y: 102 * 4 };
        const before = totalWater(world);
        expect(collectWater(world, origin, 28, 20)).toBe(0);
        for (let hit = 0; hit < 3; hit++) damageStrike(world, origin, aim, 12, 1);
        const collected = collectWater(world, origin, 28, 20);
        expect(collected).toBeGreaterThan(0);
        expect(totalWater(world) + collected).toBeCloseTo(before);
      }
    } finally {
      sample.mockRestore();
    }
  });

  it('allows returning up the starter shaft without any digging or upgrades', () => {
    const { world, surfaceY } = generateSite(42);
    const player = createPlayer(144 * 4, 106 * 4 - 32);
    const input = { left: true, right: false, up: true, down: false, jumpPressed: true };
    stepPlayer(world, player, input, 1 / 60);
    input.jumpPressed = false;
    for (let frame = 0; frame < 600; frame++) stepPlayer(world, player, input, 1 / 60);
    expect(player.y + player.height).toBeLessThanOrEqual(surfaceY + 1);
  });

  it('lets the starting worker climb from the map bottom onto the hopper platform after excavation', () => {
    const { world, hopper, surfaceY } = generateSite(42);
    // Remove all diggable underground terrain, including beneath the machine.
    // The surviving support must have a continuous face and a mountable top.
    for (let y = 44; y < world.height - 1; y++) {
      for (let x = 1; x < world.width - 1; x++) world.setMaterial(x, y, 0);
    }
    const player = createPlayer(96, (world.height - 1) * world.cellSize - 32);
    const input = { left: true, right: false, up: true, down: false, jumpPressed: true };
    stepPlayer(world, player, input, 1 / 60);
    input.jumpPressed = false;
    for (let frame = 0; frame < 900; frame++) stepPlayer(world, player, input, 1 / 60);
    expect(player.y + player.height).toBeCloseTo(surfaceY, 3);
    expect(player.grounded).toBe(true);
    expect(player.x + player.width).toBeLessThanOrEqual(96);
    expect(Math.hypot(player.x + player.width / 2 - hopper.x,
      player.y + player.height / 2 - hopper.y)).toBeLessThan(96);
  });

  it.each(distributions)('lets a standing worker reach starter water with the initial tool in %s', (distribution) => {
    const { world } = generateSite(42, distribution);
    const origin = { x: 160 * 4, y: 102 * 4 };
    const aim = { x: 172 * 4, y: 102 * 4 };
    const before = totalWater(world);
    expect(collectWater(world, origin, 28, 20)).toBe(0);
    for (let hit = 0; hit < 3; hit++) damageStrike(world, origin, aim, 12, 1);
    const collected = collectWater(world, origin, 28, 20);
    expect(collected).toBeGreaterThan(0);
    expect(totalWater(world) + collected).toBeCloseTo(before);
  });
});
