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
    expect(light[world.index(5, 9)]).toBeGreaterThan(0);
    expect(light[world.index(5, 9)]).toBeLessThan(light[world.index(5, 4)]);
    expect(light[world.index(6, 9)]).toBeGreaterThan(0);
    expect(light[world.index(6, 9)]).toBeLessThan(light[world.index(5, 9)]);
  });

  it('attenuates sky light down a narrow shaft instead of making its entire depth a light source', () => {
    const world = new World(100, 100, 4);
    for (let y = 10; y < 99; y++) {
      for (let x = 1; x < 99; x++) world.setSolid(x, y, true);
    }
    for (let y = 10; y < 90; y++) world.setSolid(50, y, false);
    const light = computeDaylight(world);
    expect(light[world.index(50, 8)]).toBe(1);
    expect(light[world.index(50, 35)]).toBeLessThan(0.5);
    expect(light[world.index(50, 75)]).toBeLessThan(0.1);
    expect(light[world.index(50, 75)]).toBeLessThan(light[world.index(50, 35)]);
  });

  it('moves the illuminated surface down when a broad excavation opens to the sky', () => {
    const world = new World(100, 100, 4);
    for (let y = 10; y < 99; y++) {
      for (let x = 1; x < 99; x++) world.setSolid(x, y, true);
    }
    const index = world.index(50, 49);
    expect(computeDaylight(world)[index]).toBe(0);
    for (let y = 10; y <= 50; y++) {
      for (let x = 15; x <= 85; x++) world.setSolid(x, y, false);
    }
    expect(computeDaylight(world)[index]).toBe(1);
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
  it('keeps independent moon and warm-lamp fields, with lamps only increasing total brightness', () => {
    const world = new World(40, 40, 4);
    for (let y = 10; y < 39; y++) {
      for (let x = 1; x < 39; x++) world.setSolid(x, y, true);
    }
    for (let y = 10; y < 35; y++) world.setSolid(20, y, false);
    const state = createVision(world);
    const input = {
      position: { x: 82, y: 82 }, aim: { x: 82, y: 120 }, facing: 1 as const,
      time: 0,
    };
    updateVision(world, state, { ...input, torsoRadius: 0, headlampRange: 0 });
    const unlit = state.light.slice();
    updateVision(world, state, input);
    const index = world.index(20, 22);
    expect(state.moonlight[index]).toBeGreaterThan(0);
    expect(state.lamplight[index]).toBeGreaterThan(0);
    expect(state.light[index]).toBeCloseTo(Math.min(1, state.moonlight[index] + state.lamplight[index]));
    for (let cell = 0; cell < state.light.length; cell++) {
      expect(state.light[cell]).toBeGreaterThanOrEqual(unlit[cell]);
    }
  });

  it.each(['headlamp', 'torso'] as const)('subdues the %s in bright surface light while retaining its strength in a roofed room', (lamp) => {
    const world = new World(40, 40, 4);
    const state = createVision(world);
    const input = {
      position: { x: 50, y: 50 }, aim: { x: 100, y: 50 }, facing: 1 as const,
      time: 0,
      torsoRadius: lamp === 'torso' ? 55 : 0,
      headlampRange: lamp === 'headlamp' ? 180 : 0,
    };
    const index = world.index(15, 12);
    updateVision(world, state, input);
    expect(state.moonlight[index]).toBe(1);
    const surfaceLamp = state.lamplight[index];
    for (let x = 1; x < world.width - 1; x++) world.setSolid(x, 3, true);
    updateVision(world, state, input);
    expect(state.moonlight[index]).toBe(0);
    expect(state.lamplight[index]).toBeGreaterThan(0.6);
    expect(surfaceLamp).toBeLessThan(state.lamplight[index] * 0.15);
  });

  it('smoothly restores lamp strength as ambient light fades down a shaft', () => {
    const world = new World(100, 100, 4);
    for (let y = 10; y < 99; y++) {
      for (let x = 1; x < 99; x++) world.setSolid(x, y, true);
    }
    for (let y = 10; y < 90; y++) world.setSolid(50, y, false);
    const state = createVision(world);
    const input = {
      position: { x: 202, y: 34 }, aim: { x: 202, y: 390 }, facing: 1 as const,
      time: 0, torsoRadius: 0, headlampRange: 400,
    };
    const indexes = [12, 25, 50, 85].map((y) => world.index(50, y));
    updateVision(world, state, input);
    const ambient = indexes.map((index) => state.moonlight[index]);
    const illuminated = indexes.map((index) => state.lamplight[index]);
    // Closing the distant entrance changes ambient exposure without changing
    // any lamp-to-target ray, giving the undimmed baseline for each distance.
    for (let x = 1; x < world.width - 1; x++) world.setSolid(x, 3, true);
    updateVision(world, state, input);
    for (const index of indexes) expect(state.moonlight[index]).toBe(0);
    const ratios = indexes.map((index, offset) => illuminated[offset] / state.lamplight[index]);
    expect(ambient[0]).toBeGreaterThan(0.8);
    expect(ambient[3]).toBeLessThan(0.02);
    expect(ratios[0]).toBeLessThan(0.4);
    expect(ratios[1]).toBeGreaterThan(ratios[0]);
    expect(ratios[2]).toBeGreaterThan(ratios[1]);
    expect(ratios[3]).toBeGreaterThan(ratios[2]);
    expect(ratios[3]).toBeGreaterThan(0.95);
    expect(ratios.every((ratio) => ratio >= 0 && ratio <= 1)).toBe(true);
  });

  it('still illuminates a dark target when the player stands in bright surface light', () => {
    const world = new World(100, 100, 4);
    for (let y = 10; y < 99; y++) {
      for (let x = 1; x < 99; x++) world.setSolid(x, y, true);
    }
    for (let y = 10; y < 90; y++) world.setSolid(50, y, false);
    const state = createVision(world);
    updateVision(world, state, {
      position: { x: 202, y: 34 }, aim: { x: 202, y: 390 }, facing: 1,
      time: 0, torsoRadius: 0, headlampRange: 400,
    });
    expect(state.moonlight[world.index(50, 8)]).toBe(1);
    expect(state.moonlight[world.index(50, 85)]).toBeLessThan(0.02);
    expect(state.lamplight[world.index(50, 85)]).toBeGreaterThan(0.4);
    expect(state.visible[world.index(50, 85)]).toBe(1);
  });

  it('emits and aims the headlamp from the helmet instead of the torso', () => {
    const world = undergroundRoom(30, 30);
    for (let y = 9; y < 27; y++) world.setSolid(11, y, true);
    const state = createVision(world);
    updateVision(world, state, {
      position: { x: 42, y: 42 }, headPosition: { x: 42, y: 34 },
      aim: { x: 100, y: 34 }, facing: 1, time: 0,
      torsoRadius: 0, headlampRange: 80, headlampHalfAngle: 0.1,
    });
    expect(state.visible[world.index(16, 8)]).toBe(1);
    expect(state.visible[world.index(16, 10)]).toBe(0);
  });

  it('always follows mouse aim independently of character facing and torso light', () => {
    const world = undergroundRoom();
    const state = createVision(world);
    const input = {
      position: { x: 200, y: 100 }, aim: { x: 0, y: 100 }, facing: 1 as const,
      time: 0, torsoRadius: 16, headlampRange: 120,
    };
    updateVision(world, state, input);
    expect(state.visible[world.index(70, 25)]).toBe(0);
    expect(state.visible[world.index(29, 25)]).toBe(1);
    updateVision(world, state, { ...input, facing: -1, time: 1 });
    expect(state.visible[world.index(70, 25)]).toBe(0);
    expect(state.visible[world.index(29, 25)]).toBe(1);
    updateVision(world, state, { ...input, aim: { x: 350, y: 100 }, time: 2 });
    expect(state.visible[world.index(70, 25)]).toBe(1);
    expect(state.visible[world.index(29, 25)]).toBe(0);
  });

  it('blocks lamp visibility behind rock while showing its first surface', () => {
    const world = undergroundRoom();
    for (let y = 3; y < world.height - 3; y++) world.setSolid(60, y, true);
    world.water[world.index(62, 25)] = 1;
    const state = createVision(world);
    updateVision(world, state, {
      position: { x: 200, y: 100 }, aim: { x: 350, y: 100 }, facing: 1,
      time: 0,
    });
    expect(state.visible[world.index(60, 25)]).toBe(1);
    expect(state.lamplight[world.index(60, 25)]).toBeGreaterThan(0);
    expect(state.visible[world.index(62, 25)]).toBe(0);
    expect(state.lamplight[world.index(62, 25)]).toBe(0);
    expect(state.moonlight[world.index(62, 25)]).toBe(0);
    expect(state.explored[world.index(62, 25)]).toBe(0);
  });

  it('does not shine diagonally through touching solid corners', () => {
    const world = undergroundRoom(20, 20);
    world.setSolid(10, 9, true);
    world.setSolid(9, 10, true);
    const state = createVision(world);
    updateVision(world, state, {
      position: { x: 38, y: 38 }, aim: { x: 60, y: 60 }, facing: 1,
      time: 0,
    });
    expect(state.visible[world.index(10, 10)]).toBe(0);
  });

  it('retains exploration after a lamp moves away and preserves the save array reference', () => {
    const world = undergroundRoom();
    const exploration = new Uint8Array(world.width * world.height);
    const state = createVision(world, exploration);
    expect(state.explored).toBe(exploration);
    const input = { position: { x: 200, y: 100 }, aim: { x: 350, y: 100 },
      facing: 1 as const, time: 0 };
    updateVision(world, state, input);
    const index = world.index(75, 25);
    expect(state.visible[index]).toBe(1);
    updateVision(world, state, { ...input, aim: { x: 0, y: 100 }, time: 1 });
    expect(state.visible[index]).toBe(0);
    expect(exploration[index]).toBe(1);
  });

  it('provides full debug visibility without permanently exploring the entire site', () => {
    const world = undergroundRoom();
    const state = createVision(world);
    updateVision(world, state, {
      position: { x: 200, y: 100 }, aim: { x: 350, y: 100 }, facing: 1,
      time: 0, debugVision: true,
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
