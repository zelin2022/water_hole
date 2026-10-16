import { World, type Point } from './world';
import { sampleWaterPocketVolume } from './water-pockets';

export type WaterDistribution = 'depth-weighted' | 'many-small' | 'fewer-large';
export const DEFAULT_WATER_DISTRIBUTION: WaterDistribution = 'depth-weighted';

interface ReservoirBand {
  slots: readonly (readonly [number, number])[];
  masses: Record<Exclude<WaterDistribution, 'depth-weighted'>, readonly number[]>;
}

// The two legacy comparisons retain their previous maps and equal depth-band
// budgets. The new default reuses the many-small locations but samples one of
// three fixed volumes at every depth, without quotas or budget conditioning.
const RESERVOIR_BANDS: readonly ReservoirBand[] = [
  {
    slots: [[140, 101], [140, 73], [210, 73], [275, 73], [345, 73], [210, 101], [275, 101], [345, 101]],
    masses: {
      'many-small': [20, 20, 20, 20, 20, 30, 65],
      'fewer-large': [40, 75, 80],
    },
  },
  {
    slots: [133, 169].flatMap((row) => [35, 100, 175, 230, 350].map((column) => [column, row] as const)),
    masses: {
      'many-small': [35, 40, 45, 45, 50, 55, 60, 70, 90, 110],
      'fewer-large': [80, 110, 125, 140, 145],
    },
  },
  {
    slots: [200, 233].flatMap((row) => [35, 105, 180, 250, 355].map((column) => [column, row] as const)),
    masses: {
      'many-small': [60, 75, 85, 95, 105, 115, 125, 140, 145, 155],
      'fewer-large': [120, 140, 155, 160, 170, 175, 180],
    },
  },
];

export interface GeneratedSite {
  world: World;
  /** Player top-left position; dimensions remain the player module's concern. */
  spawn: Point;
  hopper: Point;
  surfaceY: number;
}

/** A bounded geological site with a guaranteed starter route and depth-biased reservoirs. */
export function generateSite(seed: number, distribution: WaterDistribution = DEFAULT_WATER_DISTRIBUTION): GeneratedSite {
  const random = seededRandom(seed);
  const world = new World(384, 256, 4);
  const phase = random() * Math.PI * 2;
  const surfaceRow = 44;

  for (let x = 1; x < world.width - 1; x++) {
    // Keep the machine, spawn, and shaft lip on one predictable platform.
    const surface = x < 115 ? surfaceRow
      : surfaceRow + Math.round(Math.sin(x / 33 + phase) * 5 + Math.sin(x / 13 + phase) * 2);
    for (let y = surface; y < world.height - 1; y++) {
      const stone = y > 77 + Math.sin(x / 37 + phase) * 9
        && Math.sin(y / 13 + Math.sin(x / 31 + phase) * 1.3) > -0.2;
      world.setMaterial(x, y, stone ? 2 : 1);
    }
  }

  // Straight sides and a flat bottom guarantee the initial climb works without
  // wall digging. Starter water lies behind a thin earth wall beside the floor.
  for (let y = surfaceRow; y < 106; y++) {
    for (let x = 88; x < 106; x++) world.setMaterial(x, y, 0);
  }
  for (let y = 90; y < 112; y++) {
    for (let x = 106; x < 129; x++) world.setMaterial(x, y, 1);
  }
  carveEllipse(world, 112, 102, 5, 3, true);

  // Air-filled caves diversify excavation without creating fragile overhangs on
  // the starter shaft. These stay clear of reservoir placement bands.
  for (const [cx, cy] of [[170, 112], [265, 161], [320, 210]]) {
    const rx = 11 + Math.floor(random() * 5);
    carveEllipse(world, cx!, cy!, rx, 6, false);
  }

  // Reservoir randomness must not reroll the geology or air caves when a
  // player switches distributions for the same seed.
  const reservoirRandom = seededRandom(seed ^ 0x57a7e2);
  for (const [bandIndex, band] of RESERVOIR_BANDS.entries()) {
    const masses = distribution === 'depth-weighted'
      ? null : varyMasses(band.masses[distribution], reservoirRandom);
    // Both comparisons guarantee a second find close to the starter pocket.
    const slots = bandIndex === 0
      ? [band.slots[0]!, ...shuffle(band.slots.slice(1), reservoirRandom)]
      : shuffle(band.slots, reservoirRandom);
    if (distribution === 'depth-weighted') {
      for (const [column, row] of slots.slice(0, band.masses['many-small'].length)) {
        const cx = column + Math.floor(reservoirRandom() * 9) - 4;
        const cy = row + Math.floor(reservoirRandom() * 7) - 3;
        // One terrain row is one HUD metre; world pixels would exaggerate
        // the depth bias by the four-pixel cell size.
        const mass = sampleWaterPocketVolume(cy - surfaceRow, reservoirRandom());
        carveReservoir(world, cx, cy, mass);
      }
      continue;
    }
    for (const [index, mass] of shuffle(masses!, reservoirRandom).entries()) {
      const [column, row] = slots[index]!;
      const cx = column + Math.floor(reservoirRandom() * 9) - 4;
      const cy = row + Math.floor(reservoirRandom() * 7) - 3;
      carveReservoir(world, cx, cy, mass);
    }
  }

  return {
    world,
    spawn: { x: 232, y: surfaceRow * world.cellSize - 32 },
    hopper: { x: 160, y: surfaceRow * world.cellSize - 56 },
    surfaceY: surfaceRow * world.cellSize,
  };
}

function carveReservoir(world: World, cx: number, cy: number, mass: number): void {
  // Select the closest cells in elliptical distance, rather than filling a
  // rounded ellipse with a variable volume. Every chosen cell has a neighbor
  // closer to the center, so the pocket stays connected and holds exactly its
  // assigned integer mass without partial cells or erased water.
  const aspect = 2.2;
  const rx = Math.sqrt(mass * aspect / Math.PI);
  const ry = Math.sqrt(mass / (aspect * Math.PI));
  const candidates: { x: number; y: number; distance: number }[] = [];
  for (let y = cy - Math.ceil(ry) - 2; y <= cy + Math.ceil(ry) + 2; y++) {
    for (let x = cx - Math.ceil(rx) - 2; x <= cx + Math.ceil(rx) + 2; x++) {
      candidates.push({ x, y, distance: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const cells = candidates.slice(0, mass);
  // Placement bands provide several terrain cells of separation from caves,
  // the boundary and other pockets. Guard the invariant if tuning moves them.
  for (const { x, y } of cells) {
    if (!world.isSolid(x, y)
      || !world.isSolid(x - 1, y) || !world.isSolid(x + 1, y)
      || !world.isSolid(x, y - 1) || !world.isSolid(x, y + 1)) {
      throw new Error('Reservoir placement intersects an existing opening.');
    }
  }
  for (const { x, y } of cells) {
    world.setMaterial(x, y, 0);
    world.water[world.index(x, y)] = 1;
  }
}

/** Pairwise variation changes sizes without changing the depth band's budget. */
function varyMasses(masses: readonly number[], random: () => number): number[] {
  const varied = [...masses];
  for (let index = 0; index + 1 < varied.length; index += 2) {
    const change = Math.floor(random() * 9) - 4;
    varied[index]! += change;
    varied[index + 1]! -= change;
  }
  return varied;
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
  }
  return shuffled;
}

function carveEllipse(world: World, cx: number, cy: number, rx: number, ry: number, water: boolean): void {
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
      world.setMaterial(x, y, 0);
      if (water) world.water[world.index(x, y)] = 1;
    }
  }
}

function seededRandom(seed: number): () => number {
  let state = Number.isFinite(seed) ? seed >>> 0 : 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
