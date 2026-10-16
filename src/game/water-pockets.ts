export const WATER_POCKET_VOLUMES = { small: 45, medium: 90, large: 180 } as const;

export interface WaterPocketProbabilities {
  small: number;
  medium: number;
  large: number;
}

/** Frequency of each pocket class at a depth in metres below the site surface. */
export function waterPocketProbabilities(depth: number): WaterPocketProbabilities {
  const ratio = 3 * 0.9 ** ((depth - 50) / 100);
  // small / medium = medium / large = ratio, so the relative weights
  // must be ratio squared : ratio : 1 before normalization.
  const total = ratio * ratio + ratio + 1;
  return { small: ratio * ratio / total, medium: ratio / total, large: 1 / total };
}

/** Map one seeded uniform draw in [0, 1) to a fixed-volume pocket. */
export function sampleWaterPocketVolume(depth: number, sample: number): number {
  const probability = waterPocketProbabilities(depth);
  if (sample < probability.small) return WATER_POCKET_VOLUMES.small;
  if (sample < probability.small + probability.medium) return WATER_POCKET_VOLUMES.medium;
  return WATER_POCKET_VOLUMES.large;
}
