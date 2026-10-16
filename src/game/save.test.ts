import { describe, expect, it } from 'vitest';
import { createSession, DEMO_DELIVERY_LIMIT, type SessionOptions } from './session';
import { collectIntoTank, buyUpgrade } from './economy';
import { totalWater } from './water';
import { deserializeSession, serializeSession } from './save';
import { setDevCredits, setOmniVision } from './dev-tools';
import { World } from './world';
import type { Session } from './session';

/** Real array-based v1 fixtures keep backward compatibility independent of the current writer. */
function serializeLegacySession(session: Session): string {
  const { world, explored, ...state } = session;
  return JSON.stringify({ version: 1,
    world: { width: world.width, height: world.height, cellSize: world.cellSize,
      solid: Array.from(world.solid), material: Array.from(world.material),
      damage: Array.from(world.damage), water: Array.from(world.water) },
    session: { ...state, explored: Array.from(explored) },
  });
}

/** Most format-corruption cases use an earlier small world; deep saves have their own round-trip check. */
function createShallowSession(options: SessionOptions = {}): Session {
  const session = createSession(options);
  const world = new World(384, 256, 4);
  for (const key of ['solid', 'material', 'damage', 'water'] as const) world[key].set(session.world[key].subarray(0, world[key].length));
  const bottom = (world.height - 1) * world.width;
  world.solid.fill(1, bottom); world.material.fill(2, bottom);
  world.damage.fill(0, bottom); world.water.fill(0, bottom);
  session.world = world;
  session.explored = session.explored.slice(0, world.solid.length);
  session.initialWater = totalWater(world);
  return session;
}

describe('compact deep-world saves', () => {
  it('round-trips a 2000-metre site well below the browser storage quota without quantizing water', () => {
    const session = createSession({ seed: 42 });
    const world = new World(384, 2053, 4);
    // Keep a realistic mostly-solid deep world, retaining the playable original top.
    world.solid.fill(1); world.material.fill(2);
    world.solid.set(session.world.solid.subarray(0, Math.min(world.solid.length, session.world.solid.length)));
    world.material.set(session.world.material.subarray(0, Math.min(world.material.length, session.world.material.length)));
    world.damage.set(session.world.damage.subarray(0, Math.min(world.damage.length, session.world.damage.length)));
    world.water.set(session.world.water.subarray(0, Math.min(world.water.length, session.world.water.length)));
    session.world = world;
    session.explored = new Uint8Array(world.solid.length);
    const waterIndex = world.water.findIndex(amount => amount > 0);
    world.water[waterIndex] = Math.fround(0.123456789);
    session.initialWater = totalWater(world);
    const save = serializeSession(session);
    expect(save.length * 2).toBeLessThan(2 * 1024 * 1024);
    expect(JSON.parse(save).version).toBe(2);
    const restored = deserializeSession(save);
    expect(restored.world.height).toBe(2053);
    expect(restored.world.material).toEqual(world.material);
    expect(restored.world.water).toEqual(world.water);
    expect(restored.explored).toEqual(session.explored);
    expect(restored.initialWater).toBe(session.initialWater);
    const altered = JSON.parse(save);
    altered.session.tank.water = 1;
    expect(() => deserializeSession(JSON.stringify(altered))).toThrow(/water ledger mismatch/);
  });

  it('rejects malformed encoded runs before restoring terrain', () => {
    const data = JSON.parse(serializeSession(createSession({ seed: 42 })));
    for (const grid of [null, { encoding: 'rle', runs: [0, 0] },
      { encoding: 'rle', runs: [0, -1] }, { encoding: 'rle', runs: [0, 0.5] },
      { encoding: 'rle', runs: [0, data.world.width * data.world.height + 1] },
      { encoding: 'rle', runs: [0, 1, 1] }, { encoding: 'rle', runs: [0, 1] },
      { encoding: 'rle', runs: [0.5, data.world.width * data.world.height] },
      { encoding: 'other', runs: [0, 1] }]) {
      data.world.solid = grid;
      expect(() => deserializeSession(JSON.stringify(data))).toThrow(/solid cells/);
    }
  });

  it('retains the health and partial damage of sand, earth, basalt and granite', () => {
    const session = createSession({ seed: 42 });
    for (const [material, damage] of [[4, 0.5], [1, 2], [5, 9], [6, 15]] as const) {
      const index = session.world.index(300, 150 + material);
      session.world.setMaterial(300, 150 + material, material);
      session.world.damage[index] = damage;
    }
    const restored = deserializeSession(serializeSession(session));
    expect(restored.world.material).toEqual(session.world.material);
    expect(restored.world.damage).toEqual(session.world.damage);
  });

  it('preserves a spent double jump and wall-chain state across save/load', () => {
    const session = createSession({ seed: 42 });
    setDevCredits(session, 1000);
    expect(buyUpgrade(session.tank, 'doubleJump')).toBe(true);
    for (const id of ['jumpPower', 'climbSpeed'] as const) {
      for (let level = 0; level < 7; level++) expect(buyUpgrade(session.tank, id)).toBe(true);
    }
    session.player.airJumpAvailable = false;
    session.player.wallJumpChain = true;
    session.player.vy = -200;
    const restored = deserializeSession(serializeSession(session));
    expect(restored.tank.upgrades.doubleJump).toBe(1);
    expect(restored.tank.upgrades).toMatchObject({ jumpPower: 7, climbSpeed: 7 });
    expect(restored.player).toEqual(session.player);
  });

  it('migrates earlier shallow worlds without resizing, granting equipment or replenishing an airborne jump', () => {
    const original = createSession({ seed: 42 });
    const world = new World(384, 256, 4);
    for (const key of ['solid', 'material', 'damage', 'water'] as const) {
      world[key].set(original.world[key].subarray(0, world[key].length));
    }
    const bottom = (world.height - 1) * world.width;
    world.solid.fill(1, bottom); world.material.fill(2, bottom);
    world.damage.fill(0, bottom); world.water.fill(0, bottom);
    original.world = world;
    original.explored = original.explored.slice(0, world.solid.length);
    original.initialWater = totalWater(world);
    original.player.vy = -200;
    const data = JSON.parse(serializeLegacySession(original));
    delete data.session.player.airJumpAvailable;
    delete data.session.player.wallJumpChain;
    delete data.session.tank.upgrades.jumpPower;
    delete data.session.tank.upgrades.doubleJump;
    const restored = deserializeSession(JSON.stringify(data));
    expect(restored.world.height).toBe(256);
    expect(restored.world.material).toEqual(world.material);
    expect(restored.world.water).toEqual(world.water);
    expect(restored.player.airJumpAvailable).toBe(false);
    expect(restored.player.wallJumpChain).toBe(true);
    expect(restored.player.vy).toBe(-200);
    expect(restored.tank.upgrades).toMatchObject({ jumpPower: 0, doubleJump: 0 });
  });

  it('rejects invalid jump state and levels beyond the seven mobility purchases', () => {
    for (const [field, value] of [['airJumpAvailable', 1], ['wallJumpChain', null]] as const) {
      expect(() => deserializeSession(corrupt(data => data.session.player[field] = value))).toThrow(/player jump state/);
    }
    for (const [id, value] of [['jumpPower', 8], ['climbSpeed', 8], ['doubleJump', 2]] as const) {
      expect(() => deserializeSession(corrupt(data => data.session.tank.upgrades[id] = value))).toThrow(/upgrade level/);
    }
  });
});

function stockedSession(waterDistribution?: SessionOptions['waterDistribution']) {
  const session = createShallowSession({ seed: 42, caveMemory: 'sonar', headlamp: 'mouse', waterDistribution });
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
  const solidIndex = session.world.solid.findIndex((value, index) => value > 0
    && session.world.material[index] !== 3 && index > session.world.width * 50 && index % session.world.width > 2);
  session.world.damage[solidIndex] = 0.5;
  return session;
}

function corrupt(change: (data: any) => void) {
  const data = JSON.parse(serializeLegacySession(createShallowSession({seed:2})));
  change(data);
  return JSON.stringify(data);
}

describe('versioned local saves', () => {
  it('round-trips heavily damaged stone while keeping its remaining durability and terrain intact', () => {
    const session = stockedSession();
    const stone = session.world.material.findIndex(material => material === 2);
    session.world.damage[stone] = 5;
    const restored = deserializeSession(serializeSession(session));
    expect(restored.world.damage[stone]).toBe(5);
    expect(restored.world.material).toEqual(session.world.material);
    expect(restored.world.water).toEqual(session.world.water);
    expect(totalWater(restored.world) + restored.tank.water + restored.delivered).toBeCloseTo(restored.initialWater, 5);
  });

  it('preserves legacy partial stone damage and rejects terrain already beyond its durability', () => {
    const session = stockedSession();
    const stone = session.world.material.findIndex(material => material === 2);
    const earth = session.world.material.findIndex(material => material === 1);
    session.world.damage[stone] = 2;
    expect(deserializeSession(serializeSession(session)).world.damage[stone]).toBe(2);
    const brokenStone = JSON.parse(serializeLegacySession(session));
    brokenStone.world.damage[stone] = 6;
    expect(() => deserializeSession(JSON.stringify(brokenStone))).toThrow(/broken terrain left solid/);
    const brokenEarth = JSON.parse(serializeLegacySession(session));
    brokenEarth.world.damage[earth] = 3;
    expect(() => deserializeSession(JSON.stringify(brokenEarth))).toThrow(/broken terrain left solid/);
    brokenStone.world.damage[stone] = 6.1;
    expect(() => deserializeSession(JSON.stringify(brokenStone))).toThrow(/broken terrain left solid/);
  });

  it('round-trips reinforced foundation with its indestructibility and water ledger intact', () => {
    const session = createShallowSession({ seed: 42 });
    session.world.setMaterial(30, 30, 3);
    const restored = deserializeSession(serializeSession(session));
    expect(restored.world.material).toEqual(session.world.material);
    expect(restored.world.solid).toEqual(session.world.solid);
    restored.world.setSolid(30, 30, false);
    expect(restored.world.material[restored.world.index(30, 30)]).toBe(3);
    expect(totalWater(restored.world)).toBeCloseTo(restored.initialWater, 5);
  });

  it('rejects damaged reinforced foundation and unknown terrain materials in saves', () => {
    expect(() => deserializeSession(corrupt(data => {
      const index = data.world.width * 30 + 30;
      data.world.solid[index] = 1;
      data.world.material[index] = 3;
      data.world.damage[index] = 0.1;
    }))).toThrow(/foundation/);
    expect(() => deserializeSession(corrupt(data => data.world.material[0] = 7))).toThrow(/terrain materials/);
  });

  it('preserves a saved earlier world without adding a foundation or moving its machine', () => {
    const data = JSON.parse(serializeLegacySession(createShallowSession({ seed: 42 })));
    // Earlier sites have ordinary earth in this strip; loading uses their actual
    // stored terrain rather than upgrading them to the new generated layout.
    for (let y = 44; y < data.world.height - 1; y++) {
      for (let x = 1; x < 24; x++) {
        const index = y * data.world.width + x;
        data.world.solid[index] = 1;
        data.world.material[index] = 1;
        data.world.damage[index] = 0;
      }
    }
    data.session.hopper = { x: 160, y: 120 };
    const restored = deserializeSession(JSON.stringify(data));
    expect(Array.from(restored.world.material)).toEqual(data.world.material);
    expect(Array.from(restored.world.water)).toEqual(data.world.water);
    expect(restored.hopper).toEqual(data.session.hopper);
  });

  it('migrates remembered caves to dark caves while preserving every other saved field', () => {
    const session = stockedSession();
    expect(buyUpgrade(session.tank, 'sonar')).toBe(true);
    session.subsurfaceScan = { origin: { x: 180, y: 120 }, startedAt: 7, maxRadius: 600 };
    session.lastSubsurfaceScanAt = 7;
    session.tank.upgrades.subsurfaceScanner = 1;
    const earlier = JSON.parse(serializeLegacySession(session));
    earlier.session.options.caveMemory = 'remembered';
    const restored = deserializeSession(JSON.stringify(earlier));
    expect(restored.options.caveMemory).toBe('sonar');
    expect(JSON.parse(serializeLegacySession(restored))).toEqual({ ...earlier,
      session: { ...earlier.session, options: { ...earlier.session.options, caveMemory: 'sonar' } } });
    expect(totalWater(restored.world) + restored.tank.water + restored.delivered).toBeCloseTo(restored.initialWater, 5);
  });

  it('round-trips the selected dark-cave mode for new expeditions', () => {
    const session = createShallowSession({ seed: 42 });
    expect(deserializeSession(serializeSession(session)).options.caveMemory).toBe('sonar');
  });

  it('rejects invalid cave-memory options instead of silently migrating corrupt data', () => {
    for (const caveMemory of [null, 'unknown', '', 1, ['sonar']]) {
      expect(() => deserializeSession(corrupt(data => data.session.options.caveMemory = caveMemory))).toThrow(/comparison options/);
    }
  });

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
    const earlier = JSON.parse(serializeLegacySession(session));
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

  it('round-trips the selected depth-weighted distribution for new expeditions', () => {
    const session = createShallowSession({ seed: 42 });
    const restored = deserializeSession(serializeSession(session));
    expect(restored.options.waterDistribution).toBe('depth-weighted');
    expect(restored.world.solid).toEqual(session.world.solid);
    expect(restored.world.water).toEqual(session.world.water);
    expect(totalWater(restored.world) + restored.tank.water + restored.delivered).toBeCloseTo(restored.initialWater, 5);
  });

  it('accepts depth-weighted save metadata without regenerating its serialized site', () => {
    const session = stockedSession();
    const data = JSON.parse(serializeLegacySession(session));
    data.session.options.waterDistribution = 'depth-weighted';
    const restored = deserializeSession(JSON.stringify(data));
    expect(restored.options.waterDistribution).toBe('depth-weighted');
    expect(restored.world.solid).toEqual(session.world.solid);
    expect(restored.world.water).toEqual(session.world.water);
    expect(restored.tank).toEqual(session.tank);
    expect(restored.delivered).toBe(session.delivered);
    expect(totalWater(restored.world) + restored.tank.water + restored.delivered).toBeCloseTo(restored.initialWater, 5);
  });

  it.each(['many-small', 'fewer-large'] as const)('preserves legacy %s metadata with its actual site and water ledger', waterDistribution => {
    const session = stockedSession(waterDistribution);
    const data = JSON.parse(serializeLegacySession(session));
    data.session.options.waterDistribution = waterDistribution;
    const restored = deserializeSession(JSON.stringify(data));
    expect(restored.options.waterDistribution).toBe(waterDistribution);
    expect(restored.world.solid).toEqual(session.world.solid);
    expect(restored.world.material).toEqual(session.world.material);
    expect(restored.world.damage).toEqual(session.world.damage);
    expect(restored.world.water).toEqual(session.world.water);
    expect(restored.tank).toEqual(session.tank);
    expect(restored.delivered).toBe(session.delivered);
    expect(restored.player).toEqual(session.player);
    expect(restored.explored).toEqual(session.explored);
    expect(totalWater(restored.world) + restored.tank.water + restored.delivered).toBeCloseTo(restored.initialWater, 5);
  });

  it('migrates earlier v1 comparison choices while preserving their serialized world and progress', () => {
    const session = stockedSession();
    const earlier = JSON.parse(serializeLegacySession(session));
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

  it('migrates the retired one-cell step comparison to two cells without replacing saved terrain', () => {
    const session = stockedSession();
    const earlier = JSON.parse(serializeLegacySession(session));
    earlier.session.options.stepHeightCells = 1;
    const restored = deserializeSession(JSON.stringify(earlier));
    expect(restored.options.stepHeightCells).toBe(2);
    expect(restored.world.material).toEqual(session.world.material);
    expect(restored.world.water).toEqual(session.world.water);
    expect(restored.player).toEqual(session.player);
    delete earlier.session.options.stepHeightCells;
    expect(deserializeSession(JSON.stringify(earlier)).options.stepHeightCells).toBe(2);
  });

  it('loads earlier v1 equipment without a speed upgrade and preserves in-flight base swing timing', () => {
    const session = stockedSession();
    const earlier = JSON.parse(serializeLegacySession(session));
    delete earlier.session.tank.upgrades.digSpeed;
    earlier.session.digCooldown = 0.44;
    earlier.session.strikeTime = 0.10;
    const restored = deserializeSession(JSON.stringify(earlier));
    expect(restored.tank.upgrades.digSpeed).toBe(0);
    expect(restored.digCooldown).toBe(0.44);
    expect(restored.strikeTime).toBe(0.10);
    expect(restored.world.material).toEqual(session.world.material);
    expect(restored.world.water).toEqual(session.world.water);
    expect(restored.tank.upgrades.digRadius).toBe(session.tank.upgrades.digRadius);
  });

  it('round-trips all expanded mining levels and a faster pending swing', () => {
    const session = stockedSession();
    setDevCredits(session, 1000);
    for (const [id, count] of [['digRadius', 7], ['digDamage', 3], ['digSpeed', 3]] as const) {
      for (let level = 0; level < count; level++) expect(buyUpgrade(session.tank, id)).toBe(true);
    }
    session.digCooldown = 0.14;
    session.strikeTime = 0.02;
    const restored = deserializeSession(serializeSession(session));
    expect(restored.tank.upgrades).toMatchObject({ digRadius: 7, digDamage: 3, digSpeed: 3 });
    expect(restored.digCooldown).toBe(0.14);
    expect(restored.strikeTime).toBe(0.02);
    expect(restored.world.water).toEqual(session.world.water);
    expect(restored.tank.water + restored.delivered + totalWater(restored.world)).toBeCloseTo(restored.initialWater, 5);
  });

  it('rejects over-cap mining levels and corrupt pick timers while accepting an older slower swing after a speed purchase', () => {
    for (const [id, level] of [['digRadius', 8], ['digDamage', 4], ['digSpeed', 4]] as const) {
      expect(() => deserializeSession(corrupt(data => data.session.tank.upgrades[id] = level))).toThrow(/upgrade level/);
    }
    for (const [key, value] of [['digCooldown', 0.49], ['strikeTime', 0.13], ['strikeTime', -0.5]] as const) {
      expect(() => deserializeSession(corrupt(data => data.session[key] = value))).toThrow(/pick timing/);
    }
    const session = stockedSession();
    setDevCredits(session, 1000);
    buyUpgrade(session.tank, 'digSpeed');
    session.digCooldown = 0.44; session.strikeTime = 0.10;
    expect(deserializeSession(serializeSession(session)).digCooldown).toBe(0.44);
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
    const earlier = JSON.parse(serializeLegacySession(stockedSession()));
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
    const session = createShallowSession();
    setDevCredits(session, 1000);
    const damaged = JSON.parse(serializeLegacySession(session));
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
    const session = createShallowSession();
    let remaining = DEMO_DELIVERY_LIMIT;
    for (let i = 0; i < session.world.water.length && remaining > 0; i++) {
      const amount = Math.min(remaining,session.world.water[i]);
      session.world.water[i] -= amount; remaining -= amount;
    }
    session.delivered = DEMO_DELIVERY_LIMIT; session.completed = true;
    expect(deserializeSession(serializeSession(session)).completed).toBe(true);
  });

  it('round-trips falling dirt and accepts earlier v1 saves without it', () => {
    const session = createShallowSession({ seed: 42 });
    session.fallingDirt = [{ x: 240, y: 80.25, vy: 120 }];
    const restored = deserializeSession(serializeSession(session));
    expect(restored.fallingDirt).toEqual(session.fallingDirt);
    expect(restored.fallingDirt).not.toBe(session.fallingDirt);
    const earlier = JSON.parse(serializeLegacySession(session));
    delete earlier.session.fallingDirt;
    expect(deserializeSession(JSON.stringify(earlier)).fallingDirt).toEqual([]);
  });

  it('clears pre-existing small dirt obstacles once when loading an earlier active save', () => {
    const session = createShallowSession({ seed: 42 });
    for (let x = 60; x < 63; x++) session.world.setMaterial(x, 20, 1);
    const earlier = JSON.parse(serializeLegacySession(session));
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
