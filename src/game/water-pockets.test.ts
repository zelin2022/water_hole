import { describe, expect, it } from 'vitest';
import { sampleWaterPocketVolume, WATER_POCKET_VOLUMES, waterPocketProbabilities } from './water-pockets';

describe('depth-weighted water-pocket sizes', () => {
  it('uses the same 3:1 frequency ratio for small/medium and medium/large at 50 m', () => {
    const probability = waterPocketProbabilities(50);
    expect(probability.small).toBeCloseTo(9 / 13, 12);
    expect(probability.medium).toBeCloseTo(3 / 13, 12);
    expect(probability.large).toBeCloseTo(1 / 13, 12);
  });

  it.each([0, 29, 50, 100, 189, 211])('keeps all three sizes possible with the requested pairwise ratios at %i m', (depth) => {
    const probability = waterPocketProbabilities(depth);
    const ratio = 3 * 0.9 ** ((depth - 50) / 100);
    expect(probability.small / probability.medium).toBeCloseTo(ratio, 12);
    expect(probability.medium / probability.large).toBeCloseTo(ratio, 12);
    expect(probability.small + probability.medium + probability.large).toBeCloseTo(1, 12);
    for (const value of Object.values(probability)) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('gradually favours larger pockets with depth rather than unlocking a new size', () => {
    const surface = waterPocketProbabilities(0);
    const bottom = waterPocketProbabilities(200);
    expect(bottom.small).toBeLessThan(surface.small);
    expect(bottom.large).toBeGreaterThan(surface.large);
    expect(surface.large).toBeGreaterThan(0.07);
    expect(bottom.large).toBeLessThan(0.11);
  });

  it.each([0, 50, 200])('samples every class at its exact cumulative probability boundary at %i m', (depth) => {
    const { small, medium } = waterPocketProbabilities(depth);
    expect(sampleWaterPocketVolume(depth, 0)).toBe(WATER_POCKET_VOLUMES.small);
    expect(sampleWaterPocketVolume(depth, small - 1e-12)).toBe(WATER_POCKET_VOLUMES.small);
    expect(sampleWaterPocketVolume(depth, small)).toBe(WATER_POCKET_VOLUMES.medium);
    expect(sampleWaterPocketVolume(depth, small + medium - 1e-12)).toBe(WATER_POCKET_VOLUMES.medium);
    expect(sampleWaterPocketVolume(depth, small + medium)).toBe(WATER_POCKET_VOLUMES.large);
    expect(sampleWaterPocketVolume(depth, 1 - Number.EPSILON)).toBe(WATER_POCKET_VOLUMES.large);
  });
});
