import { describe, expect, it } from 'vitest';
import { World } from './world';
import { buyUpgrade, createTank } from './economy';
import { createPlayer } from './player';
import { totalWater } from './water';
import { createSession, DEMO_DELIVERY_LIMIT, stepSession, type GameInput, type Session } from './session';

const idle: GameInput = {
  left: false, right: false, up: false, down: false, jumpPressed: false,
  digging: false, aim: { x: 100, y: 100 }, collecting: false,
  depositPressed: false, upgradePressed: false,
};

function fixture(): Session {
  const session = createSession({ seed: 1 });
  session.world = new World(64, 40, 4);
  for (let x = 1; x < 63; x++) session.world.setSolid(x, 30, true);
  session.player = createPlayer(72, 88);
  session.player.grounded = true;
  session.hopper = { x: 80, y: 104 };
  session.tank = createTank();
  session.explored = new Uint8Array(session.world.solid.length);
  session.initialWater = 20;
  return session;
}

function advance(session: Session, seconds: number, input: Partial<GameInput> = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    stepSession(session, { ...idle, ...input, depositPressed: i === 0 && !!input.depositPressed }, 1 / 60);
  }
}

describe('demo session', () => {
  it('starts a reproducible site with comparison choices preserved', () => {
    const session = createSession({ seed: 123, caveMemory: 'sonar', headlamp: 'mouse' });
    expect(session.seed).toBe(123);
    expect(session.options).toMatchObject({ caveMemory: 'sonar', headlamp: 'mouse' });
    expect(session.initialWater).toBeGreaterThan(DEMO_DELIVERY_LIMIT);
    expect(session.explored.length).toBe(session.world.solid.length);
    expect(session.completed).toBe(false);
    expect(Array.from(createSession({ seed: 123 }).world.solid)).toEqual(Array.from(session.world.solid));
  });

  it('unloads gradually, can cancel, and never credits the same water twice', () => {
    const session = fixture(); session.tank.water = 20;
    advance(session, 0.2, { depositPressed: true });
    expect(session.delivered).toBeCloseTo(5, 6);
    expect(session.tank.water).toBeCloseTo(15, 6);
    expect(session.tank.credits).toBeCloseTo(5, 6);
    advance(session, 0.2, { depositPressed: true });
    expect(session.delivered).toBeCloseTo(5, 6);
    advance(session, 1, { depositPressed: true });
    expect(session.delivered).toBeCloseTo(20, 6);
    expect(session.tank.water).toBeCloseTo(0, 6);
    advance(session, 1, { depositPressed: true });
    expect(session.tank.credits).toBeCloseTo(20, 6);
  });

  it('cancels unloading on departure and requires machine proximity for purchases', () => {
    const session = fixture(); session.tank.water = 20; session.tank.credits = 100;
    advance(session, 0.1, { depositPressed: true });
    session.player.x = 220;
    stepSession(session, { ...idle, purchase: 'capacity' }, 1 / 60);
    expect(session.unloading).toBe(false);
    expect(session.tank.capacity).toBe(20);
    expect(session.tank.credits).toBeCloseTo(102.5, 6);
  });

  it('clamps the final transfer to the demo wall then freezes gameplay', () => {
    const session = fixture(); session.delivered = DEMO_DELIVERY_LIMIT - 0.1;
    session.tank.water = 20;
    stepSession(session, { ...idle, depositPressed: true }, 1 / 60);
    expect(session.delivered).toBe(DEMO_DELIVERY_LIMIT);
    expect(session.tank.water).toBeCloseTo(19.9, 6);
    expect(session.tank.credits).toBeCloseTo(0.1, 6);
    expect(session.completed).toBe(true);
    const snapshot = JSON.stringify(session);
    stepSession(session, { ...idle, right: true, digging: true, collecting: true, purchase: 'capacity' }, 1);
    expect(JSON.stringify(session)).toBe(snapshot);
  });

  it('waits for pick wind-up and applies isolated periodic impacts', () => {
    const session = fixture();
    // The player centre is (80,104); the forward strike is near (104,104).
    session.world.setSolid(26, 26, true);
    advance(session, 0.1, { digging: true, aim: { x: 300, y: 104 } });
    expect(session.world.isSolid(26, 26)).toBe(true);
    advance(session, 0.05, { digging: true, aim: { x: 300, y: 104 } });
    expect(session.world.isSolid(26, 26)).toBe(false);
    const impact = session.lastStrike;
    advance(session, 0.2, { digging: true, aim: { x: 300, y: 104 } });
    expect(session.lastStrike).toBe(impact);
  });

  it('locks wall digging until its equipment purchase', () => {
    const session = fixture();
    // A full adjacent wall keeps the player attached during the strike wind-up.
    for (let y = 15; y < 30; y++) session.world.setSolid(22, y, true);
    session.player.wall = 1;
    session.player.x = 72; session.player.y = 80;
    advance(session, 0.2, { digging: true, aim: { x: 300, y: 104 } });
    expect(session.lastStrike).toBeNull();
    session.tank.credits = 100; buyUpgrade(session.tank, 'wallDig');
    advance(session, 0.2, { digging: true, aim: { x: 300, y: 104 } });
    expect(session.lastStrike).not.toBeNull();
  });

  it('conserves world, tank and delivered water throughout collection and timed unloading', () => {
    const session = fixture();
    for (let x = 16; x < 21; x++) session.world.water[session.world.index(x, 29)] = 1;
    session.initialWater = totalWater(session.world);
    advance(session, 1, { collecting: true });
    advance(session, 1, { depositPressed: true });
    expect(totalWater(session.world) + session.tank.water + session.delivered).toBeCloseTo(session.initialWater, 4);
  });
});


describe('fractional transfer affordability', () => {
  it('allows the advertised 60-credit purchase after unloading three full tanks', () => {
    const session = fixture();
    for (let trip = 0; trip < 3; trip++) {
      session.tank.water = 20;
      advance(session, 1, { depositPressed: true });
    }
    expect(session.tank.credits).toBeCloseTo(60, 8);
    stepSession(session, { ...idle, purchase: 'capacity' }, 1 / 60);
    expect(session.tank.capacity).toBe(40);
    expect(session.tank.credits).toBe(0);
    expect(session.delivered).toBeCloseTo(60, 8);
  });
});
