import { describe, expect, it, vi } from 'vitest';
import { World } from './world';
import {
  computeDaylight, createVision, pingSonar, sonarOpacity, sonarTravelDistance, updateVision,
  pingSubsurfaceScanner, subsurfaceScannerOpacity,
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

describe('retained penetrating subsurface scanner', () => {
  it('enforces the cooldown and snapshots the ping origin', () => {
    const state = createVision(new World(10, 10));
    const origin = { x: 20, y: 20 };
    expect(pingSubsurfaceScanner(state, origin, 0, 200)).toBe(true);
    origin.x = 100;
    expect(state.subsurfaceScan?.origin.x).toBe(20);
    expect(pingSubsurfaceScanner(state, origin, SONAR_COOLDOWN - 0.01, 200)).toBe(false);
    expect(pingSubsurfaceScanner(state, origin, SONAR_COOLDOWN, 200)).toBe(true);
  });

  it('reveals each segment when reached, with a fast attack and slower half-second fade', () => {
    const state = createVision(new World(10, 10));
    pingSubsurfaceScanner(state, { x: 0, y: 0 }, 0, 200);
    const point = { x: 100, y: 0 };
    const arrival = SONAR_TRAVEL_TIME / 2;
    expect(subsurfaceScannerOpacity(state, point, arrival - 0.01)).toBe(0);
    expect(subsurfaceScannerOpacity(state, point, arrival + 0.025)).toBeCloseTo(1);
    expect(subsurfaceScannerOpacity(state, point, arrival + 0.25)).toBeGreaterThan(0);
    expect(subsurfaceScannerOpacity(state, point, arrival + 0.25)).toBeLessThan(1);
    expect(subsurfaceScannerOpacity(state, point, arrival + SONAR_OUTLINE_LIFETIME)).toBe(0);
  });

  it('reaches the captured viewport radius at two seconds and never exposes beyond it', () => {
    const state = createVision(new World(10, 10));
    pingSubsurfaceScanner(state, { x: 0, y: 0 }, 0, 200);
    expect(subsurfaceScannerOpacity(state, { x: 200, y: 0 }, SONAR_TRAVEL_TIME + 0.025)).toBeCloseTo(1);
    expect(subsurfaceScannerOpacity(state, { x: 201, y: 0 }, SONAR_TRAVEL_TIME + 0.1)).toBe(0);
    expect(subsurfaceScannerOpacity(state, { x: 10, y: 0 }, -1)).toBe(0);
  });
});

describe('cave sonar navigating connected open space', () => {
  function buriedTerrain(): World {
    const world = new World(24, 24, 4);
    for (let y = 1; y < world.height - 1; y++) {
      for (let x = 1; x < world.width - 1; x++) world.setSolid(x, y, true);
    }
    return world;
  }

  it('does not discover the outline of a sealed water pocket through rock', () => {
    const world = buriedTerrain();
    for (let y = 4; y <= 8; y++) {
      for (let x = 2; x <= 5; x++) world.setSolid(x, y, false);
      for (let x = 9; x <= 12; x++) {
        world.setSolid(x, y, false);
        world.water[world.index(x, y)] = 1;
      }
    }
    const state = createVision(world);
    const origin = { x: 14, y: 26 };
    const sealedEdge = { x: 36, y: 26 };
    expect(pingSonar(world, state, origin, 0, 100)).toBe(true);
    const radialArrival = Math.hypot(sealedEdge.x - origin.x, sealedEdge.y - origin.y) / 100 * SONAR_TRAVEL_TIME;
    expect(sonarOpacity(world, state, sealedEdge, radialArrival + 0.025)).toBe(0);
    expect(pingSubsurfaceScanner(state, origin, 0, 100)).toBe(true);
    expect(subsurfaceScannerOpacity(state, sealedEdge, radialArrival + 0.025)).toBeCloseTo(1);
    expect(state.explored.every((value) => value === 0)).toBe(true);
  });

  it('travels around a tunnel bend instead of using distance through rock', () => {
    const world = buriedTerrain();
    for (let x = 3; x <= 12; x++) world.setSolid(x, 5, false);
    for (let y = 5; y <= 13; y++) world.setSolid(12, y, false);
    const state = createVision(world);
    expect(pingSonar(world, state, { x: 14, y: 22 }, 0, 100)).toBe(true);
    const farEdge = { x: 50, y: 56 };
    const tunnelArrival = (9 * 4 + 8 * 4 + 2) / 100 * SONAR_TRAVEL_TIME;
    expect(sonarOpacity(world, state, farEdge, tunnelArrival - 0.01)).toBe(0);
    expect(sonarOpacity(world, state, farEdge, tunnelArrival + 0.025)).toBeCloseTo(1);
  });

  it('does not pass a diagonal opening between touching solid corners', () => {
    const world = buriedTerrain();
    world.setSolid(3, 5, false);
    world.setSolid(4, 6, false);
    const state = createVision(world);
    pingSonar(world, state, { x: 14, y: 22 }, 0, 100);
    const sealedEdge = { x: 16, y: 26 };
    const radialArrival = Math.hypot(2, 4) / 100 * SONAR_TRAVEL_TIME;
    expect(sonarOpacity(world, state, sealedEdge, radialArrival + 0.025)).toBe(0);
  });

  it('reveals only the reachable side of a thin dividing wall', () => {
    const world = buriedTerrain();
    for (let y = 4; y <= 8; y++) {
      for (const x of [3, 4, 5, 7, 8, 9]) world.setSolid(x, y, false);
    }
    const state = createVision(world);
    pingSonar(world, state, { x: 22, y: 22 }, 0, 100);
    expect(sonarOpacity(world, state, { x: 24, y: 22 }, 2 / 100 * SONAR_TRAVEL_TIME + 0.025)).toBeCloseTo(1);
    expect(sonarOpacity(world, state, { x: 28, y: 22 }, 6 / 100 * SONAR_TRAVEL_TIME + 0.025)).toBe(0);
  });

  it('crosses water in connected tunnels without changing water or exploration', () => {
    const world = buriedTerrain();
    for (let x = 3; x <= 12; x++) {
      world.setSolid(x, 5, false);
      world.water[world.index(x, 5)] = 1;
    }
    const water = world.water.slice();
    const state = createVision(world);
    pingSonar(world, state, { x: 14, y: 22 }, 0, 100);
    expect(sonarOpacity(world, state, { x: 52, y: 22 }, 38 / 100 * SONAR_TRAVEL_TIME + 0.025)).toBeCloseTo(1);
    expect(world.water).toEqual(water);
    expect(state.explored.every((value) => value === 0)).toBe(true);
    expect(state.visible.every((value) => value === 0)).toBe(true);
  });

  it('updates a pulse route after digging opens or closes a connection', () => {
    const world = buriedTerrain();
    for (const x of [3, 4, 5, 6, 8, 9, 10]) world.setSolid(x, 5, false);
    const state = createVision(world);
    pingSonar(world, state, { x: 14, y: 22 }, 0, 100);
    const edge = { x: 44, y: 22 };
    const arrival = 30 / 100 * SONAR_TRAVEL_TIME;
    expect(sonarOpacity(world, state, edge, arrival + 0.025)).toBe(0);
    world.setSolid(7, 5, false);
    expect(sonarOpacity(world, state, edge, arrival + 0.025)).toBeCloseTo(1);
    world.setSolid(7, 5, true);
    expect(sonarOpacity(world, state, edge, arrival + 0.025)).toBe(0);
  });

  it('caches the open-space search for repeated segment and wavefront queries', () => {
    const world = undergroundRoom(30, 30);
    const state = createVision(world);
    pingSonar(world, state, { x: 22, y: 22 }, 0, 100);
    const solidQueries = vi.spyOn(world, 'isSolid');
    expect(sonarTravelDistance(world, state, { x: 50, y: 50 })).toBe(56);
    expect(solidQueries.mock.calls.length).toBeGreaterThan(100);
    solidQueries.mockClear();
    expect(sonarTravelDistance(world, state, { x: 50, y: 50 })).toBe(56);
    expect(solidQueries.mock.calls.length).toBeLessThan(10);
    world.setSolid(10, 10, true);
    solidQueries.mockClear();
    expect(sonarTravelDistance(world, state, { x: 50, y: 50 })).toBe(56);
    expect(solidQueries.mock.calls.length).toBeGreaterThan(100);
    solidQueries.mockRestore();
  });

  it('keeps the cave and subsurface scanner cooldowns and pulse origins independent', () => {
    const world = undergroundRoom();
    const state = createVision(world);
    const origin = { x: 22, y: 22 };
    expect(pingSonar(world, state, origin, 0, 100)).toBe(true);
    expect(pingSubsurfaceScanner(state, origin, 0, 100)).toBe(true);
    origin.x = 30;
    expect(state.sonar?.origin.x).toBe(22);
    expect(state.subsurfaceScan?.origin.x).toBe(22);
    expect(pingSonar(world, state, origin, SONAR_COOLDOWN - 0.01, 100)).toBe(false);
    expect(pingSonar(world, state, origin, SONAR_COOLDOWN, 100)).toBe(true);
    expect(state.subsurfaceScan?.startedAt).toBe(0);
    expect(state.lastSubsurfaceScanAt).toBe(0);
  });

  it('keeps two-second travel, fast appearance, and half-second edge fading along a tunnel', () => {
    const world = buriedTerrain();
    for (let x = 3; x <= 12; x++) world.setSolid(x, 5, false);
    const state = createVision(world);
    pingSonar(world, state, { x: 14, y: 22 }, 0, 38);
    const edge = { x: 52, y: 22 };
    expect(sonarOpacity(world, state, edge, SONAR_TRAVEL_TIME - 0.01)).toBe(0);
    expect(sonarOpacity(world, state, edge, SONAR_TRAVEL_TIME + 0.025)).toBeCloseTo(1);
    expect(sonarOpacity(world, state, edge, SONAR_TRAVEL_TIME + 0.25)).toBeGreaterThan(0);
    expect(sonarOpacity(world, state, edge, SONAR_TRAVEL_TIME + 0.25)).toBeLessThan(1);
    expect(sonarOpacity(world, state, edge, SONAR_TRAVEL_TIME + SONAR_OUTLINE_LIFETIME)).toBe(0);
    expect(sonarOpacity(world, state, { x: 51.5, y: 20 }, SONAR_TRAVEL_TIME + 0.025)).toBe(0);
    expect(sonarOpacity(world, state, edge, -1)).toBe(0);
  });

  it('rejects blocked or invalid origins without consuming the cave sonar cooldown', () => {
    const world = buriedTerrain();
    world.setSolid(3, 5, false);
    const state = createVision(world);
    for (const position of [{ x: 10, y: 10 }, { x: -1, y: 22 }, { x: 200, y: 22 }, { x: NaN, y: 22 }]) {
      expect(pingSonar(world, state, position, 0, 100)).toBe(false);
    }
    expect(state.sonar).toBeNull();
    expect(state.lastSonarAt).toBe(-SONAR_COOLDOWN);
    expect(pingSonar(world, state, { x: 14, y: 22 }, 0, 100)).toBe(true);
    expect(sonarTravelDistance(world, state, { x: NaN, y: 22 })).toBe(Infinity);
    expect(sonarTravelDistance(world, state, { x: -1, y: 22 })).toBe(Infinity);
    expect(sonarOpacity(world, state, { x: 14, y: 22 }, 0.025)).toBe(0);
  });
});
