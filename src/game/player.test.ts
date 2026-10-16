import { describe, expect, it } from 'vitest';
import { createPlayer, stepPlayer, type PlayerInput } from './player';
import { World } from './world';

const idle: PlayerInput = { left: false, right: false, up: false, down: false, jumpPressed: false };

function room(): World {
  const world = new World(80, 60, 4);
  for (let y = 50; y < 60; y++) {
    for (let x = 0; x < 80; x++) world.setSolid(x, y, true);
  }
  return world;
}

function wall(world: World, cellX: number): void {
  for (let y = 1; y < 50; y++) world.setSolid(cellX, y, true);
}

function tick(world: World, player: ReturnType<typeof createPlayer>, input: Partial<PlayerInput> = {}, count = 1): void {
  for (let i = 0; i < count; i++) {
    stepPlayer(world, player, { ...idle, ...input, jumpPressed: i === 0 && !!input.jumpPressed }, 1 / 60);
  }
}

function rightAttached() {
  const world = room();
  wall(world, 30);
  const player = createPlayer(100, 100);
  tick(world, player, { right: true }, 4);
  expect(player.wall).toBe(1);
  return { world, player };
}

/** A connected excavated face with isolated teeth and two-cell recesses/ledges. */
function roughWall(world: World, side: -1 | 1): void {
  for (let y = 5; y < 50; y++) {
    const offset = y >= 18 && y < 25 ? 2 : y >= 32 && y < 39 ? -2 : y % 2;
    const face = 30 + side * offset;
    for (let x = side < 0 ? 1 : face; x <= (side < 0 ? face : 78); x++) world.setSolid(x, y, true);
  }
}

function expectOutsideTerrain(world: World, player: ReturnType<typeof createPlayer>): void {
  for (let y = Math.floor(player.y / 4); y <= Math.floor((player.y + player.height - 0.001) / 4); y++) {
    for (let x = Math.floor(player.x / 4); x <= Math.floor((player.x + player.width - 0.001) / 4); x++) {
      expect(world.isSolid(x, y), `Player overlaps terrain at ${x},${y}`).toBe(false);
    }
  }
}

describe('player movement', () => {
  it('creates the specified player dimensions', () => {
    const player = createPlayer(80, 168);
    expect(player).toMatchObject({ x: 80, y: 168, width: 16, height: 32, wall: 0 });
  });

  it('moves along the ground and remains grounded', () => {
    const world = room();
    const player = createPlayer(80, 168);
    tick(world, player, { right: true }, 30);
    expect(player.x).toBeGreaterThan(140);
    expect(player.y).toBeCloseTo(168, 5);
    expect(player.grounded).toBe(true);
    expect(player.wall).toBe(0);
  });

  it('makes a small jump from the ground and lands again', () => {
    const world = room();
    const player = createPlayer(80, 168);
    tick(world, player);
    tick(world, player, { jumpPressed: true });
    expect(player.vy).toBeLessThan(0);
    expect(player.grounded).toBe(false);
    let highest = player.y;
    for (let i = 0; i < 100; i++) {
      tick(world, player);
      highest = Math.min(highest, player.y);
    }
    expect(168 - highest).toBeGreaterThan(25);
    expect(168 - highest).toBeLessThan(60);
    expect(player.y).toBeCloseTo(168, 5);
    expect(player.grounded).toBe(true);
  });

  it('allows horizontal steering in the air', () => {
    const world = room();
    const player = createPlayer(80, 80);
    tick(world, player, { right: true }, 10);
    const movedRight = player.x;
    tick(world, player, { left: true }, 10);
    expect(movedRight).toBeGreaterThan(90);
    expect(player.x).toBeLessThan(movedRight);
  });

  it('does not double jump in open air', () => {
    const world = room();
    const player = createPlayer(80, 80);
    tick(world, player);
    const fallingSpeed = player.vy;
    tick(world, player, { jumpPressed: true });
    expect(player.vy).toBeGreaterThan(fallingSpeed);
  });

  it('attaches to an airborne side collision and stops falling', () => {
    const { world, player } = rightAttached();
    expect(player.x + player.width).toBeCloseTo(120, 5);
    const attachedY = player.y;
    tick(world, player, {}, 30);
    expect(player.y).toBeCloseTo(attachedY, 5);
    expect(player.vy).toBe(0);
  });

  it('attaches to the left wall too', () => {
    const world = room();
    wall(world, 10);
    const player = createPlayer(46, 100);
    tick(world, player, { left: true }, 4);
    expect(player.wall).toBe(-1);
    expect(player.x).toBeCloseTo(44, 5);
  });

  it('attaches while airborne and touching a side wall without horizontal input', () => {
    const world = room();
    wall(world, 30);
    const player = createPlayer(104, 100);
    tick(world, player);
    expect(player.wall).toBe(1);
    const attachedY = player.y;
    tick(world, player, {}, 20);
    expect(player.y).toBeCloseTo(attachedY, 5);
    expect(player.vy).toBe(0);
  });

  it.each([-1, 1] as const)('collides with a one-cell obstacle on side %s without attaching', side => {
    const world = room();
    world.setSolid(30, 28, true);
    const player = createPlayer(side < 0 ? 126 : 102, 100);
    tick(world, player, side < 0 ? { left: true } : { right: true }, 2);
    expect(player.wall).toBe(0);
    expect(player.vy).toBeGreaterThan(0);
    if (side < 0) expect(player.x).toBeCloseTo(124, 5);
    else expect(player.x + player.width).toBeCloseTo(120, 5);
  });

  it.each([-1, 1] as const)('does not attach to a two-cell remnant on side %s', side => {
    const world = room();
    world.setSolid(30, 28, true);
    world.setSolid(30, 29, true);
    const player = createPlayer(side < 0 ? 124 : 104, 100);
    tick(world, player);
    expect(player.wall).toBe(0);
    expect(player.vy).toBeGreaterThan(0);
  });

  it('does not combine separated spikes into a supporting wall', () => {
    const world = room();
    for (const y of [26, 28, 30, 32]) world.setSolid(30, y, true);
    const player = createPlayer(104, 100);
    tick(world, player);
    expect(player.wall).toBe(0);
    expect(player.vy).toBeGreaterThan(0);
  });

  it.each([-1, 1] as const)('grips connected teeth on an uneven wall on side %s', side => {
    const world = room();
    roughWall(world, side);
    const player = createPlayer(side < 0 ? 124 : 104, 92);
    tick(world, player);
    expect(player.wall).toBe(side);
    expect(player.vy).toBe(0);
  });

  it.each([-1, 1] as const)('climbs up and down over recesses and protrusions on side %s', side => {
    const world = room();
    roughWall(world, side);
    const player = createPlayer(side < 0 ? 124 : 104, 92);
    tick(world, player);
    expect(player.wall).toBe(side);
    for (let i = 0; i < 64; i++) {
      tick(world, player, { up: true });
      expect(player.wall).toBe(side);
      expectOutsideTerrain(world, player);
    }
    expect(player.y).toBeLessThan(36);
    for (let i = 0; i < 124; i++) {
      tick(world, player, { down: true });
      expect(player.wall).toBe(side);
      expectOutsideTerrain(world, player);
    }
    expect(player.y).toBeGreaterThan(154);
  });

  it.each([-1, 1] as const)('does not catch a floor-connected bump at the feet on side %s', side => {
    const world = room();
    for (let y = 39; y < 50; y++) world.setSolid(30, y, true);
    const player = createPlayer(side < 0 ? 124 : 104, 136);
    tick(world, player);
    expect(player.wall).toBe(0);
    expect(player.vy).toBeGreaterThan(0);
  });

  it.each([-1, 1] as const)('requires actual side contact before reaching toward a recessed wall on side %s', side => {
    const world = room();
    wall(world, 30);
    const player = createPlayer(side < 0 ? 128 : 100, 100);
    tick(world, player);
    expect(player.wall).toBe(0);
    expect(player.vy).toBeGreaterThan(0);
  });

  it.each([-1, 1] as const)('releases a held grip when its wall recedes beyond reach on side %s', side => {
    const world = room();
    wall(world, 30);
    const player = createPlayer(side < 0 ? 124 : 104, 100);
    tick(world, player);
    expect(player.wall).toBe(side);
    for (let y = 1; y < 50; y++) {
      world.setSolid(30, y, false);
      world.setSolid(30 + side * 3, y, true);
    }
    tick(world, player, { up: true });
    expect(player.wall).toBe(0);
    expect(player.x).toBe(side < 0 ? 124 : 104);
  });

  it('requires enough supporting wall to overlap the body, not just exist nearby', () => {
    const world = room();
    for (let y = 31; y <= 34; y++) world.setSolid(30, y, true);
    const player = createPlayer(104, 100);
    tick(world, player);
    expect(player.wall).toBe(0);
    expect(player.vy).toBeGreaterThan(0);
  });

  it('attaches to a contiguous three-cell surface and can climb along it', () => {
    const world = room();
    for (let y = 28; y <= 30; y++) world.setSolid(30, y, true);
    const player = createPlayer(104, 100);
    tick(world, player);
    expect(player.wall).toBe(1);
    const attachedY = player.y;
    tick(world, player, { up: true }, 2);
    expect(player.wall).toBe(1);
    expect(player.y).toBeLessThan(attachedY);
  });

  it('falls when the supporting wall is reduced to a tiny remnant', () => {
    const { world, player } = rightAttached();
    const attachedY = player.y;
    for (let y = 1; y < 50; y++) world.setSolid(30, y, y === 28 || y === 29);
    tick(world, player, {}, 2);
    expect(player.wall).toBe(0);
    expect(player.y).toBeGreaterThan(attachedY);
  });

  it('finishes climbing over a wall lip after side support becomes shorter than the grip minimum', () => {
    const world = room();
    for (let y = 25; y < 50; y++) {
      for (let x = 30; x < 79; x++) world.setSolid(x, y, true);
    }
    const player = createPlayer(104, 120);
    tick(world, player);
    expect(player.wall).toBe(1);
    tick(world, player, { up: true, right: true }, 120);
    expect(player.wall).toBe(0);
    expect(player.grounded).toBe(true);
    expect(player.y + player.height).toBeCloseTo(100, 5);
    expect(player.x).toBeGreaterThan(120);
  });

  it('does not attach during a rising jump beside a wall, then attaches when falling', () => {
    const world = room();
    wall(world, 30);
    const player = createPlayer(104, 168);
    tick(world, player);
    expect(player.wall).toBe(0);
    tick(world, player, { jumpPressed: true });
    expect(player.y).toBeLessThan(168);
    expect(player.wall).toBe(0);
    expect(player.vy).toBeLessThan(0);
    expect(player.grounded).toBe(false);
    tick(world, player, {}, 22);
    expect(player.wall).toBe(1);
  });

  it('uses the upgraded climbing speed without changing attachment behaviour', () => {
    const { world, player } = rightAttached();
    const originalY = player.y;
    stepPlayer(world, player, { ...idle, up: true }, 0.25, { climbSpeed: 120 });
    expect(originalY - player.y).toBeCloseTo(30, 4);
    expect(player.wall).toBe(1);
  });

  it('climbs up and down without a stamina limit', () => {
    const { world, player } = rightAttached();
    const originalY = player.y;
    tick(world, player, { up: true }, 30);
    expect(player.y).toBeLessThan(originalY - 25);
    expect(player.wall).toBe(1);
    tick(world, player, { down: true }, 30);
    expect(player.y).toBeCloseTo(originalY, 4);
    expect(player.wall).toBe(1);
  });

  it('detaches when pressing away and falls without immediately reattaching', () => {
    const { world, player } = rightAttached();
    const attachedY = player.y;
    tick(world, player, { left: true });
    expect(player.wall).toBe(0);
    expect(player.x + player.width).toBeLessThan(120);
    tick(world, player);
    expect(player.wall).toBe(0);
    expect(player.y).toBeGreaterThan(attachedY);
  });

  it('wall jumps upward and away even when the toward-wall key remains held', () => {
    const { world, player } = rightAttached();
    const originalX = player.x;
    const originalY = player.y;
    tick(world, player, { right: true, jumpPressed: true });
    expect(player.wall).toBe(0);
    expect(player.vx).toBeLessThan(0);
    expect(player.vy).toBeLessThan(0);
    expect(player.x).toBeLessThan(originalX);
    expect(player.y).toBeLessThan(originalY);
  });

  it('can attach again after separating from a jumped-from wall', () => {
    const { world, player } = rightAttached();
    tick(world, player, { jumpPressed: true });
    tick(world, player, { right: true }, 30);
    expect(player.wall).toBe(1);
  });

  it('falls when the supporting wall is dug away', () => {
    const { world, player } = rightAttached();
    const attachedY = player.y;
    for (let y = 1; y < 50; y++) world.setSolid(30, y, false);
    tick(world, player, {}, 2);
    expect(player.wall).toBe(0);
    expect(player.y).toBeGreaterThan(attachedY);
  });

  it('does not attach to a wall while standing on the ground', () => {
    const world = room();
    wall(world, 30);
    const player = createPlayer(100, 168);
    tick(world, player, { right: true }, 10);
    expect(player.grounded).toBe(true);
    expect(player.wall).toBe(0);
  });

  it('cannot tunnel through a wall or the floor during a long frame', () => {
    const world = room();
    wall(world, 30);
    const player = createPlayer(60, 80);
    stepPlayer(world, player, { ...idle, right: true }, 1);
    expect(player.x + player.width).toBeLessThanOrEqual(120.0001);
    expect(player.y + player.height).toBeLessThanOrEqual(200.0001);
  });

  it('stops upward movement at a ceiling', () => {
    const world = room();
    for (let x = 1; x < 79; x++) world.setSolid(x, 38, true);
    const player = createPlayer(80, 168);
    tick(world, player);
    tick(world, player, { jumpPressed: true }, 10);
    expect(player.y).toBeGreaterThanOrEqual(156);
    expect(player.wall).toBe(0);
  });
});
