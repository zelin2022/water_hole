import { describe, expect, it } from 'vitest';
import { World } from './world';
import { totalWater } from './water';
import { buyUpgrade, collectIntoTank, createTank, depositAtHopper, upgradeStats } from './economy';

describe('tank and incremental sales', () => {
  it('starts empty with no equipment upgrades', () => {
    const tank = createTank();
    expect(tank).toMatchObject({ capacity: 20, water: 0, credits: 0 });
    expect(Object.values(tank.upgrades).every(level => level === 0)).toBe(true);
  });

  it('limits collection to tank space and conserves the water ledger', () => {
    const world = new World(12, 12);
    world.water[world.index(4, 4)] = 1;
    world.water[world.index(5, 4)] = 1;
    const tank = createTank(1.5);
    tank.water = 1;
    const initial = totalWater(world) + tank.water;
    expect(collectIntoTank(world, tank, { x: 18, y: 18 }, 10, 3)).toBeCloseTo(0.5, 5);
    expect(totalWater(world) + tank.water).toBeCloseTo(initial, 5);
    expect(collectIntoTank(world, tank, { x: 18, y: 18 }, 10, 3)).toBe(0);
  });

  it('credits only each portion transferred near the machine', () => {
    const tank = createTank();
    tank.water = 12.5;
    const hopper = { x: 40, y: 40 };
    expect(depositAtHopper(tank, { x: 80, y: 40 }, hopper, 20, 3)).toBe(0);
    expect(depositAtHopper(tank, { x: 40, y: 40 }, hopper, 20, 3)).toBe(3);
    expect(tank.water).toBe(9.5);
    expect(tank.credits).toBe(3);
    expect(depositAtHopper(tank, hopper, hopper, 20, 50)).toBe(9.5);
    expect(depositAtHopper(tank, hopper, hopper, 20, 50)).toBe(0);
    expect(tank.credits).toBe(12.5);
  });

  it('rejects invalid transfer amounts without changing either balance', () => {
    const tank = createTank(); tank.water = 10;
    for (const amount of [NaN, -1, Infinity]) {
      expect(depositAtHopper(tank, {x:0,y:0}, {x:0,y:0}, 10, amount)).toBe(0);
    }
    expect(tank.water).toBe(10); expect(tank.credits).toBe(0);
  });
});

describe('equipment purchases', () => {
  it('charges each level once, caps progression, and preserves carried water', () => {
    const tank = createTank(); tank.water = 10; tank.credits = 59;
    expect(buyUpgrade(tank, 'capacity')).toBe(false);
    tank.credits = 200;
    expect(buyUpgrade(tank, 'capacity')).toBe(true);
    expect(tank.capacity).toBe(40);
    expect(tank.credits).toBe(140);
    expect(buyUpgrade(tank, 'capacity')).toBe(true);
    expect(tank.capacity).toBe(60);
    expect(tank.credits).toBe(20);
    expect(buyUpgrade(tank, 'capacity')).toBe(false);
    expect(tank.water).toBe(10);
  });

  it('requires the detector before range purchases and grants one-time equipment once', () => {
    const tank = createTank(); tank.credits = 500;
    expect(buyUpgrade(tank, 'detectorRange')).toBe(false);
    expect(upgradeStats(tank).detectorRadius).toBe(0);
    expect(buyUpgrade(tank, 'detector')).toBe(true);
    expect(upgradeStats(tank).detectorRadius).toBe(160);
    expect(buyUpgrade(tank, 'detector')).toBe(false);
    expect(buyUpgrade(tank, 'detectorRange')).toBe(true);
    expect(upgradeStats(tank).detectorRadius).toBe(240);
    expect(buyUpgrade(tank, 'wallDig')).toBe(true);
    expect(buyUpgrade(tank, 'wallDig')).toBe(false);
  });

  it('changes radius, damage and climbing independently', () => {
    const tank = createTank(); tank.credits = 500;
    buyUpgrade(tank, 'digRadius'); buyUpgrade(tank, 'digDamage'); buyUpgrade(tank, 'climbSpeed');
    expect(upgradeStats(tank)).toMatchObject({ digRadius: 16, digDamage: 2, climbSpeed: 90, capacity: 20 });
  });
});
