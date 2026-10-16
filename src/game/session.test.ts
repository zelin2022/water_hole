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
  it('starts separate cave-sonar and reserved subsurface-scanner pulse clocks', () => {
    const session = createSession();
    expect(session).toMatchObject({ sonar: null, lastSonarAt: -15,
      subsurfaceScan: null, lastSubsurfaceScanAt: -15 });
    expect(session.tank.upgrades).toMatchObject({ sonar: 0, subsurfaceScanner: 0 });
  });

  it('defaults to dark caves with sonar outlines, depth-weighted pockets and the mouse-aimed headlamp', () => {
    expect(createSession().options).toMatchObject({ caveMemory: 'sonar', waterDistribution: 'depth-weighted', headlamp: 'mouse' });
  });

  it('normalizes a retired cave-memory option from a legacy JavaScript caller to dark caves', () => {
    const legacyOptions = JSON.parse('{"caveMemory":"remembered"}');
    expect(createSession(legacyOptions).options.caveMemory).toBe('sonar');
  });

  it('keeps the two legacy pocket comparisons selectable and reproducible alongside the new default', () => {
    const many = createSession({ seed: 42, waterDistribution: 'many-small' });
    const fewer = createSession({ seed: 42, waterDistribution: 'fewer-large' });
    const selected = createSession({ seed: 42 });
    expect(many.options.waterDistribution).toBe('many-small');
    expect(fewer.options.waterDistribution).toBe('fewer-large');
    expect(selected.options.waterDistribution).toBe('depth-weighted');
    expect(many.world.water).not.toEqual(fewer.world.water);
    for (const session of [many, fewer, selected]) {
      const repeated = createSession({ seed: 42, waterDistribution: session.options.waterDistribution });
      expect(repeated.world.solid).toEqual(session.world.solid);
      expect(repeated.world.water).toEqual(session.world.water);
      expect(totalWater(session.world) + session.tank.water + session.delivered).toBe(session.initialWater);
      expect(session.initialWater).toBeGreaterThan(DEMO_DELIVERY_LIMIT);
    }
  });

  it('resolves walking steps to two cells even for a retired one-cell comparison caller', () => {
    expect(createSession().options.stepHeightCells).toBe(2);
    expect(createSession({ stepHeightCells: 1 }).options.stepHeightCells).toBe(2);
  });

  it('walks up a two-cell step during ordinary session simulation without attaching', () => {
    const session = fixture();
    for (let x = 24; x < 40; x++) {
      session.world.setSolid(x, 28, true);
      session.world.setSolid(x, 29, true);
    }
    advance(session, 0.15, { right: true });
    expect(session.player.x).toBeGreaterThan(80);
    expect(session.player.y).toBe(80);
    expect(session.player.grounded).toBe(true);
    expect(session.player.wall).toBe(0);
  });

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

  it('applies faster upgrades as discrete swings with shorter wind-up instead of continuous digging', () => {
    const session = fixture();
    session.tank.credits = 100;
    for (let level = 0; level < 3; level++) expect(buyUpgrade(session.tank, 'digSpeed')).toBe(true);
    const digging = { ...idle, digging: true, aim: { x: 300, y: 104 } };
    stepSession(session, digging, 0.01);
    stepSession(session, digging, 0.01);
    expect(session.lastStrike).toBeNull();
    stepSession(session, digging, 0.01);
    stepSession(session, digging, 0.01);
    const firstImpact = session.lastStrike;
    expect(firstImpact).not.toBeNull();
    for (let frame = 0; frame < 12; frame++) stepSession(session, digging, 0.01);
    expect(session.lastStrike).toBe(firstImpact);
    for (let frame = 0; frame < 4; frame++) stepSession(session, digging, 0.01);
    expect(session.lastStrike).not.toBe(firstImpact);
    expect(session.lastStrike!.time - firstImpact!.time).toBeCloseTo(0.16, 6);
  });

  it('makes end-level strikes excavate a much wider bite through hard terrain while conserving water and foundation', () => {
    const ordinary = fixture(), showcase = fixture();
    for (const session of [ordinary, showcase]) {
      for (let y = 4; y < 30; y++) {
        for (let x = 24; x < 60; x++) session.world.setMaterial(x, y, 2);
      }
      session.world.setMaterial(30, 22, 3);
      session.world.water[session.world.index(18, 29)] = 0.75;
      session.initialWater = totalWater(session.world);
      session.tank.credits = 1000;
      for (let level = 0; level < 3; level++) buyUpgrade(session.tank, 'digDamage');
    }
    for (let level = 0; level < 7; level++) buyUpgrade(showcase.tank, 'digRadius');
    advance(ordinary, 0.15, { digging: true, aim: { x: 300, y: 104 } });
    advance(showcase, 0.15, { digging: true, aim: { x: 300, y: 104 } });
    expect(showcase.lastStrike!.removed).toBeGreaterThan(ordinary.lastStrike!.removed * 8);
    expect(showcase.world.isSolid(45, 26)).toBe(false);
    expect(ordinary.world.isSolid(45, 26)).toBe(true);
    for (const session of [ordinary, showcase]) {
      expect(session.world.material[session.world.index(30, 22)]).toBe(3);
      expect(session.world.damage[session.world.index(30, 22)]).toBe(0);
      expect(totalWater(session.world) + session.tank.water + session.delivered).toBeCloseTo(session.initialWater, 5);
    }
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

  it('turns a small dirt remnant outside the pick brush into falling, nonblocking debris', () => {
    const session = fixture();
    for (let x = 26; x <= 31; x++) session.world.setMaterial(x, 26, 1);
    session.world.water[session.world.index(35, 29)] = 0.75;
    session.initialWater = totalWater(session.world);
    advance(session, 0.15, { digging: true, aim: { x: 300, y: 104 } });
    expect(session.lastStrike?.removed).toBe(3);
    for (let x = 29; x <= 31; x++) expect(session.world.isSolid(x, 26)).toBe(false);
    expect(session.fallingDirt).toHaveLength(3);
    expect(session.fallingDirt.every(particle => particle.y > 104)).toBe(true);
    expect(totalWater(session.world) + session.tank.water + session.delivered).toBeCloseTo(session.initialWater, 5);
    advance(session, 1);
    expect(session.fallingDirt).toEqual([]);
  });

  it('also cleans an island severed by an intercepted face nearer than the circular brush', () => {
    const session = fixture();
    // The x=88 face is between the player centre (80,104) and the brush;
    // the upper remnant lies outside the circular brush centered at (104,104).
    for (let y = 22; y < 30; y++) session.world.setMaterial(22, y, 1);
    advance(session, 0.15, { digging: true, aim: { x: 300, y: 104 } });
    for (let y = 22; y < 25; y++) expect(session.world.isSolid(22, y)).toBe(false);
    expect(session.fallingDirt).toHaveLength(2);
    expect(session.fallingDirt.every(particle => particle.x === 88)).toBe(true);
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
