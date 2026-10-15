import { describe, expect, it } from 'vitest';
import { World } from './world';
import { collectWater, stepWater, totalWater } from './water';

function solidInterior(world: World): void {
  for (let y = 1; y < world.height - 1; y += 1) {
    for (let x = 1; x < world.width - 1; x += 1) world.setSolid(x, y, true);
  }
}

function open(world: World, ...cells: Array<[number, number]>): void {
  for (const [x, y] of cells) world.setSolid(x, y, false);
}

describe('water simulation', () => {
  it('keeps a reservoir sealed until digging opens a downward drain', () => {
    const world = new World(8, 8);
    solidInterior(world);
    open(world, [3, 2], [3, 4]);
    world.water[world.index(3, 2)] = 1;

    stepWater(world, 1 / 30);
    expect(world.water[world.index(3, 2)]).toBe(1);
    expect(world.water[world.index(3, 4)]).toBe(0);

    world.setSolid(3, 3, false);
    for (let frame = 0; frame < 60; frame += 1) stepWater(world, 1 / 30);

    expect(world.water[world.index(3, 4)]).toBeGreaterThan(0.99);
    expect(totalWater(world)).toBeCloseTo(1, 5);
  });

  it('spreads sideways along a blocked floor', () => {
    const world = new World(7, 6);
    solidInterior(world);
    open(world, [2, 3], [3, 3], [4, 3]);
    world.water[world.index(3, 3)] = 1;

    for (let frame = 0; frame < 90; frame += 1) stepWater(world, 1 / 30);

    expect(world.water[world.index(2, 3)]).toBeGreaterThan(0.25);
    expect(world.water[world.index(4, 3)]).toBeGreaterThan(0.25);
    expect(totalWater(world)).toBeCloseTo(1, 5);
  });

  it('conserves water without negative, overflowing, solid, or out-of-bounds cells', () => {
    const world = new World(24, 24);
    for (let y = 1; y < 12; y += 1) {
      for (let x = 1; x < world.width - 1; x += 1) {
        if ((x + y) % 5 === 0) world.setSolid(x, y, true);
        else world.water[world.index(x, y)] = ((x * 17 + y * 31) % 100) / 100;
      }
    }
    const initial = totalWater(world);

    for (let frame = 0; frame < 600; frame += 1) stepWater(world, 1 / 30);

    expect(totalWater(world)).toBeCloseTo(initial, 3);
    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        const amount = world.water[world.index(x, y)];
        expect(amount).toBeGreaterThanOrEqual(0);
        expect(amount).toBeLessThanOrEqual(1);
        if (world.isSolid(x, y)) expect(amount).toBe(0);
      }
    }
  });

  it('does not advance for zero or invalid time', () => {
    const world = new World(7, 7);
    world.water[world.index(3, 2)] = 1;
    for (const dt of [0, -1, Number.NaN]) stepWater(world, dt);
    expect(world.water[world.index(3, 2)]).toBe(1);
  });
});

describe('water collection', () => {
  it('removes at most the requested amount within the circular pixel radius', () => {
    const world = new World(12, 12, 4);
    world.water[world.index(4, 4)] = 0.75;
    world.water[world.index(5, 4)] = 0.75;
    world.water[world.index(8, 4)] = 1;
    const initial = totalWater(world);

    const collected = collectWater(world, { x: 18, y: 18 }, 7, 1);

    expect(collected).toBeCloseTo(1, 5);
    expect(totalWater(world) + collected).toBeCloseTo(initial, 5);
    expect(world.water[world.index(8, 4)]).toBe(1);
  });

  it('does not suck water through a solid wall', () => {
    const world = new World(12, 12, 4);
    for (let y = 1; y < world.height - 1; y += 1) world.setSolid(5, y, true);
    world.water[world.index(6, 4)] = 1;

    expect(collectWater(world, { x: 18, y: 18 }, 20, 2)).toBe(0);
    expect(totalWater(world)).toBe(1);
  });

  it('ignores invalid collection amounts and positions outside the world', () => {
    const world = new World(8, 8);
    world.water[world.index(3, 3)] = 1;
    for (const max of [0, -1, Number.NaN]) {
      expect(collectWater(world, { x: 14, y: 14 }, 10, max)).toBe(0);
    }
    expect(collectWater(world, { x: -100, y: -100 }, 10, 1)).toBe(0);
    expect(totalWater(world)).toBe(1);
  });
});
