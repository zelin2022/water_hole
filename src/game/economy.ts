import type { Point, World } from './world';
import { collectWater } from './water';

export interface Tank {
  capacity: number;
  water: number;
  credits: number;
  upgraded: boolean;
}

export const UPGRADE_COST = 60;

export function createTank(capacity = 20): Tank {
  return { capacity, water: 0, credits: 0, upgraded: false };
}

export function collectIntoTank(world: World, tank: Tank, position: Point, radius: number, maxAmount: number): number {
  const amount = collectWater(world, position, radius, Math.min(maxAmount, tank.capacity - tank.water));
  tank.water += amount;
  return amount;
}

export function depositAtHopper(tank: Tank, position: Point, hopper: Point, range: number): number {
  if (![position.x, position.y, hopper.x, hopper.y, range].every(Number.isFinite)
    || range < 0 || Math.hypot(position.x - hopper.x, position.y - hopper.y) > range) return 0;
  const delivered = tank.water;
  tank.water = 0;
  tank.credits += delivered;
  return delivered;
}

export function buyCapacityUpgrade(tank: Tank): boolean {
  if (tank.upgraded || tank.credits < UPGRADE_COST) return false;
  tank.credits -= UPGRADE_COST;
  tank.capacity = 40;
  tank.upgraded = true;
  return true;
}
