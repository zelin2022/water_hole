import type { Point, World } from './world';
import { collectWater } from './water';
import { BASE_CLIMB_SPEED, BASE_JUMP_GRAVITY, BASE_JUMP_SPEED, FALL_GRAVITY } from './player';
import { HEADLAMP_HALF_ANGLE, HEADLAMP_RANGE, TERRAIN_REVEAL_CELLS, TORSO_LIGHT_RADIUS } from './vision';

export type UpgradeId = 'digRadius' | 'digDamage' | 'digSpeed' | 'jumpPower' | 'doubleJump' | 'climbSpeed' | 'capacity' | 'detector' | 'detectorRange' | 'wallDig' | 'torsoLamp' | 'headlampWidth' | 'headlampDepth' | 'sonar' | 'subsurfaceScanner';
export type UpgradeAvailability = 'unavailable' | 'unaffordable' | 'available';
export interface UpgradeDefinition {
  id: UpgradeId;
  name: string;
  description: string;
  costs: number[];
  requires?: UpgradeId;
  /** Reserved equipment is retained in saves but not offered for purchase. */
  hidden?: boolean;
}
export const UPGRADE_DEFINITIONS: UpgradeDefinition[] = [
  { id: 'digRadius', name: 'Wider pick', description: 'Increase the radius of each impact.', costs: [15, 20, 30, 45, 65, 90, 125] },
  { id: 'digDamage', name: 'Reinforced pick', description: 'Break harder terrain in fewer strikes.', costs: [30, 55, 95] },
  { id: 'digSpeed', name: 'Rapid pick', description: 'Swing the pick faster, with a shorter wind-up.', costs: [30, 55, 95] },
  { id: 'jumpPower', name: 'Powered boots', description: 'Jump higher and launch upward faster.', costs: [15, 20, 30, 45, 65, 90, 125] },
  { id: 'doubleJump', name: 'Air jump', description: 'Jump once more in midair; landing or a wall grip recharges it.', costs: [100] },
  { id: 'climbSpeed', name: 'Climbing assist', description: 'Climb walls faster.', costs: [15, 20, 30, 45, 65, 90, 125] },
  { id: 'capacity', name: 'Larger tank', description: 'Add 20 water capacity and unload faster at the hopper.', costs: [10, 15, 20, 25, 35, 45, 60, 80, 110] },
  { id: 'detector', name: 'Water detector', description: 'Point toward nearby water within 160 units.', costs: [60] },
  { id: 'detectorRange', name: 'Detector amplifier', description: 'Increase the water detection radius.', costs: [45, 90], requires: 'detector' },
  { id: 'wallDig', name: 'Wall work harness', description: 'Use the pick while attached to a wall.', costs: [80] },
  { id: 'torsoLamp', name: 'Torso lamp', description: 'Increase surrounding light and the shallow terrain reveal by 20% per level.', costs: [35, 70] },
  { id: 'headlampWidth', name: 'Wider headlamp', description: 'Widen the headlamp cone by 20% per level.', costs: [35, 70] },
  { id: 'headlampDepth', name: 'Deeper headlamp', description: 'Extend the headlamp beam depth by 20% per level.', costs: [35, 70] },
  { id: 'sonar', name: 'Cave sonar', description: 'Trace connected tunnel outlines; terrain blocks the pulse.', costs: [90] },
  { id: 'subsurfaceScanner', name: 'Subsurface scanner', description: 'Penetrate terrain to trace sealed cavities and water pockets.', costs: [30], hidden: true },
];
export const UPGRADE_REVEAL_ORDER = [
  'digRadius', 'digDamage', 'detector', 'climbSpeed', 'capacity', 'jumpPower', 'digSpeed',
  'sonar', 'wallDig', 'doubleJump', 'headlampDepth', 'torsoLamp', 'detectorRange', 'headlampWidth',
] as const satisfies readonly UpgradeId[];

export interface Tank {
  capacity: number;
  water: number;
  credits: number;
  /** Retained as a convenience for the initial prototype HUD. */
  upgraded: boolean;
  upgrades: Record<UpgradeId, number>;
}
export const UPGRADE_COST = 10;
export const BASE_UNLOAD_RATE = 25;
export const CREDIT_EPSILON = 1e-8;
export const JUMP_SPEEDS = [BASE_JUMP_SPEED, 350, 440, 540, 650, 780, 920, 1080] as const;
export const CLIMB_SPEEDS = [BASE_CLIMB_SPEED, 135, 200, 280, 350, 440, 550, 680] as const;

export function createTank(capacity = 20): Tank {
  const upgrades = Object.fromEntries(UPGRADE_DEFINITIONS.map(definition => [definition.id, 0])) as Record<UpgradeId, number>;
  return { capacity, water: 0, credits: 0, upgraded: false, upgrades };
}

export function upgradeStats(tank: Tank) {
  const digInterval = [0.48, 0.34, 0.24, 0.16][tank.upgrades.digSpeed];
  const capacity = 20 + 20 * tank.upgrades.capacity;
  // A larger tank unloads faster, but a full 200-unit tank still takes twice
  // as long as the starter tank. Collection speed is independent of equipment.
  const fullUnloadTime = (20 / BASE_UNLOAD_RATE) * (1 + tank.upgrades.capacity / 9);
  return {
    digRadius: [12, 16, 20, 26, 34, 44, 58, 76][tank.upgrades.digRadius],
    digDamage: [1, 2, 3, 6][tank.upgrades.digDamage],
    digInterval,
    digWindup: digInterval / 4,
    jumpSpeed: JUMP_SPEEDS[tank.upgrades.jumpPower],
    jumpGravity: tank.upgrades.jumpPower === 0 ? BASE_JUMP_GRAVITY : FALL_GRAVITY,
    // Wall-origin jumps are a quicker technique than early climbing gear, but
    // their best repeatable two-jump ascent stays below matched climbing gear.
    wallJumpSpeed: Math.min(JUMP_SPEEDS[tank.upgrades.jumpPower], 1.6 * CLIMB_SPEEDS[tank.upgrades.jumpPower]),
    doubleJump: tank.upgrades.doubleJump > 0,
    climbSpeed: CLIMB_SPEEDS[tank.upgrades.climbSpeed],
    capacity,
    unloadRate: capacity / fullUnloadTime,
    detectorRadius: tank.upgrades.detector ? [160, 240, 320][tank.upgrades.detectorRange] : 0,
    torsoRadius: TORSO_LIGHT_RADIUS * 1.2 ** tank.upgrades.torsoLamp,
    terrainRevealCells: TERRAIN_REVEAL_CELLS * 1.2 ** tank.upgrades.torsoLamp,
    headlampHalfAngle: HEADLAMP_HALF_ANGLE * 1.2 ** tank.upgrades.headlampWidth,
    headlampRange: HEADLAMP_RANGE * 1.2 ** tank.upgrades.headlampDepth,
  };
}

/** Every purchased level of visible equipment contributes one reveal. */
export function purchasedUpgradeCount(tank: Tank): number {
  return UPGRADE_DEFINITIONS.reduce((count, definition) =>
    count + (definition.hidden ? 0 : (tank.upgrades[definition.id] ?? 0)), 0);
}

/** Retain owned legacy tracks, including completed ones, without changing their equipment. */
export function revealedUpgradeIds(tank: Tank): UpgradeId[] {
  const eligible = UPGRADE_REVEAL_ORDER.filter(id => {
    const definition = UPGRADE_DEFINITIONS.find(item => item.id === id)!;
    return !definition.hidden && (!definition.requires || tank.upgrades[definition.requires] > 0);
  });
  const revealed = new Set<UpgradeId>(eligible.slice(0, 1 + purchasedUpgradeCount(tank)));
  return UPGRADE_REVEAL_ORDER.filter(id => revealed.has(id) || tank.upgrades[id] > 0);
}

export function isUpgradeRevealed(tank: Tank, id: UpgradeId): boolean {
  return revealedUpgradeIds(tank).includes(id);
}

/** Progression, prerequisites, and remaining levels are checked before the current balance. */
export function upgradeAvailability(tank: Tank, id: UpgradeId): UpgradeAvailability {
  const definition = UPGRADE_DEFINITIONS.find(item => item.id === id);
  if (!definition || definition.hidden || !isUpgradeRevealed(tank, id)
    || (definition.requires && !tank.upgrades[definition.requires])) return 'unavailable';
  const cost = definition.costs[tank.upgrades[id]];
  if (cost === undefined) return 'unavailable';
  return Number.isFinite(tank.credits) && tank.credits + CREDIT_EPSILON >= cost ? 'available' : 'unaffordable';
}

export function canBuyUpgrade(tank: Tank, id: UpgradeId): boolean {
  return upgradeAvailability(tank, id) === 'available';
}

export function buyUpgrade(tank: Tank, id: UpgradeId): boolean {
  if (!canBuyUpgrade(tank, id)) return false;
  const definition = UPGRADE_DEFINITIONS.find(item => item.id === id)!;
  const cost = definition.costs[tank.upgrades[id]];
  tank.credits = Math.max(0, tank.credits - cost);
  tank.upgrades[id]++;
  if (id === 'capacity') {
    tank.capacity = upgradeStats(tank).capacity;
    tank.upgraded = true;
  }
  return true;
}

export function collectIntoTank(world: World, tank: Tank, position: Point, radius: number, maxAmount: number): number {
  if (!Number.isFinite(maxAmount) || maxAmount <= 0) return 0;
  const amount = collectWater(world, position, radius, Math.max(0, Math.min(maxAmount, tank.capacity - tank.water)));
  tank.water += amount;
  return amount;
}

/** One bounded portion of unloading; the session owns transfer timing. */
export function depositAtHopper(tank: Tank, position: Point, hopper: Point, range: number, maxAmount = tank.water): number {
  if (![position.x, position.y, hopper.x, hopper.y, range, maxAmount].every(Number.isFinite)
    || range < 0 || maxAmount <= 0 || Math.hypot(position.x - hopper.x, position.y - hopper.y) > range) return 0;
  const delivered = Math.max(0, Math.min(tank.water, maxAmount));
  tank.water -= delivered;
  tank.credits += delivered;
  return delivered;
}

export function buyCapacityUpgrade(tank: Tank): boolean {
  return buyUpgrade(tank, 'capacity');
}
