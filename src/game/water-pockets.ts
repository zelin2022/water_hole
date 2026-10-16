export const WATER_POCKET_VOLUMES = { small: 45, medium: 90, large: 180 } as const;
export const WATER_POCKET_VARIATION = { small: 15, medium: 30, large: 60 } as const;
export type WaterPocketSize = keyof typeof WATER_POCKET_VOLUMES;

export const WATER_POCKET_VOLUME_RANGES = {
  small: {
    min: WATER_POCKET_VOLUMES.small - WATER_POCKET_VARIATION.small,
    max: WATER_POCKET_VOLUMES.small + WATER_POCKET_VARIATION.small,
  },
  medium: {
    min: WATER_POCKET_VOLUMES.medium - WATER_POCKET_VARIATION.medium,
    max: WATER_POCKET_VOLUMES.medium + WATER_POCKET_VARIATION.medium,
  },
  large: {
    min: WATER_POCKET_VOLUMES.large - WATER_POCKET_VARIATION.large,
    max: WATER_POCKET_VOLUMES.large + WATER_POCKET_VARIATION.large,
  },
} as const;

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

/** Map a seeded uniform draw in [0, 1) to a depth-weighted size class. */
export function sampleWaterPocketSize(depth: number, classSample: number): WaterPocketSize {
  const probability = waterPocketProbabilities(depth);
  if (classSample < probability.small) return 'small';
  if (classSample < probability.small + probability.medium) return 'medium';
  return 'large';
}

/** Independently sample the class and an inclusive integer volume within its range. */
export function sampleWaterPocketVolume(depth: number, classSample: number, volumeSample: number): number {
  const size = sampleWaterPocketSize(depth, classSample);
  const { min, max } = WATER_POCKET_VOLUME_RANGES[size];
  return min + Math.floor(volumeSample * (max - min + 1));
}
