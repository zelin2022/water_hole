import { describe, expect, it } from 'vitest';
import { damageStrike, strikeCenter } from './digging';
import { World } from './world';

describe('pickaxe geometry and damage', () => {
  it.each([6, 16])('never cracks or counts the sealed boundary with a radius-76, damage-%i impact', (damage) => {
    for (const [origin, aim] of [
      [{ x: 2, y: 30 }, { x: 2, y: 200 }],
      [{ x: 238, y: 30 }, { x: 238, y: 200 }],
      [{ x: 30, y: 2 }, { x: 200, y: 2 }],
      [{ x: 30, y: 238 }, { x: 200, y: 238 }],
    ]) {
      const world = new World(60, 60);
      world.water[world.index(10, 30)] = 0.75;
      const beforeVersion = world.terrainVersion;
      for (let hit = 0; hit < 3; hit++) {
        expect(damageStrike(world, origin!, aim!, 76, damage)).toMatchObject({ damaged: 0, removed: 0 });
      }
      expect(world.damage.every((value) => value === 0)).toBe(true);
      expect(world.terrainVersion).toBe(beforeVersion);
      expect(world.water[world.index(10, 30)]).toBe(0.75);
    }
  });

  it.each([6, 16])('intercepts brush-overlapping boundary faces with larger cells at damage %i', (damage) => {
    // The cell's face can overlap the brush while its center lies outside it.
    // Previously it became lastRock, then was falsely counted as excavated.
    const world = new World(60, 60, 16);
    const version = world.terrainVersion;
    const result = damageStrike(world, { x: 8, y: 320 }, { x: 100, y: 363 }, 76, damage);
    expect(result).toMatchObject({ damaged: 0, removed: 0 });
    expect(world.damage.every((value) => value === 0)).toBe(true);
    expect(world.terrainVersion).toBe(version);
    expect(world.isSolid(0, 20)).toBe(true);
  });

  it('still excavates normal terrain near the sealed edge without changing its neighboring water', () => {
    const world = new World(60, 60);
    world.setMaterial(3, 25, 1);
    world.setMaterial(4, 25, 6);
    world.water[world.index(3, 26)] = 0.75;
    expect(damageStrike(world, { x: 14, y: 30 }, { x: 14, y: 200 }, 76, 16))
      .toMatchObject({ damaged: 2, removed: 2 });
    expect(world.isSolid(3, 25)).toBe(false);
    expect(world.isSolid(4, 25)).toBe(false);
    expect(world.damage.every((value) => value === 0)).toBe(true);
    expect(world.water[world.index(3, 26)]).toBe(0.75);
    expect(world.isSolid(0, 25)).toBe(true);
  });

  it.each([[1, 3], [4, 1], [5, 10], [6, 16]] as const)
  ('keeps material %i intact until exactly %i starting-pick impacts', (material, health) => {
    const world = new World(30, 20);
    world.setMaterial(13, 7, material);
    for (let impact = 1; impact <= health; impact++) {
      const result = damageStrike(world, { x: 30, y: 30 }, { x: 100, y: 30 }, 12, 1);
      expect(result.removed).toBe(impact === health ? 1 : 0);
      expect(world.isSolid(13, 7)).toBe(impact < health);
    }
  });

  it('stops even a powerful wide strike at reinforced foundation without damaging rock behind it', () => {
    const world = new World(30, 20);
    for (let y = 1; y < 19; y++) world.setMaterial(10, y, 3);
    world.setMaterial(13, 7, 1);
    const version = world.terrainVersion;
    for (let strike = 0; strike < 3; strike++) {
      expect(damageStrike(world, { x: 30, y: 30 }, { x: 100, y: 30 }, 12, 100))
        .toMatchObject({ damaged: 0, removed: 0 });
    }
    expect(world.material[world.index(10, 7)]).toBe(3);
    expect(world.isSolid(13, 7)).toBe(true);
    expect(world.damage.every(value => value === 0)).toBe(true);
    expect(world.terrainVersion).toBe(version);
  });

  it('uses aim direction at a fixed radius-dependent distance, including nearby aim', () => {
    const origin = { x: 30, y: 30 };
    expect(strikeCenter(origin, { x: 31, y: 30 }, 12)).toEqual({ x: 54, y: 30 });
    expect(strikeCenter(origin, { x: 300, y: 30 }, 12)).toEqual({ x: 54, y: 30 });
    expect(strikeCenter(origin, { x: 30, y: 30 }, 16, -1)).toEqual({ x: 2, y: 30 });
    const diagonal = strikeCenter(origin, { x: 40, y: 40 }, 16);
    expect(Math.hypot(diagonal.x - 30, diagonal.y - 30)).toBeCloseTo(28);
  });

  it('keeps partial stone damage until a later strike actually breaks it', () => {
    const world = new World(30, 20);
    world.setMaterial(13, 7, 2);
    const cell = world.index(13, 7);
    const origin = { x: 30, y: 30 };
    const aim = { x: 100, y: 30 };
    expect(damageStrike(world, origin, aim, 12, 1)).toMatchObject({ damaged: 1, removed: 0 });
    expect(world.damage[cell]).toBe(1);
    expect(world.isSolid(13, 7)).toBe(true);
    expect(damageStrike(world, origin, aim, 12, 1)).toMatchObject({ damaged: 1, removed: 0 });
    expect(world.damage[cell]).toBe(2);
    for (let strike = 3; strike < 6; strike++) {
      expect(damageStrike(world, origin, aim, 12, 1)).toMatchObject({ damaged: 1, removed: 0 });
      expect(world.damage[cell]).toBe(strike);
      expect(world.isSolid(13, 7)).toBe(true);
    }
    expect(damageStrike(world, origin, aim, 12, 1)).toMatchObject({ damaged: 1, removed: 1 });
    expect(world.isSolid(13, 7)).toBe(false);
    expect(world.material[cell]).toBe(0);
    expect(world.damage[cell]).toBe(0);
  });

  it.each([[1, 6], [2, 3], [3, 2], [6, 1]])('makes damage %i break stone in exactly %i isolated impacts', (damage, impacts) => {
    const world = new World(30, 20);
    world.setMaterial(13, 7, 2);
    const cell = world.index(13, 7);
    for (let impact = 1; impact <= impacts; impact++) {
      const result = damageStrike(world, { x: 30, y: 30 }, { x: 100, y: 30 }, 12, damage);
      expect(result.removed).toBe(impact === impacts ? 1 : 0);
      expect(world.isSolid(13, 7)).toBe(impact < impacts);
      expect(world.damage[cell]).toBe(impact === impacts ? 0 : impact * damage);
    }
  });

  it('breaks earth with three damage without removing water or boundary cells', () => {
    const world = new World(30, 20);
    world.setMaterial(13, 7, 1);
    world.water[world.index(12, 7)] = 0.75;
    expect(damageStrike(world, { x: 30, y: 30 }, { x: 100, y: 30 }, 12, 3).removed).toBe(1);
    expect(world.water[world.index(12, 7)]).toBe(0.75);
    damageStrike(world, { x: 10, y: 10 }, { x: -100, y: -100 }, 50, 100);
    expect(world.isSolid(0, 0)).toBe(true);
    expect(world.isSolid(0, 7)).toBe(true);
  });

  it('strikes an adjacent blocking face rather than excavating through it', () => {
    const world = new World(30, 20);
    for (let y = 1; y < 19; y++) world.setMaterial(10, y, 2);
    world.setMaterial(13, 7, 1);
    const result = damageStrike(world, { x: 30, y: 30 }, { x: 100, y: 30 }, 12, 1);
    expect(result.damaged).toBeGreaterThan(0);
    expect(world.damage[world.index(10, 7)]).toBe(1);
    expect(world.isSolid(13, 7)).toBe(true);
    expect(world.damage[world.index(13, 7)]).toBe(0);
  });

  it('does not damage a cell repeatedly when many rays hit the same face', () => {
    const world = new World(30, 20);
    for (let y = 1; y < 19; y++) world.setMaterial(10, y, 2);
    damageStrike(world, { x: 30, y: 30 }, { x: 100, y: 30 }, 12, 1);
    expect(Math.max(...world.damage)).toBe(1);
  });

  it('takes a useful circular bite from contiguous earth in one impact', () => {
    const world = new World(30, 20);
    for (let y = 1; y < 19; y++) {
      for (let x = 10; x < 29; x++) world.setMaterial(x, y, 1);
    }
    const result = damageStrike(world, { x: 30, y: 30 }, { x: 100, y: 30 }, 12, 3);
    expect(result.removed).toBeGreaterThanOrEqual(20);
    expect(world.isSolid(13, 7)).toBe(false);
    expect(world.isSolid(13, 3)).toBe(true);
  });

  it('ignores invalid damage and geometry', () => {
    const world = new World(30, 20);
    world.setMaterial(13, 7, 1);
    expect(damageStrike(world, { x: 30, y: 30 }, { x: 100, y: 30 }, 12, 0).damaged).toBe(0);
    expect(damageStrike(world, { x: NaN, y: 30 }, { x: 100, y: 30 }, 12, 1).damaged).toBe(0);
    expect(world.isSolid(13, 7)).toBe(true);
  });
});
