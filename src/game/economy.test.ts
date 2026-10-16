import { describe, expect, it } from 'vitest';
import { World } from './world';
import { totalWater } from './water';
import { buyUpgrade, canBuyUpgrade, collectIntoTank, createTank, CREDIT_EPSILON, depositAtHopper, UPGRADE_DEFINITIONS, upgradeAvailability, upgradeStats, type UpgradeId } from './economy';

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
  it('retains the subsurface scanner as hidden equipment without allowing purchases', () => {
    const tank = createTank(); tank.credits = 500;
    const scanner = 'subsurfaceScanner' as UpgradeId;
    expect(UPGRADE_DEFINITIONS.find(definition => definition.id === scanner)).toMatchObject({
      name: 'Subsurface scanner', hidden: true,
    });
    expect(tank.upgrades[scanner]).toBe(0);
    const balance = { water: tank.water, credits: tank.credits };
    expect(upgradeAvailability(tank, scanner)).toBe('unavailable');
    expect(canBuyUpgrade(tank, scanner)).toBe(false);
    expect(buyUpgrade(tank, scanner)).toBe(false);
    expect(tank.upgrades[scanner]).toBe(0);
    expect(tank).toMatchObject(balance);
    expect(upgradeAvailability(tank, 'sonar')).toBe('available');
  });

  it('hides prerequisite-gated and fully installed upgrades regardless of funding', () => {
    const tank = createTank(); tank.credits = 500;
    expect(upgradeAvailability(tank, 'detectorRange')).toBe('unavailable');
    expect(upgradeAvailability(tank, 'unknown' as UpgradeId)).toBe('unavailable');
    expect(buyUpgrade(tank, 'detector')).toBe(true);
    expect(upgradeAvailability(tank, 'detector')).toBe('unavailable');
    expect(upgradeAvailability(tank, 'detectorRange')).toBe('available');
    buyUpgrade(tank, 'detectorRange'); buyUpgrade(tank, 'detectorRange');
    expect(upgradeAvailability(tank, 'detectorRange')).toBe('unavailable');
  });

  it('keeps an unlocked upgrade visible when funds are insufficient and reevaluates each level', () => {
    const tank = createTank();
    expect(upgradeAvailability(tank, 'digRadius')).toBe('unaffordable');
    expect(canBuyUpgrade(tank, 'digRadius')).toBe(false);
    tank.credits = 10;
    expect(upgradeAvailability(tank, 'digRadius')).toBe('available');
    expect(canBuyUpgrade(tank, 'digRadius')).toBe(true);
    expect(buyUpgrade(tank, 'digRadius')).toBe(true);
    expect(upgradeAvailability(tank, 'digRadius')).toBe('unaffordable');
    tank.credits = 15;
    expect(upgradeAvailability(tank, 'digRadius')).toBe('available');
    buyUpgrade(tank, 'digRadius');
    expect(upgradeAvailability(tank, 'digRadius')).toBe('unaffordable');
  });

  it('uses the same finite-balance and roundoff tolerance for shop funding and purchases', () => {
    const tank = createTank();
    tank.credits = 10 - CREDIT_EPSILON / 2;
    expect(upgradeAvailability(tank, 'digRadius')).toBe('available');
    expect(buyUpgrade(tank, 'digRadius')).toBe(true);
    expect(tank.credits).toBe(0);
    tank.credits = 15 - CREDIT_EPSILON * 2;
    expect(upgradeAvailability(tank, 'digRadius')).toBe('unaffordable');
    expect(canBuyUpgrade(tank, 'digRadius')).toBe(false);
    for (const credits of [NaN, Infinity, -Infinity]) {
      tank.credits = credits;
      expect(upgradeAvailability(tank, 'digRadius')).toBe('unaffordable');
      expect(buyUpgrade(tank, 'digRadius')).toBe(false);
    }
  });

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

  it('offers seven radius, three damage and three speed purchases without changing water or overcharging capped equipment', () => {
    const tank = createTank(); tank.water = 12; tank.credits = 1000;
    const progression = [
      ['digRadius', 'digRadius', [12, 16, 20, 26, 34, 44, 58, 76]],
      ['digDamage', 'digDamage', [1, 2, 3, 6]],
      ['digSpeed', 'digInterval', [0.48, 0.34, 0.24, 0.16]],
    ] as const;
    for (const [id, stat, values] of progression) {
      expect(upgradeStats(tank)[stat]).toBe(values[0]);
      for (const value of values.slice(1)) {
        expect(buyUpgrade(tank, id)).toBe(true);
        expect(upgradeStats(tank)[stat]).toBe(value);
      }
      const credits = tank.credits;
      expect(buyUpgrade(tank, id)).toBe(false);
      expect(upgradeAvailability(tank, id)).toBe('unavailable');
      expect(tank.credits).toBe(credits);
    }
    expect(tank.water).toBe(12);
    expect(tank.capacity).toBe(20);
    expect(tank.credits).toBe(715);
    expect(upgradeStats(tank).digWindup).toBe(0.04);
  });

  it('makes the full mining showcase, first capacity upgrade and harness attainable before the 400-water demo wall', () => {
    const tank = createTank(); tank.credits = 399;
    for (const id of ['digRadius', 'digDamage', 'digSpeed', 'capacity', 'wallDig'] as const) {
      const levels = id === 'capacity' ? 1 : UPGRADE_DEFINITIONS.find(definition => definition.id === id)!.costs.length;
      for (let level = 0; level < levels; level++) expect(buyUpgrade(tank, id)).toBe(true);
    }
    expect(tank.upgrades).toMatchObject({ digRadius: 7, digDamage: 3, digSpeed: 3, capacity: 1, wallDig: 1 });
    expect(tank.credits).toBe(14);
  });
});
