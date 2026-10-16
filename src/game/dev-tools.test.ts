import { describe, expect, it } from 'vitest';
import { buyUpgrade, depositAtHopper } from './economy';
import { createSession, DEMO_DELIVERY_LIMIT, nearHopper, stepSession, type GameInput, type Session } from './session';
import { totalWater } from './water';
import { World } from './world';
import * as devTools from './dev-tools';
import { MAX_DEV_CREDITS, setDevCredits, setOmniVision, teleportToHopper } from './dev-tools';

function stockTank(session: Session, amount: number): void {
  let remaining = amount;
  for (let index = 0; index < session.world.water.length && remaining > 0; index++) {
    const transfer = Math.min(remaining, session.world.water[index]);
    session.world.water[index] -= transfer;
    session.tank.water += transfer;
    remaining -= transfer;
  }
}

const idle: GameInput = {
  left: false, right: false, up: false, down: false, jumpPressed: false,
  digging: false, aim: { x: 100, y: 100 }, collecting: false, depositPressed: false,
};

describe('provisional development controls', () => {
  it('resets wall-jump state and recharges the air jump when teleporting onto the platform', () => {
    const session = createSession({ seed: 42 });
    session.player.airJumpAvailable = false;
    session.player.wallJumpChain = true;
    expect(teleportToHopper(session)).toBe(true);
    expect(session.player.airJumpAvailable).toBe(true);
    expect(session.player.wallJumpChain).toBe(false);
  });
  it('retires the walking step comparison now that two-cell stepping is selected', () => {
    expect(devTools).not.toHaveProperty('setStepHeight');
  });

  it('returns a falling worker safely to the platform without altering resources or terrain', () => {
    const session = createSession({ seed: 42 });
    stockTank(session, 10);
    setDevCredits(session, 123);
    Object.assign(session.player, { x: 600, y: 700, vx: 150, vy: 400, grounded: false,
      wall: -1, suppressedWall: 1, wallJumpTime: 0.1 });
    session.strikeTime = 0.1;
    session.digCooldown = 0.3;
    session.lastStrike = { center: { x: 600, y: 700 }, damaged: 2, removed: 1, time: session.time };
    session.unloading = true;
    const expected = JSON.parse(JSON.stringify(session));
    Object.assign(expected.player, { x: 80, y: 144, vx: 0, vy: 0, grounded: true,
      wall: 0, suppressedWall: 0, wallJumpTime: 0 });
    Object.assign(expected, { strikeTime: -1, digCooldown: 0, lastStrike: null, unloading: false });

    expect(teleportToHopper(session)).toBe(true);
    expect(nearHopper(session)).toBe(true);
    expect(JSON.parse(JSON.stringify(session))).toEqual(expected);
    expect(totalWater(session.world) + session.tank.water + session.delivered).toBeCloseTo(session.initialWater, 5);
  });

  it('finds clear supported space when the preferred destination is obstructed', () => {
    const session = createSession();
    session.world = new World(80, 80);
    session.hopper = { x: 80, y: 80 };
    session.surfaceY = 144;
    for (let x = 1; x < session.world.width - 1; x++) session.world.setSolid(x, 36, true);
    for (let y = 28; y < 36; y++) {
      for (let x = 28; x < 32; x++) session.world.setSolid(x, y, true);
    }
    const terrain = session.world.solid.slice();
    expect(teleportToHopper(session)).toBe(true);
    expect(nearHopper(session)).toBe(true);
    expect(session.player.grounded).toBe(true);
    expect(session.player.x).not.toBe(112);
    for (let y = session.player.y; y < session.player.y + session.player.height; y += 4) {
      for (let x = session.player.x; x < session.player.x + session.player.width; x += 4) {
        expect(session.world.isSolidAtPixel(x, y)).toBe(false);
      }
    }
    expect(session.world.solid).toEqual(terrain);
  });

  it('uses nearby remaining ground for a legacy hopper whose original support was excavated', () => {
    const session = createSession();
    session.world = new World(96, 80);
    session.hopper = { x: 160, y: 120 };
    session.surfaceY = 176;
    for (let x = 1; x < session.world.width - 1; x++) session.world.setSolid(x, 44, true);
    for (let x = 24; x < 56; x++) session.world.setSolid(x, 44, false);
    expect(teleportToHopper(session)).toBe(true);
    expect(nearHopper(session)).toBe(true);
    expect(session.player.grounded).toBe(true);
    expect(session.player.x + session.player.width).toBeGreaterThan(224);
  });

  it('allows a clear airborne destination for an unsupported legacy hopper without inventing a platform', () => {
    const session = createSession();
    session.world = new World(96, 80);
    session.hopper = { x: 160, y: 80 };
    session.surfaceY = 176;
    const terrain = session.world.solid.slice();
    expect(teleportToHopper(session)).toBe(true);
    expect(nearHopper(session)).toBe(true);
    expect(session.player.grounded).toBe(false);
    expect(session.world.solid).toEqual(terrain);
  });

  it('rejects a blocked hopper without moving the player or cancelling their actions', () => {
    const session = createSession();
    session.world = new World(80, 80);
    for (let y = 1; y < session.world.height - 1; y++) {
      for (let x = 1; x < session.world.width - 1; x++) session.world.setSolid(x, y, true);
    }
    session.hopper = { x: 100, y: 100 };
    session.strikeTime = 0.1;
    session.unloading = true;
    const before = JSON.stringify(session);
    expect(teleportToHopper(session)).toBe(false);
    expect(JSON.stringify(session)).toBe(before);
  });

  it('starts each run without any credit adjustment', () => {
    expect(createSession().devCreditAdjustment).toBe(0);
  });

  it('sets the exact balance and records only the signed difference without changing gameplay', () => {
    const session = createSession({ seed: 42 });
    const before = JSON.stringify(session);
    expect(setDevCredits(session, 500)).toBe(true);
    expect(session.tank.credits).toBe(500);
    expect(session.devCreditAdjustment).toBe(500);
    const expected = JSON.parse(before);
    expected.tank.credits = 500;
    expected.devCreditAdjustment = 500;
    expect(JSON.parse(JSON.stringify(session))).toEqual(expected);
    expect(buyUpgrade(session.tank, 'capacity')).toBe(true);
    expect(setDevCredits(session, 5.25)).toBe(true);
    expect(session.tank.credits).toBe(5.25);
    expect(session.devCreditAdjustment).toBe(65.25);
    expect(setDevCredits(session, 0)).toBe(true);
    expect(session.devCreditAdjustment).toBe(60);
  });

  it('allows later water sales without changing their credit or water accounting', () => {
    const session = createSession({ seed: 42 });
    stockTank(session, 10);
    expect(setDevCredits(session, 50)).toBe(true);
    session.delivered += depositAtHopper(session.tank, session.hopper, session.hopper, 0);
    expect(session.tank.credits).toBe(60);
    expect(session.devCreditAdjustment).toBe(50);
    expect(session.delivered).toBe(10);
    expect(totalWater(session.world) + session.tank.water + session.delivered).toBeCloseTo(session.initialWater, 5);
    expect(setDevCredits(session, 0)).toBe(true);
    expect(session.devCreditAdjustment).toBe(-10);
  });

  it('accepts the upper bound and rejects invalid input without mutation', () => {
    const session = createSession();
    expect(setDevCredits(session, MAX_DEV_CREDITS)).toBe(true);
    for (const amount of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, MAX_DEV_CREDITS + 1]) {
      const before = JSON.stringify(session);
      expect(setDevCredits(session, amount)).toBe(false);
      expect(JSON.stringify(session)).toBe(before);
    }
  });

  it('switches omni vision without revealing exploration or affecting unloading', () => {
    const session = createSession({ caveMemory: 'sonar' });
    session.unloading = true;
    const before = JSON.parse(JSON.stringify(session));
    expect(setOmniVision(session, true)).toBe(true);
    before.options.debugVision = true;
    expect(JSON.parse(JSON.stringify(session))).toEqual(before);
    expect(setOmniVision(session, false)).toBe(true);
    expect(session.options.debugVision).toBe(false);
    expect(session.explored.every(cell => cell === 0)).toBe(true);
  });

  it('keeps an ended demo frozen even when development controls are called', () => {
    const session = createSession();
    session.completed = true;
    session.delivered = DEMO_DELIVERY_LIMIT;
    const before = JSON.stringify(session);
    expect(setDevCredits(session, 500)).toBe(false);
    expect(setOmniVision(session, true)).toBe(false);
    expect(teleportToHopper(session)).toBe(false);
    stepSession(session, idle, 1);
    expect(JSON.stringify(session)).toBe(before);
  });
});
