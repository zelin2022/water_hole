import { describe, expect, it } from 'vitest';
import { generateSite } from './generation';
import { createPlayer, stepPlayer } from './player';
import { totalWater } from './water';
import { collectWater } from './water';
import { damageStrike } from './digging';

describe('finite seeded sites', () => {
  it('reproduces terrain and water for a seed, while different seeds change the site', () => {
    const a = generateSite(42);
    const b = generateSite(42);
    const c = generateSite(43);
    expect(a.world.solid).toEqual(b.world.solid);
    expect(a.world.material).toEqual(b.world.material);
    expect(a.world.water).toEqual(b.world.water);
    expect(a.spawn).toEqual(b.spawn);
    expect(a.world.material).not.toEqual(c.world.material);
    expect(a.world.water).not.toEqual(c.world.water);
  });

  it.each([0, 1, 42, 999, 0xffffffff])('provides a safe site and enough small water pockets for seed %i', (seed) => {
    const { world, spawn, hopper, surfaceY } = generateSite(seed);
    expect(world.width).toBe(384);
    expect(world.height).toBe(256);
    expect(totalWater(world)).toBeGreaterThanOrEqual(700);
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
    const visited = new Set<number>();
    const masses: number[] = [];
    for (let i = 0; i < world.water.length; i++) {
      if (visited.has(i) || world.water[i] === 0) continue;
      const queue = [i];
      visited.add(i);
      let mass = 0;
      for (let j = 0; j < queue.length; j++) {
        const cell = queue[j]!;
        mass += world.water[cell]!;
        for (const neighbor of [cell - 1, cell + 1, cell - world.width, cell + world.width]) {
          if (visited.has(neighbor) || !world.water[neighbor]) continue;
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
      masses.push(mass);
    }
    expect(masses.length).toBeGreaterThanOrEqual(7);
    for (const mass of masses) {
      expect(mass).toBeGreaterThanOrEqual(60);
      expect(mass).toBeLessThanOrEqual(180);
    }
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

  it('lets a standing worker reach starter water with the initial tool', () => {
    const { world } = generateSite(42);
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
