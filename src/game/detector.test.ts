import { describe, expect, it } from 'vitest';
import { World } from './world';
import { findNearestWater } from './detector';

describe('water detector', () => {
  it('points to the nearest water inside its radius even through solid rock', () => {
    const world = new World(30, 20, 4);
    world.water[world.index(12, 8)] = 0.5;
    world.water[world.index(20, 8)] = 1;
    for (let y = 1; y < 19; y++) world.setSolid(8, y, true);
    expect(findNearestWater(world, { x: 20, y: 34 }, 80)).toEqual({
      position: { x: 50, y: 34 }, distance: 30,
    });
  });

  it('has no indicator when all water is outside the detection radius', () => {
    const world = new World(30, 20, 4);
    world.water[world.index(12, 8)] = 1;
    expect(findNearestWater(world, { x: 20, y: 34 }, 29)).toBeNull();
    expect(findNearestWater(world, { x: 20, y: 34 }, 30)?.distance).toBe(30);
  });

  it('ignores dry cells and invalid solid-cell water, with stable ties', () => {
    const world = new World(30, 20, 4);
    world.setSolid(6, 8, true);
    world.water[world.index(6, 8)] = 1;
    expect(findNearestWater(world, { x: 20, y: 34 }, 50)).toBeNull();
    world.water[world.index(7, 8)] = 0.1;
    world.water[world.index(2, 8)] = 0.1;
    expect(findNearestWater(world, { x: 20, y: 34 }, 50)?.position).toEqual({ x: 10, y: 34 });
  });

  it('rejects non-finite positions and invalid radii', () => {
    const world = new World(12, 12);
    expect(findNearestWater(world, { x: Number.NaN, y: 0 }, 10)).toBeNull();
    expect(findNearestWater(world, { x: 0, y: 0 }, -1)).toBeNull();
  });
});
