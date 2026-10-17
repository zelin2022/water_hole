import { describe, expect, it } from 'vitest';
import { World } from './world';
import { totalWater } from './water';
import { BASE_UNLOAD_RATE, buyUpgrade, canBuyUpgrade, collectIntoTank, createTank, CREDIT_EPSILON, depositAtHopper, UPGRADE_DEFINITIONS, UPGRADE_REVEAL_ORDER, upgradeAvailability, upgradeStats, type UpgradeId } from './economy';

/** Earlier purchases reveal the shop; exclude the equipment being exercised here. */
function progressedTank(excluded: UpgradeId[] = []) {
  const tank = createTank();
  let remaining = UPGRADE_REVEAL_ORDER.length - 1;
  for (const definition of UPGRADE_DEFINITIONS) {
    if (definition.hidden || definition.requires || definition.id === 'capacity' || excluded.includes(definition.id)) continue;
    const level = Math.min(remaining, definition.costs.length);
    tank.upgrades[definition.id] = level;
    remaining -= level;
    if (!remaining) break;
  }
  expect(remaining).toBe(0);
  return tank;
}

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
  it.each([
    ['wallDig', 40, 80], ['doubleJump', 35, 100], ['sonar', 30, 90], ['detector', 25, 60],
  ] as const)('requires earning the premium price for %s and charges it exactly once', (id, previousPrice, price) => {
    const tank = progressedTank([id]);
    const fund = (amount: number) => {
      while (amount > 0) {
        const portion = Math.min(amount, tank.capacity);
        tank.water = portion;
        expect(depositAtHopper(tank, { x: 0, y: 0 }, { x: 0, y: 0 }, 1)).toBe(portion);
        amount -= portion;
      }
    };
    fund(previousPrice);
    expect(upgradeAvailability(tank, id)).toBe('unaffordable');
    expect(buyUpgrade(tank, id)).toBe(false);
    expect(tank.credits).toBe(previousPrice);
    expect(tank.upgrades[id]).toBe(0);
    fund(price - previousPrice);
    expect(buyUpgrade(tank, id)).toBe(true);
    expect(tank.credits).toBe(0);
    expect(tank.water).toBe(0);
    expect(tank.upgrades[id]).toBe(1);
    expect(buyUpgrade(tank, id)).toBe(false);
    expect(tank.credits).toBe(0);
  });

  it('extends the four-cell terrain halo by 20% with each torso lamp purchase only', () => {
    const tank = progressedTank(['torsoLamp', 'headlampWidth', 'headlampDepth']); tank.credits = 1000;
    expect(upgradeStats(tank).terrainRevealCells).toBe(4);
    for (let level = 1; level <= 2; level++) {
      expect(buyUpgrade(tank, 'torsoLamp')).toBe(true);
      expect(upgradeStats(tank).terrainRevealCells).toBeCloseTo(4 * 1.2 ** level, 10);
    }
    const radius = upgradeStats(tank).terrainRevealCells;
    for (const id of ['headlampWidth', 'headlampDepth'] as const) {
      expect(buyUpgrade(tank, id)).toBe(true); expect(buyUpgrade(tank, id)).toBe(true);
    }
    expect(upgradeStats(tank).terrainRevealCells).toBe(radius);
  });
  it('starts with a 30% shorter, 10% narrower headlamp and the original torso light radius', () => {
    const stats = upgradeStats(createTank());
    expect(stats.headlampRange).toBeCloseTo(180 * 0.7, 10);
    expect(stats.headlampHalfAngle).toBeCloseTo(Math.PI / 5 * 0.9, 10);
    expect(stats.torsoRadius).toBe(55);
  });

  it.each([
    ['torsoLamp', 'torsoRadius', 55],
    ['headlampWidth', 'headlampHalfAngle', Math.PI / 5 * 0.9],
    ['headlampDepth', 'headlampRange', 180 * 0.7],
  ] as const)('offers two independent 20 percent increases for %s without changing other equipment or water', (id, stat, base) => {
    const tank = progressedTank([id]); tank.water = 12;
    const initial = upgradeStats(tank);
    const initialEquipment = { ...tank.upgrades };
    expect(tank.upgrades[id]).toBe(0);
    expect(UPGRADE_DEFINITIONS.find(definition => definition.id === id)).toMatchObject({ costs: [35, 70] });
    expect(upgradeAvailability(tank, id)).toBe('unaffordable');
    expect(buyUpgrade(tank, id)).toBe(false);
    tank.credits = 35;
    for (let level = 1; level <= 2; level++) {
      expect(upgradeAvailability(tank, id)).toBe('available');
      expect(buyUpgrade(tank, id)).toBe(true);
      expect(tank.upgrades[id]).toBe(level);
      const stats = upgradeStats(tank);
      expect(stats[stat]).toBeCloseTo(base * 1.2 ** level, 10);
      expect(stats).toEqual({ ...initial, [stat]: stats[stat],
        terrainRevealCells: initial.terrainRevealCells * (id === 'torsoLamp' ? 1.2 ** level : 1) });
      expect(tank.credits).toBe(0);
      expect(tank.water).toBe(12);
      expect(tank.capacity).toBe(20);
      expect(tank.upgraded).toBe(false);
      for (const [otherId, otherLevel] of Object.entries(tank.upgrades)) {
        if (otherId !== id) expect(otherLevel).toBe(initialEquipment[otherId as UpgradeId]);
      }
      if (level === 1) {
        expect(upgradeAvailability(tank, id)).toBe('unaffordable');
        expect(buyUpgrade(tank, id)).toBe(false);
        expect(tank.upgrades[id]).toBe(1);
        tank.credits = 70;
      }
    }
    tank.credits = 100;
    expect(upgradeAvailability(tank, id)).toBe('unavailable');
    expect(buyUpgrade(tank, id)).toBe(false);
    expect(tank.credits).toBe(100);
    expect(tank.upgrades[id]).toBe(2);
  });

  it('retains the subsurface scanner as hidden equipment without allowing purchases', () => {
    const tank = progressedTank(); tank.credits = 500;
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
    const tank = progressedTank(['detector', 'detectorRange']); tank.credits = 500;
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
    tank.credits = 15;
    expect(upgradeAvailability(tank, 'digRadius')).toBe('available');
    expect(canBuyUpgrade(tank, 'digRadius')).toBe(true);
    expect(buyUpgrade(tank, 'digRadius')).toBe(true);
    expect(upgradeAvailability(tank, 'digRadius')).toBe('unaffordable');
    tank.credits = 20;
    expect(upgradeAvailability(tank, 'digRadius')).toBe('available');
    buyUpgrade(tank, 'digRadius');
    expect(upgradeAvailability(tank, 'digRadius')).toBe('unaffordable');
  });

  it('uses the same finite-balance and roundoff tolerance for shop funding and purchases', () => {
    const tank = createTank();
    tank.credits = 15 - CREDIT_EPSILON / 2;
    expect(upgradeAvailability(tank, 'digRadius')).toBe('available');
    expect(buyUpgrade(tank, 'digRadius')).toBe(true);
    expect(tank.credits).toBe(0);
    tank.credits = 20 - CREDIT_EPSILON * 2;
    expect(upgradeAvailability(tank, 'digRadius')).toBe('unaffordable');
    expect(canBuyUpgrade(tank, 'digRadius')).toBe(false);
    for (const credits of [NaN, Infinity, -Infinity]) {
      tank.credits = credits;
      expect(upgradeAvailability(tank, 'digRadius')).toBe('unaffordable');
      expect(buyUpgrade(tank, 'digRadius')).toBe(false);
    }
  });

  it('offers nine twenty-unit capacity purchases, caps at 200, and never changes carried water or other equipment', () => {
    const tank = progressedTank(); tank.water = 10; tank.credits = 9;
    expect(buyUpgrade(tank, 'capacity')).toBe(false);
    expect(UPGRADE_DEFINITIONS.find(definition => definition.id === 'capacity')!.costs)
      .toEqual([10, 15, 20, 25, 35, 45, 60, 80, 110]);
    const initialStats = upgradeStats(tank);
    const initialEquipment = { ...tank.upgrades };
    tank.credits = 400;
    for (let level = 0; level <= 9; level++) {
      if (level > 0) expect(buyUpgrade(tank, 'capacity')).toBe(true);
      expect(tank.capacity).toBe(20 + 20 * level);
      expect(tank.upgrades.capacity).toBe(level);
      const stats = upgradeStats(tank);
      expect(stats.capacity).toBe(tank.capacity);
      expect(stats).toEqual({ ...initialStats, capacity: stats.capacity, unloadRate: stats.unloadRate });
      expect(tank.water).toBe(10);
      expect(tank.upgraded).toBe(level > 0);
      expect(Object.entries(tank.upgrades).every(([id, value]) => id === 'capacity' || value === initialEquipment[id as UpgradeId])).toBe(true);
    }
    expect(tank.credits).toBe(0);
    tank.credits = 100;
    expect(upgradeAvailability(tank, 'capacity')).toBe('unavailable');
    expect(buyUpgrade(tank, 'capacity')).toBe(false);
    expect(tank.capacity).toBe(200);
    expect(tank.credits).toBe(100);
  });

  it('increases unloading speed each level while smoothly doubling full-tank time from 0.8 to 1.6 seconds', () => {
    expect(BASE_UNLOAD_RATE).toBe(25);
    const tank = progressedTank(); tank.credits = 400;
    let previousRate = 0, previousTime = 0;
    for (let level = 0; level <= 9; level++) {
      if (level > 0) expect(buyUpgrade(tank, 'capacity')).toBe(true);
      const stats = upgradeStats(tank);
      const fullTankTime = stats.capacity / stats.unloadRate;
      expect(stats.unloadRate).toBeGreaterThan(previousRate);
      expect(fullTankTime).toBeGreaterThan(previousTime);
      expect(fullTankTime).toBeCloseTo(0.8 * (1 + level / 9), 10);
      previousRate = stats.unloadRate;
      previousTime = fullTankTime;
    }
    expect(previousRate).toBe(125);
    expect(previousTime).toBeCloseTo(1.6, 10);
  });

  it('requires the detector before range purchases and grants one-time equipment once', () => {
    const tank = progressedTank(['detector', 'detectorRange', 'wallDig']); tank.credits = 500;
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
    const tank = progressedTank(['digRadius', 'digDamage', 'climbSpeed']); tank.credits = 500;
    buyUpgrade(tank, 'digRadius'); buyUpgrade(tank, 'digDamage'); buyUpgrade(tank, 'climbSpeed');
    expect(upgradeStats(tank)).toMatchObject({ digRadius: 16, digDamage: 2, climbSpeed: 135, capacity: 20 });
  });

  it('offers seven independent jump and climb purchases plus a one-time double jump', () => {
    const tank = progressedTank(['jumpPower', 'climbSpeed', 'doubleJump', 'digRadius']); tank.credits = 1000; tank.water = 12;
    const initial = upgradeStats(tank);
    expect(initial).toMatchObject({ climbSpeed: 75, wallJumpSpeed: 120, doubleJump: false });
    expect(initial.jumpSpeed).toBeCloseTo(275 * 75 / 130, 8);
    expect(initial.jumpGravity).toBeCloseTo(900 * (75 / 130) ** 2, 8);
    for (const [id, stat] of [['jumpPower', 'jumpSpeed'], ['climbSpeed', 'climbSpeed']] as const) {
      const definition = UPGRADE_DEFINITIONS.find(item => item.id === id)!;
      expect(definition.costs).toHaveLength(7);
      expect(definition.costs.reduce((sum, cost) => sum + cost, 0)).toBeLessThan(400);
      let previous = upgradeStats(tank)[stat];
      for (let level = 1; level <= 7; level++) {
        expect(buyUpgrade(tank, id)).toBe(true);
        expect(tank.upgrades[id]).toBe(level);
        expect(upgradeStats(tank)[stat]).toBeGreaterThan(previous);
        if (id === 'jumpPower') expect(upgradeStats(tank).jumpGravity).toBe(900);
        previous = upgradeStats(tank)[stat];
      }
      expect(buyUpgrade(tank, id)).toBe(false);
    }
    expect(buyUpgrade(tank, 'doubleJump')).toBe(true);
    expect(upgradeStats(tank).doubleJump).toBe(true);
    expect(buyUpgrade(tank, 'doubleJump')).toBe(false);
    expect(tank.water).toBe(12);
    expect(tank.capacity).toBe(20);
    expect(tank.upgrades.digRadius).toBe(0);
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
    expect(tank.credits).toBe(250);
    expect(upgradeStats(tank).digWindup).toBe(0.04);
  });

  it('fits a maximum-radius showcase and basic utility within a 599-credit budget', () => {
    const tank = createTank(); tank.credits = 599;
    for (const id of ['digRadius', 'capacity', 'wallDig'] as const) {
      const levels = id === 'capacity' ? 1 : UPGRADE_DEFINITIONS.find(definition => definition.id === id)!.costs.length;
      for (let level = 0; level < levels; level++) expect(buyUpgrade(tank, id)).toBe(true);
    }
    expect(tank.upgrades).toMatchObject({ digRadius: 7, digDamage: 0, digSpeed: 0, capacity: 1, wallDig: 1 });
    expect(tank.credits).toBe(119);
    expect(buyUpgrade(tank, 'digDamage')).toBe(true);
    expect(buyUpgrade(tank, 'digDamage')).toBe(true);
    expect(buyUpgrade(tank, 'digDamage')).toBe(false);
    expect(tank.credits).toBe(34);
  });
});
