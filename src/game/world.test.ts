import { describe, expect, it } from 'vitest';
import { World, dig } from './world';

describe('World terrain', () => {
  it.each([4, 5, 6] as const)('supports material %i without losing collision, water protection, or partial damage', (material) => {
    const world = new World(8, 6);
    const cell = world.index(2, 3);
    world.setMaterial(2, 3, material);
    world.damage[cell] = 0.5;
    world.setSolid(2, 3, true);
    expect(world.material[cell]).toBe(material);
    expect(world.damage[cell]).toBe(0.5);
    expect(world.isSolid(2, 3)).toBe(true);
    world.setSolid(2, 3, false);
    world.water[cell] = 0.75;
    expect(() => world.setMaterial(2, 3, material)).toThrow(/water/i);
    expect(world.water[cell]).toBe(0.75);
  });

  it('starts as empty space enclosed by an indestructible boundary', () => {
    const world = new World(8, 6);

    expect(world.cellSize).toBe(4);
    expect(world.terrainVersion).toBe(0);
    expect(world.solid).toBeInstanceOf(Uint8Array);
    expect(world.water).toBeInstanceOf(Float32Array);
    expect(world.water.every((amount) => amount === 0)).toBe(true);
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const boundary = x === 0 || y === 0 || x === 7 || y === 5;
        expect(world.isSolid(x, y)).toBe(boundary);
      }
    }

    world.setSolid(0, 3, false);
    world.setSolid(7, 3, false);
    world.setSolid(3, 0, false);
    world.setSolid(3, 5, false);
    expect(world.isSolid(0, 3)).toBe(true);
    expect(world.isSolid(7, 3)).toBe(true);
    expect(world.isSolid(3, 0)).toBe(true);
    expect(world.isSolid(3, 5)).toBe(true);
    expect(world.terrainVersion).toBe(0);
  });

  it('treats space outside the map as solid, including pixel coordinates', () => {
    const world = new World(8, 6);

    expect(world.inBounds(0, 0)).toBe(true);
    expect(world.inBounds(7, 5)).toBe(true);
    expect(world.inBounds(-1, 2)).toBe(false);
    expect(world.inBounds(8, 2)).toBe(false);
    expect(world.inBounds(2, 6)).toBe(false);
    expect(world.inBounds(1.5, 2)).toBe(false);
    expect(world.isSolid(-1, 2)).toBe(true);
    expect(world.isSolid(8, 2)).toBe(true);
    expect(world.isSolidAtPixel(-0.1, 10)).toBe(true);
    expect(world.isSolidAtPixel(32, 10)).toBe(true);
    expect(world.isSolidAtPixel(10, 24)).toBe(true);
    expect(world.isSolidAtPixel(5, 5)).toBe(false);
  });

  it('updates pixel collision immediately and only versions actual terrain changes', () => {
    const world = new World(8, 6);

    world.setSolid(2, 3, true);
    expect(world.isSolidAtPixel(9, 13)).toBe(true);
    expect(world.terrainVersion).toBe(1);
    world.setSolid(2, 3, true);
    expect(world.terrainVersion).toBe(1);
    world.setSolid(2, 3, false);
    expect(world.isSolidAtPixel(9, 13)).toBe(false);
    expect(world.terrainVersion).toBe(2);
    world.setSolid(2, 3, false);
    expect(world.terrainVersion).toBe(2);
  });

  it('refuses to bury water instead of silently destroying it', () => {
    const world = new World(8, 6);
    const cell = world.index(2, 3);
    world.water[cell] = 0.75;

    expect(() => world.setSolid(2, 3, true)).toThrow(/water/i);
    expect(world.water[cell]).toBe(0.75);
    expect(world.isSolid(2, 3)).toBe(false);
    expect(world.terrainVersion).toBe(0);
  });

  it('tracks material and partial damage together with collision', () => {
    const world = new World(8, 6);

    world.setMaterial(2, 3, 2);
    const cell = world.index(2, 3);
    expect(world.material[cell]).toBe(2);
    expect(world.isSolid(2, 3)).toBe(true);
    world.damage[cell] = 1;
    world.setSolid(2, 3, true);
    expect(world.material[cell]).toBe(2);
    expect(world.damage[cell]).toBe(1);
    world.setMaterial(2, 3, 1);
    expect(world.damage[cell]).toBe(0);
    world.setSolid(2, 3, false);
    expect(world.material[cell]).toBe(0);
    expect(world.damage[cell]).toBe(0);
    world.setSolid(2, 3, true);
    expect(world.material[cell]).toBe(1);
  });

  it('keeps material setters from burying water or opening the boundary', () => {
    const world = new World(8, 6);
    world.water[world.index(2, 3)] = 0.75;

    expect(() => world.setMaterial(2, 3, 2)).toThrow(/water/i);
    expect(world.material[world.index(2, 3)]).toBe(0);
    world.setMaterial(0, 3, 0);
    expect(world.material[world.index(0, 3)]).not.toBe(0);
    expect(world.isSolid(0, 3)).toBe(true);
  });

  it('keeps reinforced foundation solid and immutable through every terrain setter', () => {
    const world = new World(8, 6);
    world.setMaterial(2, 3, 3);
    const cell = world.index(2, 3);
    const version = world.terrainVersion;
    for (const material of [0, 1, 2, 3] as const) world.setMaterial(2, 3, material);
    world.setSolid(2, 3, false);
    expect(world.material[cell]).toBe(3);
    expect(world.isSolidAtPixel(9, 13)).toBe(true);
    expect(world.damage[cell]).toBe(0);
    expect(world.terrainVersion).toBe(version);
  });

  it('refuses to bury water when constructing a reinforced foundation', () => {
    const world = new World(8, 6);
    world.water[world.index(2, 3)] = 0.75;
    expect(() => world.setMaterial(2, 3, 3)).toThrow(/water/i);
    expect(world.isSolid(2, 3)).toBe(false);
    expect(world.water[world.index(2, 3)]).toBe(0.75);
  });
});

function filledWorld(): World {
  const world = new World(12, 12);
  for (let y = 1; y < 11; y++) {
    for (let x = 1; x < 11; x++) {
      world.setSolid(x, y, true);
    }
  }
  return world;
}

describe('dig', () => {
  it('removes adjacent earth while preserving reinforced foundation and truthful removal counts', () => {
    const world = new World(12, 12);
    world.setMaterial(5, 4, 3);
    world.setMaterial(4, 4, 1);
    expect(dig(world, { x: 18, y: 18 }, { x: 22, y: 18 }, 5, 20)).toBe(1);
    expect(world.material[world.index(5, 4)]).toBe(3);
    expect(world.isSolid(4, 4)).toBe(false);
    expect(dig(world, { x: 18, y: 18 }, { x: 22, y: 18 }, 5, 20)).toBe(0);
  });

  it('removes a circular brush by cell centers and exposes collision immediately', () => {
    const world = filledWorld();
    const version = world.terrainVersion;

    const removed = dig(world, { x: 18, y: 18 }, { x: 22, y: 18 }, 4.1, 20);

    expect(removed).toBe(5);
    expect(world.terrainVersion).toBe(version + 5);
    expect(world.isSolid(5, 4)).toBe(false);
    expect(world.isSolid(4, 4)).toBe(false);
    expect(world.isSolid(6, 4)).toBe(false);
    expect(world.isSolid(5, 3)).toBe(false);
    expect(world.isSolid(5, 5)).toBe(false);
    expect(world.isSolid(4, 3)).toBe(true);
    expect(world.isSolid(6, 5)).toBe(true);
    expect(world.isSolidAtPixel(22, 18)).toBe(false);
    expect(dig(world, { x: 18, y: 18 }, { x: 22, y: 18 }, 4.1, 20)).toBe(0);
    expect(world.terrainVersion).toBe(version + 5);
  });

  it('clamps a distant aim and never removes cells beyond the digging reach', () => {
    const world = filledWorld();
    const origin = { x: 18, y: 18 };

    const removed = dig(world, origin, { x: 100, y: 18 }, 8, 10);

    expect(removed).toBeGreaterThan(0);
    expect(world.isSolid(6, 4)).toBe(false);
    expect(world.isSolid(7, 4)).toBe(true);
    for (let y = 1; y < 11; y++) {
      for (let x = 1; x < 11; x++) {
        if (!world.isSolid(x, y)) {
          const distance = Math.hypot((x + 0.5) * 4 - origin.x, (y + 0.5) * 4 - origin.y);
          expect(distance).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it('preserves map boundaries even when the brush extends outside the map', () => {
    const world = filledWorld();

    dig(world, { x: 6, y: 6 }, { x: -20, y: -20 }, 100, 100);

    expect(world.isSolid(0, 0)).toBe(true);
    expect(world.isSolid(0, 5)).toBe(true);
    expect(world.isSolid(5, 0)).toBe(true);
    expect(world.isSolid(11, 5)).toBe(true);
    expect(world.isSolid(5, 11)).toBe(true);
  });

  it('does not alter water when excavating neighboring terrain', () => {
    const world = new World(12, 12);
    world.setSolid(5, 4, true);
    world.water[world.index(4, 4)] = 0.5;

    expect(dig(world, { x: 18, y: 18 }, { x: 22, y: 18 }, 5, 20)).toBe(1);
    expect(world.water[world.index(4, 4)]).toBe(0.5);
  });
});
