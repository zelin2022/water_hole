import { describe, expect, it } from 'vitest';
import { World } from './world';
import {
  computeDaylight, createVision, pingSonar, sonarOpacity, updateVision,
  SONAR_COOLDOWN, SONAR_TRAVEL_TIME, SONAR_OUTLINE_LIFETIME,
} from './vision';

function undergroundRoom(width = 100, height = 50): World {
  const world = new World(width, height, 4);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) world.setSolid(x, y, true);
  }
  for (let y = 3; y < height - 3; y++) {
    for (let x = 3; x < width - 3; x++) world.setSolid(x, y, false);
  }
  return world;
}

describe('daylight responding to excavated geometry', () => {
  it('keeps roofed caves dark, then lights a newly opened shaft and its adjoining tunnel', () => {
    const world = new World(14, 14, 4);
    for (let y = 4; y < 13; y++) {
      for (let x = 1; x < 13; x++) world.setSolid(x, y, true);
    }
    world.setSolid(5, 9, false);
    world.setSolid(6, 9, false);
    expect(computeDaylight(world)[world.index(5, 9)]).toBe(0);
    for (let y = 4; y < 9; y++) world.setSolid(5, y, false);
    const light = computeDaylight(world);
    expect(light[world.index(5, 9)]).toBe(1);
    expect(light[world.index(6, 9)]).toBeGreaterThan(0);
    expect(light[world.index(6, 9)]).toBeLessThan(light[world.index(5, 9)]);
  });

  it('does not treat freshly excavated underground faces as sunlight sources', () => {
    const world = undergroundRoom();
    expect(computeDaylight(world)[world.index(20, 10)]).toBe(0);
    world.setSolid(2, 10, false);
    expect(computeDaylight(world)[world.index(2, 10)]).toBe(0);
  });

  it('lights exposed rock faces but not rock behind them', () => {
    const world = new World(12, 12, 4);
    for (let y = 5; y < 11; y++) {
      for (let x = 1; x < 11; x++) world.setSolid(x, y, true);
    }
    const light = computeDaylight(world);
    expect(light[world.index(5, 5)]).toBeGreaterThan(0);
    expect(light[world.index(5, 6)]).toBe(0);
  });

  it('reuses the cached field until terrain changes', () => {
    const world = new World(12, 12);
    const before = computeDaylight(world);
    expect(computeDaylight(world)).toBe(before);
    world.setSolid(5, 4, true);
    expect(computeDaylight(world)).not.toBe(before);
  });
});

describe('local lamps and exploration', () => {
  it('compares character-facing and mouse-facing beams independently of torso light', () => {
    const world = undergroundRoom();
    const state = createVision(world);
    const input = {
      position: { x: 200, y: 100 }, aim: { x: 0, y: 100 }, facing: 1 as const,
      headlamp: 'character' as const, time: 0, torsoRadius: 16, headlampRange: 120,
    };
    updateVision(world, state, input);
    expect(state.visible[world.index(70, 25)]).toBe(1);
    expect(state.visible[world.index(29, 25)]).toBe(0);
    updateVision(world, state, { ...input, headlamp: 'mouse', time: 1 });
    expect(state.visible[world.index(70, 25)]).toBe(0);
    expect(state.visible[world.index(29, 25)]).toBe(1);
  });

  it('blocks lamp visibility behind rock while showing its first surface', () => {
    const world = undergroundRoom();
    for (let y = 3; y < world.height - 3; y++) world.setSolid(60, y, true);
    world.water[world.index(62, 25)] = 1;
    const state = createVision(world);
    updateVision(world, state, {
      position: { x: 200, y: 100 }, aim: { x: 350, y: 100 }, facing: 1,
      headlamp: 'mouse', time: 0,
    });
    expect(state.visible[world.index(60, 25)]).toBe(1);
    expect(state.visible[world.index(62, 25)]).toBe(0);
    expect(state.explored[world.index(62, 25)]).toBe(0);
  });

  it('does not shine diagonally through touching solid corners', () => {
    const world = undergroundRoom(20, 20);
    world.setSolid(10, 9, true);
    world.setSolid(9, 10, true);
    const state = createVision(world);
    updateVision(world, state, {
      position: { x: 38, y: 38 }, aim: { x: 60, y: 60 }, facing: 1,
      headlamp: 'mouse', time: 0,
    });
    expect(state.visible[world.index(10, 10)]).toBe(0);
  });

  it('retains exploration after a lamp moves away and preserves the save array reference', () => {
    const world = undergroundRoom();
    const exploration = new Uint8Array(world.width * world.height);
    const state = createVision(world, exploration);
    expect(state.explored).toBe(exploration);
    const input = { position: { x: 200, y: 100 }, aim: { x: 350, y: 100 },
      facing: 1 as const, headlamp: 'character' as const, time: 0 };
    updateVision(world, state, input);
    const index = world.index(75, 25);
    expect(state.visible[index]).toBe(1);
    updateVision(world, state, { ...input, facing: -1, time: 1 });
    expect(state.visible[index]).toBe(0);
    expect(exploration[index]).toBe(1);
  });

  it('provides full debug visibility without permanently exploring the entire site', () => {
    const world = undergroundRoom();
    const state = createVision(world);
    updateVision(world, state, {
      position: { x: 200, y: 100 }, aim: { x: 350, y: 100 }, facing: 1,
      headlamp: 'mouse', time: 0, debugVision: true,
    });
    expect(state.visible[world.index(4, 4)]).toBe(1);
    expect(state.light[world.index(4, 4)]).toBe(1);
    expect(state.explored[world.index(4, 4)]).toBe(0);
  });
});

describe('temporary outward sonar', () => {
  it('enforces the cooldown and snapshots the ping origin', () => {
    const state = createVision(new World(10, 10));
    const origin = { x: 20, y: 20 };
    expect(pingSonar(state, origin, 0, 200)).toBe(true);
    origin.x = 100;
    expect(state.sonar?.origin.x).toBe(20);
    expect(pingSonar(state, origin, SONAR_COOLDOWN - 0.01, 200)).toBe(false);
    expect(pingSonar(state, origin, SONAR_COOLDOWN, 200)).toBe(true);
  });

  it('reveals each segment when reached, with a fast attack and slower half-second fade', () => {
    const state = createVision(new World(10, 10));
    pingSonar(state, { x: 0, y: 0 }, 0, 200);
    const point = { x: 100, y: 0 };
    const arrival = SONAR_TRAVEL_TIME / 2;
    expect(sonarOpacity(state, point, arrival - 0.01)).toBe(0);
    expect(sonarOpacity(state, point, arrival + 0.025)).toBeCloseTo(1);
    expect(sonarOpacity(state, point, arrival + 0.25)).toBeGreaterThan(0);
    expect(sonarOpacity(state, point, arrival + 0.25)).toBeLessThan(1);
    expect(sonarOpacity(state, point, arrival + SONAR_OUTLINE_LIFETIME)).toBe(0);
  });

  it('reaches the captured viewport radius at two seconds and never exposes beyond it', () => {
    const state = createVision(new World(10, 10));
    pingSonar(state, { x: 0, y: 0 }, 0, 200);
    expect(sonarOpacity(state, { x: 200, y: 0 }, SONAR_TRAVEL_TIME + 0.025)).toBeCloseTo(1);
    expect(sonarOpacity(state, { x: 201, y: 0 }, SONAR_TRAVEL_TIME + 0.1)).toBe(0);
    expect(sonarOpacity(state, { x: 10, y: 0 }, -1)).toBe(0);
  });
});
