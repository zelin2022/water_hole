import { describe, expect, it } from 'vitest';
import { terrainDamageStage } from './terrain-damage';

describe('terrain damage stages', () => {
  it('shows four progressively damaged states before terrain breaks', () => {
    expect([0, 0.1, 0.35, 0.6, 0.9].map(fraction => terrainDamageStage(6, fraction * 16)))
      .toEqual([0, 1, 2, 3, 4]);
  });
  it('uses the fraction of material durability rather than the absolute strike count', () => {
    expect(terrainDamageStage(1, 1)).toBe(2);
    expect(terrainDamageStage(5, 1)).toBe(1);
    expect(terrainDamageStage(1, 2.4)).toBe(terrainDamageStage(6, 12.8));
    expect(terrainDamageStage(4, 0.4)).toBe(2);
  });
  it('never damages foundation, air, unknown materials or invalid saved damage', () => {
    for (const material of [0, 3, 99]) expect(terrainDamageStage(material, 100)).toBe(0);
    for (const damage of [-1, 0, Number.NaN, Infinity]) expect(terrainDamageStage(2, damage)).toBe(0);
  });
});
