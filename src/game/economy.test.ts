import { describe, expect, it } from 'vitest';
import { World } from './world';
import { totalWater } from './water';
import {
  buyCapacityUpgrade,
  collectIntoTank,
  createTank,
  depositAtHopper,
  UPGRADE_COST,
} from './economy';

describe('tank and water sales', () => {
  it('starts empty, with capacity 20 and zero credits', () => {
    expect(createTank()).toEqual({ capacity: 20, water: 0, credits: 0, upgraded: false });
  });

  it('limits suction to remaining tank capacity and preserves world-plus-tank water', () => {
    const world = new World(12, 12);
    world.water[world.index(4, 4)] = 1;
    world.water[world.index(5, 4)] = 1;
    const tank = createTank(1.5);
    tank.water = 1;
    const initial = totalWater(world) + tank.water;

    expect(collectIntoTank(world, tank, { x: 18, y: 18 }, 10, 3)).toBeCloseTo(0.5, 5);
    expect(tank.water).toBe(1.5);
    expect(totalWater(world) + tank.water).toBeCloseTo(initial, 5);
    expect(collectIntoTank(world, tank, { x: 18, y: 18 }, 10, 3)).toBe(0);
    expect(totalWater(world) + tank.water).toBeCloseTo(initial, 5);
  });

  it('only releases water near the hopper and credits each delivered unit exactly once', () => {
    const tank = createTank();
    tank.water = 12.5;
    const hopper = { x: 40, y: 40 };

    expect(depositAtHopper(tank, { x: 80, y: 40 }, hopper, 20)).toBe(0);
    expect(tank.water).toBe(12.5);
    expect(tank.credits).toBe(0);

    expect(depositAtHopper(tank, { x: 52, y: 56 }, hopper, 20)).toBe(12.5);
    expect(tank.water).toBe(0);
    expect(tank.credits).toBe(12.5);
    expect(depositAtHopper(tank, { x: 40, y: 40 }, hopper, 20)).toBe(0);
    expect(tank.credits).toBe(12.5);
  });

  it('conserves water across repeated collection and delivery using a delivered-water ledger', () => {
    const world = new World(10, 10);
    for (let x = 2; x <= 6; x += 1) world.water[world.index(x, 3)] = 0.8;
    const initial = totalWater(world);
    const tank = createTank(1);
    const hopper = { x: 14, y: 14 };
    let delivered = 0;

    for (let trip = 0; trip < 6; trip += 1) {
      collectIntoTank(world, tank, hopper, 20, 5);
      delivered += depositAtHopper(tank, hopper, hopper, 10);
      expect(totalWater(world) + tank.water + delivered).toBeCloseTo(initial, 5);
    }
    expect(delivered).toBeCloseTo(initial, 5);
    expect(tank.credits).toBeCloseTo(initial, 5);
  });
});

describe('capacity upgrade', () => {
  it('requires 60 credits, upgrades to capacity 40 once, and preserves carried water', () => {
    const tank = createTank();
    tank.water = 10;
    tank.credits = UPGRADE_COST - 1;
    expect(UPGRADE_COST).toBe(60);
    expect(buyCapacityUpgrade(tank)).toBe(false);
    expect(tank.capacity).toBe(20);
    expect(tank.credits).toBe(59);

    tank.credits = UPGRADE_COST + 5;
    expect(buyCapacityUpgrade(tank)).toBe(true);
    expect(tank.capacity).toBe(40);
    expect(tank.water).toBe(10);
    expect(tank.credits).toBe(5);
    expect(tank.upgraded).toBe(true);

    tank.credits = 100;
    expect(buyCapacityUpgrade(tank)).toBe(false);
    expect(tank.capacity).toBe(40);
    expect(tank.credits).toBe(100);
  });
});
