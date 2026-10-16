import { describe, expect, it } from 'vitest';
import { createSession, DEMO_DELIVERY_LIMIT } from './session';
import { collectIntoTank, buyUpgrade } from './economy';
import { totalWater } from './water';
import { deserializeSession, serializeSession } from './save';
import { setDevCredits, setOmniVision } from './dev-tools';

function stockedSession() {
  const session = createSession({ seed: 42, caveMemory: 'sonar', headlamp: 'mouse' });
  // Move a ledger-accounted portion of the world water into the machine and tank.
  let available = 100;
  for (let index = 0; index < session.world.water.length && available > 0; index++) {
    const transfer = Math.min(available, session.world.water[index]);
    session.world.water[index] -= transfer;
    available -= transfer;
  }
  session.delivered = 90;
  session.tank.credits = 90;
  session.tank.water = 10;
  buyUpgrade(session.tank, 'capacity');
  session.explored[300] = 1;
  session.time = 9;
  session.sonar = { origin: {x:100,y:100}, startedAt:8,maxRadius:800 };
  session.lastSonarAt = 8;
  const solidIndex = session.world.solid.findIndex((value, index) => value > 0 && index > session.world.width * 50 && index % session.world.width > 2);
  session.world.damage[solidIndex] = 0.5;
  return session;
}

function corrupt(change: (data: any) => void) {
  const data = JSON.parse(serializeSession(createSession({seed:2})));
  change(data);
  return JSON.stringify(data);
}

describe('versioned local saves', () => {
  it('preserves independent cave-sonar and subsurface-scanner pulse state', () => {
    const session = stockedSession();
    session.subsurfaceScan = { origin: { x: 180, y: 120 }, startedAt: 7, maxRadius: 600 };
    session.lastSubsurfaceScanAt = 7;
    session.tank.upgrades.subsurfaceScanner = 1;
    const restored = deserializeSession(serializeSession(session));
    expect(restored.sonar).toEqual(session.sonar);
    expect(restored.lastSonarAt).toBe(8);
    expect(restored.subsurfaceScan).toEqual(session.subsurfaceScan);
    expect(restored.lastSubsurfaceScanAt).toBe(7);
    expect(restored.tank.upgrades).toEqual(session.tank.upgrades);
    expect(totalWater(restored.world) + restored.tank.water + restored.delivered).toBeCloseTo(restored.initialWater, 5);
  });

  it('migrates earlier v1 saves without scanner metadata while preserving owned cave sonar and progress', () => {
    const session = stockedSession();
    expect(buyUpgrade(session.tank, 'sonar')).toBe(true);
    const earlier = JSON.parse(serializeSession(session));
    delete earlier.session.tank.upgrades.subsurfaceScanner;
    delete earlier.session.subsurfaceScan;
    delete earlier.session.lastSubsurfaceScanAt;
    const restored = deserializeSession(JSON.stringify(earlier));
    expect(restored.subsurfaceScan).toBeNull();
    expect(restored.lastSubsurfaceScanAt).toBe(-15);
    expect(restored.tank.upgrades).toEqual({ ...session.tank.upgrades, subsurfaceScanner: 0 });
    expect(restored.tank.upgrades.sonar).toBe(1);
    expect(restored.sonar).toEqual(session.sonar);
    expect(restored.world.solid).toEqual(session.world.solid);
    expect(restored.world.water).toEqual(session.world.water);
    expect(restored.delivered).toBe(session.delivered);
    expect(restored.tank.credits).toBe(session.tank.credits);
    expect(totalWater(restored.world) + restored.tank.water + restored.delivered).toBeCloseTo(restored.initialWater, 5);
  });

  it('rejects malformed scanner pulses, clocks and upgrade levels', () => {
    for (const subsurfaceScan of [false, {}, { origin: { x: 0, y: 0 }, startedAt: -1, maxRadius: 50 },
      { origin: { x: 1000000, y: 0 }, startedAt: 0, maxRadius: 50 },
      { origin: { x: 0, y: 0 }, startedAt: 1, maxRadius: 50 },
      { origin: { x: 0, y: 0 }, startedAt: 0, maxRadius: 0 }]) {
      expect(() => deserializeSession(corrupt(data => data.session.subsurfaceScan = subsurfaceScan))).toThrow(/scanner pulse/);
    }
    for (const lastSubsurfaceScanAt of [null, '0', -16, 1]) {
      expect(() => deserializeSession(corrupt(data => data.session.lastSubsurfaceScanAt = lastSubsurfaceScanAt))).toThrow(/scanner cooldown/);
    }
    for (const level of [null, -1, 2, 0.5, '1']) {
      expect(() => deserializeSession(corrupt(data => data.session.tank.upgrades.subsurfaceScanner = level))).toThrow(/upgrade level/);
    }
  });

  it('rejects unknown equipment entries and missing established equipment when migrating scanner metadata', () => {
    expect(() => deserializeSession(corrupt(data => {
      delete data.session.tank.upgrades.subsurfaceScanner;
      data.session.tank.upgrades.unknownEquipment = 0;
    }))).toThrow(/upgrade entries/);
    expect(() => deserializeSession(corrupt(data => {
      delete data.session.tank.upgrades.sonar;
    }))).toThrow(/upgrade entries/);
  });

  it.each(['many-small', 'fewer-large'] as const)('preserves the %s water distribution with the actual site and water ledger', waterDistribution => {
    const session = createSession({ seed: 42, caveMemory: 'sonar', waterDistribution });
    const restored = deserializeSession(serializeSession(session));
    expect(restored.options.waterDistribution).toBe(waterDistribution);
    expect(restored.world.solid).toEqual(session.world.solid);
    expect(restored.world.water).toEqual(session.world.water);
    expect(totalWater(restored.world) + restored.tank.water + restored.delivered).toBeCloseTo(restored.initialWater, 5);
  });

  it('migrates earlier v1 comparison choices while preserving their serialized world and progress', () => {
    const session = stockedSession();
    const earlier = JSON.parse(serializeSession(session));
    delete earlier.session.options.waterDistribution;
    earlier.session.options.headlamp = 'character';
    const restored = deserializeSession(JSON.stringify(earlier));
    expect(restored.options.waterDistribution).toBe('fewer-large');
    expect(restored.options.headlamp).toBe('mouse');
    expect(restored.world.solid).toEqual(session.world.solid);
    expect(restored.world.material).toEqual(session.world.material);
    expect(restored.world.damage).toEqual(session.world.damage);
    expect(restored.world.water).toEqual(session.world.water);
    expect(restored.delivered).toBe(session.delivered);
    expect(restored.tank).toEqual(session.tank);
    expect(restored.explored).toEqual(session.explored);
    expect(totalWater(restored.world) + restored.tank.water + restored.delivered).toBeCloseTo(restored.initialWater, 5);
  });

  it('rejects invalid water distribution and headlamp options', () => {
    for (const waterDistribution of [null, 'unknown', '', 1, ['many-small']]) {
      expect(() => deserializeSession(corrupt(data => data.session.options.waterDistribution = waterDistribution))).toThrow(/comparison options/);
    }
    for (const headlamp of [null, 'unknown', '', 1]) {
      expect(() => deserializeSession(corrupt(data => data.session.options.headlamp = headlamp))).toThrow(/comparison options/);
    }
  });

  it('preserves the walking step comparison and gives earlier v1 saves the two-cell default', () => {
    const session = createSession({ stepHeightCells: 1 });
    expect(deserializeSession(serializeSession(session)).options.stepHeightCells).toBe(1);
    const earlier = JSON.parse(serializeSession(session));
    delete earlier.session.options.stepHeightCells;
    expect(deserializeSession(JSON.stringify(earlier)).options.stepHeightCells).toBe(2);
  });

  it('rejects unsupported walking step heights instead of restoring an unbounded movement setting', () => {
    for (const stepHeightCells of [null, 0, 3, 1.5, '1']) {
      expect(() => deserializeSession(corrupt(data => data.session.options.stepHeightCells = stepHeightCells))).toThrow(/comparison options/);
    }
  });

  it('round-trips repeated credit grants, purchases, reductions and omni vision', () => {
    const session = stockedSession();
    setDevCredits(session, 1000);
    buyUpgrade(session.tank, 'detector');
    setDevCredits(session, 2.5);
    setOmniVision(session, true);
    const restored = deserializeSession(serializeSession(session));
    expect(restored.tank.credits).toBe(2.5);
    expect(restored.devCreditAdjustment).toBe(-2.5);
    expect(restored.tank.upgrades.detector).toBe(1);
    expect(restored.options.debugVision).toBe(true);
    expect(totalWater(restored.world) + restored.tank.water + restored.delivered).toBeCloseTo(restored.initialWater, 2);
  });

  it('accepts earlier v1 saves without development credit metadata as zero adjustment', () => {
    const earlier = JSON.parse(serializeSession(stockedSession()));
    delete earlier.session.devCreditAdjustment;
    expect(deserializeSession(JSON.stringify(earlier)).devCreditAdjustment).toBe(0);
  });

  it('rejects invalid credit adjustments and balances not covered by the adjusted ledger', () => {
    for (const adjustment of [null, '100', Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => deserializeSession(corrupt(data => data.session.devCreditAdjustment = adjustment))).toThrow(/credit adjustment/);
    }
    expect(() => deserializeSession(corrupt(data => {
      data.session.devCreditAdjustment = 10;
      data.session.tank.credits = 11;
    }))).toThrow(/unearned credits/);
    expect(() => deserializeSession(corrupt(data => {
      data.session.devCreditAdjustment = -1;
    }))).toThrow(/unearned credits/);
  });

  it('still rejects lost water even when a development credit grant covers the balance', () => {
    const session = createSession();
    setDevCredits(session, 1000);
    const damaged = JSON.parse(serializeSession(session));
    damaged.session.tank.water = 1;
    expect(() => deserializeSession(JSON.stringify(damaged))).toThrow(/water ledger mismatch/);
  });

  it('round-trips terrain damage, water, upgrades, comparison modes and exploration independently', () => {
    const original = stockedSession();
    const restored = deserializeSession(serializeSession(original));
    expect(restored.world).not.toBe(original.world);
    expect(restored.world.solid).toEqual(original.world.solid);
    expect(restored.world.material).toEqual(original.world.material);
    expect(restored.world.damage).toEqual(original.world.damage);
    expect(restored.world.water).toEqual(original.world.water);
    expect(restored.explored).toEqual(original.explored);
    expect(restored.tank).toEqual(original.tank);
    expect(restored.player).toEqual(original.player);
    expect(restored.options).toEqual(original.options);
    expect(restored.sonar).toEqual(original.sonar);
    expect(totalWater(restored.world) + restored.tank.water + restored.delivered).toBeCloseTo(restored.initialWater, 2);
    restored.world.water.fill(0);
    expect(totalWater(original.world)).toBeGreaterThan(0);
  });

  it('preserves the ended state', () => {
    const session = createSession();
    let remaining = DEMO_DELIVERY_LIMIT;
    for (let i = 0; i < session.world.water.length && remaining > 0; i++) {
      const amount = Math.min(remaining,session.world.water[i]);
      session.world.water[i] -= amount; remaining -= amount;
    }
    session.delivered = DEMO_DELIVERY_LIMIT; session.completed = true;
    expect(deserializeSession(serializeSession(session)).completed).toBe(true);
  });

  it('round-trips falling dirt and accepts earlier v1 saves without it', () => {
    const session = createSession({ seed: 42 });
    session.fallingDirt = [{ x: 240, y: 80.25, vy: 120 }];
    const restored = deserializeSession(serializeSession(session));
    expect(restored.fallingDirt).toEqual(session.fallingDirt);
    expect(restored.fallingDirt).not.toBe(session.fallingDirt);
    const earlier = JSON.parse(serializeSession(session));
    delete earlier.session.fallingDirt;
    expect(deserializeSession(JSON.stringify(earlier)).fallingDirt).toEqual([]);
  });

  it('clears pre-existing small dirt obstacles once when loading an earlier active save', () => {
    const session = createSession({ seed: 42 });
    for (let x = 60; x < 63; x++) session.world.setMaterial(x, 20, 1);
    const earlier = JSON.parse(serializeSession(session));
    delete earlier.session.fallingDirt;
    const restored = deserializeSession(JSON.stringify(earlier));
    expect(restored.fallingDirt).toHaveLength(3);
    for (let x = 60; x < 63; x++) expect(restored.world.isSolid(x, 20)).toBe(false);
    expect(totalWater(restored.world)).toBeCloseTo(restored.initialWater, 5);
  });

  it('rejects malformed, out-of-world or excessive falling dirt data', () => {
    for (const fallingDirt of [null, [{ x: -1, y: 20, vy: 0 }], [{ x: 20, y: 20, vy: -1 }],
      [{ x: 20, y: 1000000, vy: 0 }], [{ x: 20, y: 20, vy: 1000000 }]]) {
      expect(() => deserializeSession(corrupt(data => data.session.fallingDirt = fallingDirt))).toThrow(/falling dirt/);
    }
    expect(() => deserializeSession(corrupt(data => data.session.fallingDirt =
      Array.from({ length: data.world.solid.length + 1 }, () => ({ x: 20, y: 20, vy: 0 }))))).toThrow(/falling dirt/);
  });

  it('rejects malformed data, unsupported versions and unbounded worlds', () => {
    expect(() => deserializeSession('not json')).toThrow();
    expect(() => deserializeSession(corrupt(data => data.version = 20))).toThrow();
    expect(() => deserializeSession(corrupt(data => data.world.width = 1000000))).toThrow();
    expect(() => deserializeSession(corrupt(data => data.world.water.pop()))).toThrow();
  });

  it('rejects water in solid terrain and broken boundary cells', () => {
    expect(() => deserializeSession(corrupt(data => data.world.water[0] = 1))).toThrow();
    expect(() => deserializeSession(corrupt(data => data.world.solid[0] = 0))).toThrow();
  });

  it('rejects invalid upgrade levels, incompatible capacity and water ledger corruption', () => {
    expect(() => deserializeSession(corrupt(data => data.session.tank.upgrades.capacity = 12))).toThrow();
    expect(() => deserializeSession(corrupt(data => data.session.tank.capacity = 999))).toThrow();
    expect(() => deserializeSession(corrupt(data => data.session.tank.water = 1))).toThrow();
    expect(() => deserializeSession(corrupt(data => data.session.completed = true))).toThrow();
  });
});
