import type { Point, World } from './world';
import { collectWater } from './water';

export type UpgradeId = 'digRadius' | 'digDamage' | 'climbSpeed' | 'capacity' | 'detector' | 'detectorRange' | 'wallDig' | 'sonar' | 'subsurfaceScanner';
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
  { id: 'digRadius', name: 'Wider pick', description: 'Increase the radius of each impact.', costs: [40, 100] },
  { id: 'digDamage', name: 'Reinforced pick', description: 'Break harder terrain in fewer strikes.', costs: [35, 85] },
  { id: 'climbSpeed', name: 'Climbing assist', description: 'Climb walls faster.', costs: [35, 80] },
  { id: 'capacity', name: 'Larger tank', description: 'Carry more water on each trip.', costs: [60, 120] },
  { id: 'detector', name: 'Water detector', description: 'Point toward nearby water within 160 units.', costs: [25] },
  { id: 'detectorRange', name: 'Detector amplifier', description: 'Increase the water detection radius.', costs: [45, 95], requires: 'detector' },
  { id: 'wallDig', name: 'Wall work harness', description: 'Use the pick while attached to a wall.', costs: [40] },
  { id: 'sonar', name: 'Cave sonar', description: 'Trace connected tunnel outlines; terrain blocks the pulse.', costs: [30] },
  { id: 'subsurfaceScanner', name: 'Subsurface scanner', description: 'Penetrate terrain to trace sealed cavities and water pockets.', costs: [30], hidden: true },
];

export interface Tank {
  capacity: number;
  water: number;
  credits: number;
  /** Retained as a convenience for the initial prototype HUD. */
  upgraded: boolean;
  upgrades: Record<UpgradeId, number>;
}
export const UPGRADE_COST = 60;
export const CREDIT_EPSILON = 1e-8;

export function createTank(capacity = 20): Tank {
  const upgrades = Object.fromEntries(UPGRADE_DEFINITIONS.map(definition => [definition.id, 0])) as Record<UpgradeId, number>;
  return { capacity, water: 0, credits: 0, upgraded: false, upgrades };
}

export function upgradeStats(tank: Tank) {
  return {
    digRadius: [12, 16, 20][tank.upgrades.digRadius],
    digDamage: [1, 2, 3][tank.upgrades.digDamage],
    climbSpeed: [65, 90, 120][tank.upgrades.climbSpeed],
    capacity: [20, 40, 60][tank.upgrades.capacity],
    detectorRadius: tank.upgrades.detector ? [160, 240, 320][tank.upgrades.detectorRange] : 0,
  };
}

/** Visibility is determined by progression before the current balance is considered. */
export function upgradeAvailability(tank: Tank, id: UpgradeId): UpgradeAvailability {
  const definition = UPGRADE_DEFINITIONS.find(item => item.id === id);
  if (!definition || definition.hidden || (definition.requires && !tank.upgrades[definition.requires])) return 'unavailable';
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
