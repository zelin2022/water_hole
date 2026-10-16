import { UPGRADE_DEFINITIONS, upgradeStats, type Tank } from './economy';
import { DEMO_DELIVERY_LIMIT, DIG_INTERVAL, DIG_WINDUP, type Session } from './session';
import { World } from './world';
import { totalWater } from './water';
import { detachSmallDirt, DIRT_TERMINAL_SPEED } from './dirt';
import { DEFAULT_STEP_HEIGHT_CELLS } from './player';

export const SAVE_VERSION = 1;
const MAX_CELLS = 1024 * 1024;

export function serializeSession(session: Session): string {
  const { world, explored, ...state } = session;
  return JSON.stringify({
    version: SAVE_VERSION,
    world: { width: world.width, height: world.height, cellSize: world.cellSize,
      solid: Array.from(world.solid), material: Array.from(world.material),
      damage: Array.from(world.damage), water: Array.from(world.water) },
    session: { ...state, explored: Array.from(explored) },
  });
}

function assert(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`Invalid save: ${reason}`);
}
function record(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}
function point(value: unknown, extentX: number, extentY: number): boolean {
  return record(value) && finite(value.x, -100, extentX + 100) && finite(value.y, -100, extentY + 100);
}
function numericArray(value: unknown, count: number, minimum: number, maximum: number, integral = false): value is number[] {
  return Array.isArray(value) && value.length === count && value.every(item => finite(item, minimum, maximum) && (!integral || Number.isInteger(item)));
}

/** Validate before allocating a world; a failed load leaves the active run untouched. */
export function deserializeSession(json: string): Session {
  let data: unknown;
  try { data = JSON.parse(json); } catch { throw new Error('Invalid save: unreadable JSON'); }
  assert(record(data) && data.version === SAVE_VERSION, 'unsupported version');
  const raw = data.world;
  const state = data.session;
  assert(record(raw) && record(state), 'missing world or session');
  assert(Number.isInteger(raw.width) && Number.isInteger(raw.height)
    && raw.width >= 8 && raw.height >= 8 && raw.width <= 2048 && raw.height <= 2048
    && raw.width * raw.height <= MAX_CELLS && finite(raw.cellSize, 1, 32), 'world dimensions');
  const count = raw.width * raw.height;
  assert(numericArray(raw.solid, count, 0, 1, true), 'solid cells');
  assert(numericArray(raw.material, count, 0, 2, true), 'terrain materials');
  assert(numericArray(raw.damage, count, 0, 3), 'terrain damage');
  assert(numericArray(raw.water, count, 0, 1.000001), 'liquid cells');
  assert(numericArray(state.explored, count, 0, 1, true), 'exploration');
  for (let index = 0; index < count; index++) {
    const x = index % raw.width, y = Math.floor(index / raw.width);
    const boundary = x === 0 || y === 0 || x === raw.width - 1 || y === raw.height - 1;
    assert(!boundary || raw.solid[index] === 1, 'unsealed boundary');
    assert(Boolean(raw.material[index]) === Boolean(raw.solid[index]), 'material does not match terrain');
    assert(!raw.solid[index] || raw.water[index] === 0, 'water inside terrain');
    assert(raw.solid[index] || raw.damage[index] === 0, 'damage in empty space');
    assert(raw.damage[index] < (raw.material[index] === 2 ? 3 : 1), 'broken terrain left solid');
  }
  const extentX = raw.width * raw.cellSize, extentY = raw.height * raw.cellSize;
  let fallingDirt = state.fallingDirt === undefined ? [] : state.fallingDirt;
  assert(Array.isArray(fallingDirt) && fallingDirt.length <= count
    && fallingDirt.every(particle => record(particle)
      && finite(particle.x, 0, extentX - raw.cellSize)
      && finite(particle.y, 0, extentY - raw.cellSize)
      && finite(particle.vy, 0, DIRT_TERMINAL_SPEED)), 'falling dirt');
  assert(Number.isInteger(state.seed) && finite(state.seed, 0, 0xffffffff), 'seed');
  assert(record(state.options) && state.options.seed === state.seed
    && ['remembered', 'sonar'].includes(state.options.caveMemory)
    && ['character', 'mouse'].includes(state.options.headlamp)
    && typeof state.options.debugVision === 'boolean', 'comparison options');
  const stepHeightCells = state.options.stepHeightCells === undefined ? DEFAULT_STEP_HEIGHT_CELLS : state.options.stepHeightCells;
  assert(stepHeightCells === 1 || stepHeightCells === 2, 'comparison options');
  // Keep earlier v1 worlds and exploration intact, while normalizing retired
  // cave-memory/headlamp comparisons and missing water-preset metadata. An old
  // site's explicit distribution remains metadata for its serialized layout;
  // loading must never regenerate that world using the new depth formula.
  const waterDistribution = state.options.waterDistribution === undefined ? 'fewer-large' : state.options.waterDistribution;
  assert(waterDistribution === 'depth-weighted' || waterDistribution === 'many-small'
    || waterDistribution === 'fewer-large', 'comparison options');
  assert(finite(state.surfaceY, 0, extentY) && point(state.hopper, extentX, extentY), 'surface or machine');
  assert(finite(state.time) && finite(state.initialWater) && finite(state.delivered, 0, DEMO_DELIVERY_LIMIT), 'progress ledger');
  const devCreditAdjustment = state.devCreditAdjustment === undefined ? 0 : state.devCreditAdjustment;
  assert(finite(devCreditAdjustment, -Number.MAX_SAFE_INTEGER), 'credit adjustment');
  assert(typeof state.completed === 'boolean' && state.completed === (state.delivered >= DEMO_DELIVERY_LIMIT), 'demo end state');
  assert(typeof state.unloading === 'boolean' && !(state.completed && state.unloading), 'unloading state');
  assert(state.facing === -1 || state.facing === 1, 'facing');
  assert(finite(state.digCooldown, 0, DIG_INTERVAL) && (state.strikeTime === -1 || finite(state.strikeTime, 0, DIG_WINDUP)), 'pick timing');
  assert(state.lastStrike === null || (record(state.lastStrike)
    && point(state.lastStrike.center, extentX, extentY)
    && Number.isInteger(state.lastStrike.damaged) && finite(state.lastStrike.damaged, 0, count)
    && Number.isInteger(state.lastStrike.removed) && finite(state.lastStrike.removed, 0, count)
    && finite(state.lastStrike.time, 0, state.time)), 'last strike');
  assert(finite(state.lastSonarAt, -15, state.time), 'sonar cooldown');
  assert(state.sonar === null || (record(state.sonar) && point(state.sonar.origin, extentX, extentY)
    && finite(state.sonar.startedAt, 0, state.time) && finite(state.sonar.maxRadius, 1, 100000)), 'sonar pulse');
  const subsurfaceScan = state.subsurfaceScan === undefined ? null : state.subsurfaceScan;
  const lastSubsurfaceScanAt = state.lastSubsurfaceScanAt === undefined ? -15 : state.lastSubsurfaceScanAt;
  assert(finite(lastSubsurfaceScanAt, -15, state.time), 'scanner cooldown');
  assert(subsurfaceScan === null || (record(subsurfaceScan) && point(subsurfaceScan.origin, extentX, extentY)
    && finite(subsurfaceScan.startedAt, 0, state.time) && finite(subsurfaceScan.maxRadius, 1, 100000)), 'scanner pulse');
  const tank = state.tank;
  assert(record(tank) && record(tank.upgrades) && finite(tank.water) && finite(tank.credits)
    && typeof tank.upgraded === 'boolean', 'tank');
  const upgradeIds = new Set(UPGRADE_DEFINITIONS.map(definition => definition.id));
  assert(Object.keys(tank.upgrades).every(id => upgradeIds.has(id as keyof Tank['upgrades'])), 'upgrade entries');
  // Only the newly reserved scanner may be absent from earlier v1 equipment.
  if (tank.upgrades.subsurfaceScanner === undefined) tank.upgrades.subsurfaceScanner = 0;
  assert(Object.keys(tank.upgrades).length === UPGRADE_DEFINITIONS.length, 'upgrade entries');
  for (const definition of UPGRADE_DEFINITIONS) {
    const level = tank.upgrades[definition.id];
    assert(Number.isInteger(level) && finite(level, 0, definition.costs.length), 'upgrade level');
    assert(!level || !definition.requires || tank.upgrades[definition.requires] > 0, 'upgrade prerequisite');
  }
  assert(tank.capacity === upgradeStats(tank as Tank).capacity && tank.water <= tank.capacity
    && tank.upgraded === (tank.upgrades.capacity > 0), 'tank capacity');
  // Equipment purchases and development balance changes never alter the water ledger.
  assert(tank.credits <= state.delivered + devCreditAdjustment + 0.00001, 'unearned credits');
  const player = state.player;
  assert(record(player) && player.width === 16 && player.height === 32
    && finite(player.x, 0, extentX - player.width) && finite(player.y, 0, extentY - player.height)
    && finite(player.vx, -10000, 10000) && finite(player.vy, -10000, 10000)
    && typeof player.grounded === 'boolean' && [-1, 0, 1].includes(player.wall)
    && [-1, 0, 1].includes(player.suppressedWall) && finite(player.wallJumpTime, 0, 0.12), 'player state');
  for (let y = Math.floor(player.y / raw.cellSize); y <= Math.floor((player.y + player.height - 0.001) / raw.cellSize); y++) {
    for (let x = Math.floor(player.x / raw.cellSize); x <= Math.floor((player.x + player.width - 0.001) / raw.cellSize); x++) {
      assert(raw.solid[y * raw.width + x] === 0, 'player inside terrain');
    }
  }
  const world = new World(raw.width, raw.height, raw.cellSize);
  world.solid.set(raw.solid);
  world.material.set(raw.material);
  world.damage.set(raw.damage);
  world.water.set(raw.water);
  world.terrainVersion = 1;
  const accounted = totalWater(world) + tank.water + state.delivered;
  assert(Math.abs(accounted - state.initialWater) <= 0.05 + state.initialWater * 0.0001, 'water ledger mismatch');
  // Existing active v1 runs may contain old floating obstacles. Migrate once;
  // completed runs retain their frozen terrain and new saves keep their debris.
  if (state.fallingDirt === undefined && !state.completed) fallingDirt = detachSmallDirt(world);
  return { ...state, world, fallingDirt, devCreditAdjustment, subsurfaceScan, lastSubsurfaceScanAt,
    options: { ...state.options, stepHeightCells, waterDistribution, caveMemory: 'sonar', headlamp: 'mouse' },
    explored: Uint8Array.from(state.explored) } as Session;
}
