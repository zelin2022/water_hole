import { createSession, playerCenter, stepSession, type GameInput } from '../src/game/session';
import { damageStrike } from '../src/game/digging';
import { createTank, upgradeStats } from '../src/game/economy';
import { createVision, pingSonar, sonarTravelDistance, updateVision, type VisionInput } from '../src/game/vision';
import { stepWater, totalWater } from '../src/game/water';
import { World, type Point } from '../src/game/world';

export interface Dimensions { width: number; height: number }
type Measure = (operation: string, work: () => void) => void;
export interface BenchmarkScenario {
  world: World;
  description: string;
  step: (iteration: number, measure: Measure) => void;
}

/** Nearest-rank percentiles keep the largest spikes visible in short runs. */
export function summarizeTimings(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    meanMs: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : 0,
    p50Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.5) - 1)] ?? 0,
    p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
    maxMs: sorted.at(-1) ?? 0,
  };
}

export function cpuLoadPercent(cpuMicroseconds: number, wallMilliseconds: number, logicalCores: number) {
  const oneCorePercent = wallMilliseconds > 0 ? cpuMicroseconds / (wallMilliseconds * 1000) * 100 : 0;
  return { oneCorePercent, machineCapacityPercent: oneCorePercent / Math.max(1, logicalCores) };
}

export function worldMetrics(world: World) {
  let activeWaterCells = 0, activeWaterRows = 0, invalidWaterCells = 0, solidCells = 0;
  for (let y = 0; y < world.height; y++) {
    let active = false;
    for (let x = 0; x < world.width; x++) {
      const index = world.index(x, y), amount = world.water[index];
      if (world.solid[index]) solidCells++;
      if (amount > 1e-6) { activeWaterCells++; active = true; }
      if (!Number.isFinite(amount) || amount < -1e-6 || amount > 1 + 1e-6 || (amount > 0 && world.solid[index])) invalidWaterCells++;
    }
    if (active) activeWaterRows++;
  }
  return { width: world.width, height: world.height, cells: world.solid.length, solidCells, activeWaterCells, activeWaterRows, invalidWaterCells };
}

export function executeScenario(scenario: BenchmarkScenario, options: {
  iterations: number;
  maxDurationMs: number;
  clock?: () => number;
  sampleMemory?: () => void;
}) {
  if (!Number.isInteger(options.iterations) || options.iterations < 1 || options.iterations > 10_000
    || !Number.isFinite(options.maxDurationMs) || options.maxDurationMs <= 0) throw new RangeError('Benchmark work must be bounded.');
  const clock = options.clock ?? (() => performance.now());
  const samples: Record<string, number[]> = {};
  const before = worldMetrics(scenario.world), initialWater = totalWater(scenario.world);
  const start = clock();
  let iterations = 0;
  const measure: Measure = (operation, work) => {
    const begin = clock();
    work();
    (samples[operation] ??= []).push(Math.max(0, clock() - begin));
  };
  while (iterations < options.iterations && (iterations === 0 || clock() - start < options.maxDurationMs)) {
    scenario.step(iterations, measure);
    iterations++;
    options.sampleMemory?.();
  }
  const wallMs = clock() - start, finalWater = totalWater(scenario.world);
  return {
    description: scenario.description, iterations, requestedIterations: options.iterations,
    stoppedAtBudget: iterations < options.iterations, wallMs, before, after: worldMetrics(scenario.world),
    water: { initial: initialWater, final: finalWater, absoluteDrift: Math.abs(finalWater - initialWater),
      relativeDrift: initialWater ? Math.abs(finalWater - initialWater) / initialWater : 0 },
    operations: Object.fromEntries(Object.entries(samples).map(([operation, values]) => [operation, summarizeTimings(values)])),
  };
}

function emptyWorld(dimensions: Dimensions): World {
  return new World(dimensions.width, dimensions.height, 4);
}

function deepWorld(dimensions: Dimensions): World {
  const world = emptyWorld(dimensions);
  const middle = Math.floor(world.width / 2);
  for (let y = 1; y < world.height - 1; y++) {
    for (let x = 1; x < world.width - 1; x++) {
      // A connected shaft through the entire depth, with side galleries.
      if (Math.abs(x - middle) <= 6 || y % 100 < 8) continue;
      const index = world.index(x, y);
      world.material[index] = 6;
      world.solid[index] = 1;
    }
  }
  world.terrainVersion++;
  return world;
}

function maximumVision(position: Point, time: number): VisionInput {
  const tank = createTank();
  tank.upgrades.torsoLamp = tank.upgrades.headlampWidth = tank.upgrades.headlampDepth = 2;
  return { position, headPosition: position, aim: { x: position.x + 100, y: position.y + 30 },
    facing: 1, time, ...upgradeStats(tank), bodyBounds: { x: position.x - 9, y: position.y - 16, width: 18, height: 32 } };
}

export const benchmarkDefinitions = [
  {
    id: 'normal-demo',
    create(): BenchmarkScenario {
      const session = createSession({ seed: 14321 });
      const vision = createVision(session.world);
      const input: GameInput = { left: false, right: false, up: false, down: false, jumpPressed: false,
        digging: false, collecting: false, depositPressed: false, aim: { x: session.player.x + 100, y: session.player.y + 32 } };
      return { world: session.world, description: 'Actual seeded 384 × 2053 demo site, normal fluid/movement plus vision at 60 Hz.',
        step(iteration, measure) {
          measure('session-step', () => stepSession(session, input, 1 / 60));
          measure('normal-vision', () => updateVision(session.world, vision, {
            position: playerCenter(session), aim: input.aim, facing: 1, time: iteration / 60,
          }));
        } };
    },
  },
  {
    id: 'deep-tunnel',
    create(dimensions: Dimensions = { width: 384, height: 2053 }): BenchmarkScenario {
      const world = deepWorld(dimensions), vision = createVision(world);
      const position = { x: (Math.floor(world.width / 2) + 0.5) * 4, y: (world.height - 6.5) * 4 };
      pingSonar(world, vision, position, 0, world.height * world.cellSize);
      const target = { x: position.x + 24, y: 6 };
      return { world, description: 'Full-depth connected shaft and galleries; maximum lamps and a deliberately site-wide sonar pulse (beyond normal viewing range).',
        step(iteration, measure) {
          measure('maximum-lamp-vision', () => updateVision(world, vision, maximumVision(position, iteration / 60)));
          measure(iteration === 0 ? 'sonar-cold-build' : 'sonar-cached-query', () => { sonarTravelDistance(world, vision, target); });
        } };
    },
  },
  {
    id: 'many-water-bodies',
    create(dimensions: Dimensions = { width: 384, height: 2053 }): BenchmarkScenario {
      const world = emptyWorld(dimensions);
      for (let y = 3; y < world.height - 3; y += 6) {
        for (let x = 2; x < world.width - 2; x++) {
          if (x % 16 < 12) world.water[world.index(x, y)] = 1;
        }
      }
      // Alternating rock ledges make falling bodies land, spread, and reconnect.
      for (let y = 18; y < world.height - 5; y += 24) {
        for (let x = 1; x < world.width - 1; x++) {
          if ((x + (y % 48 ? 0 : 12)) % 32 < 24) world.setMaterial(x, y, 2);
        }
      }
      return { world, description: 'Thousands of separated falling water bodies across nearly every depth, with alternating ledges and connected spillways.',
        step(_iteration, measure) { measure('adversarial-water-step', () => stepWater(world, 1 / 60)); } };
    },
  },
  {
    id: 'maximum-mining',
    create(dimensions: Dimensions = { width: 384, height: 2053 }): BenchmarkScenario {
      const world = deepWorld(dimensions), vision = createVision(world);
      const tank = createTank(); tank.upgrades.digRadius = 7; tank.upgrades.digDamage = 3;
      const stats = upgradeStats(tank);
      return { world, description: 'Maximum-radius, maximum-damage strikes into granite at changing depths, followed by maximum lamp vision and daylight cache invalidation.',
        step(iteration, measure) {
          const row = 15 + Math.floor(iteration / 3) * 43 % Math.max(1, world.height - 35);
          const origin = { x: (Math.floor(world.width / 2) + 1) * 4, y: (row + 0.5) * 4 };
          measure('maximum-pick-impact', () => { damageStrike(world, origin, { x: origin.x + 200, y: origin.y }, stats.digRadius, stats.digDamage); });
          measure('vision-after-impact', () => updateVision(world, vision, maximumVision(origin, iteration / 60)));
        } };
    },
  },
] as const;
