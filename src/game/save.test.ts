import { describe, expect, it } from 'vitest';
import { createSession, DEMO_DELIVERY_LIMIT } from './session';
import { collectIntoTank, buyUpgrade } from './economy';
import { totalWater } from './water';
import { deserializeSession, serializeSession } from './save';

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
