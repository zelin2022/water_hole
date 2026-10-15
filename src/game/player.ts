import type { World } from './world';

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  grounded: boolean;
  wall: -1 | 0 | 1;
  suppressedWall: -1 | 0 | 1;
  wallJumpTime: number;
}

export interface PlayerInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jumpPressed: boolean;
}

export function createPlayer(x: number, y: number): Player {
  return { x, y, vx: 0, vy: 0, width: 16, height: 32, grounded: false, wall: 0, suppressedWall: 0, wallJumpTime: 0 };
}

const EPSILON = 0.001;
const MOVE_SPEED = 150;
const CLIMB_SPEED = 65;
const GRAVITY = 900;
const JUMP_SPEED = 275;
const MAX_FALL_SPEED = 420;

/** Small collision steps keep even a delayed frame from skipping thin terrain. */
export function stepPlayer(world: World, player: Player, input: PlayerInput, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const steps = Math.ceil(dt / (1 / 120));
  const step = dt / steps;
  for (let i = 0; i < steps; i++) {
    updatePlayer(world, player, input, step, i === 0 && input.jumpPressed);
  }
}

function updatePlayer(world: World, player: Player, input: PlayerInput, dt: number, jumpPressed: boolean): void {
  const horizontal = Number(input.right) - Number(input.left);
  player.grounded = player.vy >= 0 && touchesFloor(world, player);

  if (player.suppressedWall && !touchesWall(world, player, player.suppressedWall)) {
    player.suppressedWall = 0;
  }
  if (player.wall && (!touchesWall(world, player, player.wall) || player.grounded)) {
    player.wall = 0;
    player.vy = 0;
  }

  if (player.wall && (jumpPressed || horizontal === -player.wall)) {
    const previousWall = player.wall;
    player.suppressedWall = previousWall;
    player.wall = 0;
    if (jumpPressed) {
      player.vx = -previousWall * 120;
      player.vy = -260;
      // A short impulse allows the jump to separate even if toward-wall input is held.
      player.wallJumpTime = 0.12;
    }
  } else if (jumpPressed && player.grounded) {
    player.vy = -JUMP_SPEED;
    player.grounded = false;
  }

  if (player.wall) {
    player.vx = 0;
    player.vy = (Number(input.down) - Number(input.up)) * CLIMB_SPEED;
    moveVertical(world, player, player.vy * dt);
    if (player.grounded || !touchesWall(world, player, player.wall)) {
      player.wall = 0;
    }
    return;
  }

  if (player.wallJumpTime > 0) player.wallJumpTime = Math.max(0, player.wallJumpTime - dt);
  else player.vx = horizontal * MOVE_SPEED;

  player.vy = Math.min(MAX_FALL_SPEED, player.vy + GRAVITY * dt);
  moveVertical(world, player, player.vy * dt);
  const hitWall = moveHorizontal(world, player, player.vx * dt);
  player.grounded = player.vy >= 0 && touchesFloor(world, player);
  const contact = hitWall || (touchesWall(world, player, -1) ? -1 : touchesWall(world, player, 1) ? 1 : 0);
  if (contact && !player.grounded && contact !== player.suppressedWall) {
    player.wall = contact;
    player.vy = 0;
    player.vx = 0;
  }
}

function touchesFloor(world: World, player: Player): boolean {
  const size = world.cellSize;
  const cellY = Math.floor((player.y + player.height + EPSILON) / size);
  const minX = Math.floor((player.x + EPSILON) / size);
  const maxX = Math.floor((player.x + player.width - EPSILON) / size);
  for (let x = minX; x <= maxX; x++) {
    if (world.isSolid(x, cellY)) return true;
  }
  return false;
}

function touchesWall(world: World, player: Player, side: -1 | 1): boolean {
  const size = world.cellSize;
  const cellX = Math.floor((side < 0 ? player.x - EPSILON : player.x + player.width + EPSILON) / size);
  const minY = Math.floor((player.y + EPSILON) / size);
  const maxY = Math.floor((player.y + player.height - EPSILON) / size);
  for (let y = minY; y <= maxY; y++) {
    if (world.isSolid(cellX, y)) return true;
  }
  return false;
}

function moveHorizontal(world: World, player: Player, distance: number): -1 | 0 | 1 {
  if (distance === 0) return 0;
  const size = world.cellSize;
  const target = player.x + distance;
  let nextX = target;
  let hit = false;
  const minX = Math.floor((target + EPSILON) / size);
  const maxX = Math.floor((target + player.width - EPSILON) / size);
  const minY = Math.floor((player.y + EPSILON) / size);
  const maxY = Math.floor((player.y + player.height - EPSILON) / size);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!world.isSolid(x, y)) continue;
      nextX = distance > 0 ? Math.min(nextX, x * size - player.width) : Math.max(nextX, (x + 1) * size);
      hit = true;
    }
  }
  player.x = nextX;
  if (hit) player.vx = 0;
  return hit ? (distance < 0 ? -1 : 1) : 0;
}

function moveVertical(world: World, player: Player, distance: number): void {
  if (distance === 0) return;
  const size = world.cellSize;
  const target = player.y + distance;
  let nextY = target;
  let hit = false;
  const minX = Math.floor((player.x + EPSILON) / size);
  const maxX = Math.floor((player.x + player.width - EPSILON) / size);
  const minY = Math.floor((target + EPSILON) / size);
  const maxY = Math.floor((target + player.height - EPSILON) / size);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!world.isSolid(x, y)) continue;
      nextY = distance > 0 ? Math.min(nextY, y * size - player.height) : Math.max(nextY, (y + 1) * size);
      hit = true;
    }
  }
  player.y = nextY;
  player.grounded = hit && distance > 0;
  if (hit) player.vy = 0;
}
