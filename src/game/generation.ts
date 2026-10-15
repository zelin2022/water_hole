import { World, type Point } from './world';

export interface GeneratedSite {
  world: World;
  /** Player top-left position; dimensions remain the player module's concern. */
  spawn: Point;
  hopper: Point;
  surfaceY: number;
}

/** A bounded geological site with a guaranteed starter route and small reservoirs. */
export function generateSite(seed: number): GeneratedSite {
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
  carveReservoir(world, 116, 101, 9, 5);

  // Stratified positions prevent overlap and keep masses in the intended range.
  for (const row of [88, 137, 186, 229]) {
    for (const column of [156, 224, 294, 352]) {
      const cx = column + Math.floor(random() * 13) - 6;
      const cy = row + Math.floor(random() * 13) - 6;
      const rx = 8 + Math.floor(random() * 3);
      const ry = 4 + Math.floor(random() * 2);
      carveReservoir(world, cx, cy, rx, ry);
    }
  }

  // Air-filled caves diversify excavation without creating fragile overhangs on
  // the starter shaft. These stay clear of reservoir placement bands.
  for (const [cx, cy] of [[170, 112], [265, 161], [320, 210]]) {
    const rx = 11 + Math.floor(random() * 5);
    carveEllipse(world, cx!, cy!, rx, 6, false);
  }

  return {
    world,
    spawn: { x: 232, y: surfaceRow * world.cellSize - 32 },
    hopper: { x: 160, y: surfaceRow * world.cellSize - 56 },
    surfaceY: surfaceRow * world.cellSize,
  };
}

function carveReservoir(world: World, cx: number, cy: number, rx: number, ry: number): void {
  carveEllipse(world, cx, cy, rx, ry, true);
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
