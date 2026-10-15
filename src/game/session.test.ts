import { describe, expect, it } from 'vitest';
import { World } from './world';
import { createTank } from './economy';
import { createPlayer, stepPlayer } from './player';
import { totalWater } from './water';
import { createSession, stepSession, type GameInput, type Session } from './session';

const idle: GameInput = {
  left: false, right: false, up: false, down: false, jumpPressed: false,
  digging: false, aim: { x: 0, y: 0 }, collecting: false,
  depositPressed: false, upgradePressed: false,
};

function poolFixture(): Session {
  const world = new World(64, 40, 4);
  for (let x = 1; x < world.width - 1; x++) world.setSolid(x, 30, true);
  for (let y = 14; y < 30; y++) {
    for (let x = 5; x < 25; x++) world.water[world.index(x, y)] = 1;
  }
  return {
    world, player: createPlayer(36, 88), tank: createTank(),
    hopper: { x: 216, y: 88 }, delivered: 0, time: 0,
    completed: false, initialWater: totalWater(world),
  };
}

describe('v0 session', () => {
  it('starts a finite test site with a safe player spawn and enough water for the upgrade', () => {
    const session = createSession();
    expect(session.world.cellSize).toBe(4);
    expect(session.initialWater).toBeGreaterThan(120);
    const p = session.player;
    expect(session.world.isSolidAtPixel(p.x + p.width / 2, p.y + p.height / 2)).toBe(false);
    expect(session.tank).toMatchObject({ water: 0, credits: 0, capacity: 20 });
    expect(session.completed).toBe(false);
  });

  it('cannot sell or buy an upgrade remotely', () => {
    const session = poolFixture();
    session.tank.water = 10;
    session.tank.credits = 100;
    stepSession(session, { ...idle, depositPressed: true, upgradePressed: true }, 1 / 60);
    expect(session.tank.water).toBe(10);
    expect(session.tank.credits).toBe(100);
    expect(session.tank.upgraded).toBe(false);
    expect(session.delivered).toBe(0);
  });

  it('lets the player climb from the bottom of the starter shaft back onto the surface', () => {
    const session = createSession();
    session.player = createPlayer(360, 200);
    for (let frame = 0; frame < 420; frame++) {
      stepPlayer(session.world, session.player, { ...idle, left: true, down: true }, 1 / 60);
    }
    for (let frame = 0; frame < 360; frame++) {
      stepPlayer(session.world, session.player, { ...idle, left: true, up: true, jumpPressed: frame === 0 }, 1 / 60);
    }
    expect(session.player.y).toBeLessThanOrEqual(160.1);
    expect(session.player.x).toBeLessThan(352);
  });

  it('sells only once per tank and accounts for delivered water', () => {
    const session = poolFixture();
    session.player.x = session.hopper.x - session.player.width / 2;
    session.player.y = session.hopper.y - session.player.height / 2;
    session.tank.water = 20;
    stepSession(session, { ...idle, depositPressed: true }, 1 / 60);
    stepSession(session, { ...idle, depositPressed: true }, 1 / 60);
    expect(session.tank.water).toBe(0);
    expect(session.tank.credits).toBe(20);
    expect(session.delivered).toBe(20);
  });

  it('completes only after selling, buying capacity, and carrying more than the original tank', () => {
    const session = poolFixture();
    function collect() {
      session.player.x = 36;
      session.player.y = 88;
      session.player.vx = 0;
      session.player.vy = 0;
      for (let frame = 0; frame < 120; frame++) {
        stepSession(session, { ...idle, collecting: true }, 1 / 60);
      }
    }
    function sell() {
      session.player.x = session.hopper.x - session.player.width / 2;
      session.player.y = session.hopper.y - session.player.height / 2;
      stepSession(session, { ...idle, depositPressed: true }, 1 / 60);
    }
    for (let trip = 0; trip < 3; trip++) {
      collect();
      expect(session.tank.water).toBeCloseTo(20, 3);
      sell();
    }
    expect(session.completed).toBe(false);
    stepSession(session, { ...idle, upgradePressed: true }, 1 / 60);
    expect(session.tank.capacity).toBe(40);
    expect(session.tank.credits).toBeCloseTo(0, 3);
    expect(session.completed).toBe(false);
    collect();
    expect(session.tank.water).toBeGreaterThan(20);
    expect(session.completed).toBe(true);
    expect(totalWater(session.world) + session.tank.water + session.delivered)
      .toBeCloseTo(session.initialWater, 2);
  });
});
