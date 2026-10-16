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
    expect(sampleWaterPocketVolume(depth, 0, 0.5)).toBe(WATER_POCKET_VOLUMES.small);
    expect(sampleWaterPocketVolume(depth, small - 1e-12, 0.5)).toBe(WATER_POCKET_VOLUMES.small);
    expect(sampleWaterPocketVolume(depth, small, 0.5)).toBe(WATER_POCKET_VOLUMES.medium);
    expect(sampleWaterPocketVolume(depth, small + medium - 1e-12, 0.5)).toBe(WATER_POCKET_VOLUMES.medium);
    expect(sampleWaterPocketVolume(depth, small + medium, 0.5)).toBe(WATER_POCKET_VOLUMES.large);
    expect(sampleWaterPocketVolume(depth, 1 - Number.EPSILON, 0.5)).toBe(WATER_POCKET_VOLUMES.large);
  });

  it.each([
    { size: 'small', classSample: 0, min: 30, nominal: 45, max: 60 },
    { size: 'medium', classSample: 0.8, min: 60, nominal: 90, max: 120 },
    { size: 'large', classSample: 0.99, min: 120, nominal: 180, max: 240 },
  ])('varies a $size pocket across its full inclusive range without changing the class draw', ({ classSample, min, nominal, max }) => {
    expect(sampleWaterPocketVolume(50, classSample, 0)).toBe(min);
    expect(sampleWaterPocketVolume(50, classSample, 0.5)).toBe(nominal);
    expect(sampleWaterPocketVolume(50, classSample, 1 - Number.EPSILON)).toBe(max);
  });

  it.each([
    { size: 'small', classSample: 0, min: 30, max: 60 },
    { size: 'medium', classSample: 0.8, min: 60, max: 120 },
    { size: 'large', classSample: 0.99, min: 120, max: 240 },
  ])('gives every integer volume an equal interval within the $size range', ({ classSample, min, max }) => {
    const count = max - min + 1;
    const actual = Array.from({ length: count }, (_, index) =>
      sampleWaterPocketVolume(50, classSample, (index + 0.5) / count));
    expect(actual).toEqual(Array.from({ length: count }, (_, index) => min + index));
  });
});
