import { describe, expect, it } from 'vitest';
import { buyUpgrade, depositAtHopper } from './economy';
import { createSession, DEMO_DELIVERY_LIMIT, stepSession, type GameInput, type Session } from './session';
import { totalWater } from './water';
import { MAX_DEV_CREDITS, setDevCredits, setOmniVision, setStepHeight } from './dev-tools';

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
  it('changes only the walking step comparison during a run', () => {
    const session = createSession();
    const before = JSON.parse(JSON.stringify(session));
    expect(setStepHeight(session, 1)).toBe(true);
    before.options.stepHeightCells = 1;
    expect(JSON.parse(JSON.stringify(session))).toEqual(before);
    expect(setStepHeight(session, 2)).toBe(true);
    expect(session.options.stepHeightCells).toBe(2);
  });

  it('rejects unsupported walking step comparisons without changing the run', () => {
    const session = createSession();
    for (const value of [0, 3, 1.5, Number.NaN, '1', null]) {
      const before = JSON.stringify(session);
      expect(setStepHeight(session, value as 1 | 2)).toBe(false);
      expect(JSON.stringify(session)).toBe(before);
    }
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
    expect(setStepHeight(session, 1)).toBe(false);
    stepSession(session, idle, 1);
    expect(JSON.stringify(session)).toBe(before);
  });
});
