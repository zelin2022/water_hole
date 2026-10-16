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
// Small leftover cells collide normally, but cannot hold the character in a climbing state.
export const MIN_WALL_CONTACT = 12;
// A held grip can bridge two terrain cells and follow equally small outward ledges.
export const WALL_CONTOUR_REACH = 8;
const WALL_STRUCTURE_DEPTH = 12;

/** Small collision steps keep even a delayed frame from skipping thin terrain. */
export function stepPlayer(world: World, player: Player, input: PlayerInput, dt: number, options: { climbSpeed?: number } = {}): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const steps = Math.ceil(dt / (1 / 120));
  const step = dt / steps;
  for (let i = 0; i < steps; i++) {
    updatePlayer(world, player, input, step, i === 0 && input.jumpPressed, options.climbSpeed ?? CLIMB_SPEED);
  }
}

function updatePlayer(world: World, player: Player, input: PlayerInput, dt: number, jumpPressed: boolean, climbSpeed: number): void {
  const horizontal = Number(input.right) - Number(input.left);
  player.grounded = player.vy >= 0 && touchesFloor(world, player);

  if (player.suppressedWall && !touchesWall(world, player, player.suppressedWall)) {
    player.suppressedWall = 0;
  }
  if (player.wall && !hasClimbingSupport(world, player, player.wall, WALL_CONTOUR_REACH)) {
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
    player.vy = (Number(input.down) - Number(input.up)) * climbSpeed;
    player.grounded = false;
    moveAlongWall(world, player, player.vy * dt);
    if (player.grounded || !hasClimbingSupport(world, player, player.wall, WALL_CONTOUR_REACH)) {
      // Finish the last few pixels of an upward climb over a lip. This remains
      // normal airborne motion with collision checks, rather than snapping onto terrain.
      if (!player.grounded && player.vy < 0) {
        player.vy = -Math.sqrt(2 * GRAVITY * (MIN_WALL_CONTACT + world.cellSize));
      }
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
  const contact = hitWall && hasClimbingSupport(world, player, hitWall)
    ? hitWall
    : hasClimbingSupport(world, player, -1) ? -1 : hasClimbingSupport(world, player, 1) ? 1 : 0;
  if (contact && player.vy > 0 && !player.grounded && contact !== player.suppressedWall) {
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

function hasClimbingSupport(world: World, player: Player, side: -1 | 1, reach = 0): boolean {
  const size = world.cellSize;
  const cellX = Math.floor((side < 0 ? player.x - EPSILON : player.x + player.width + EPSILON) / size);
  const minY = Math.floor((player.y + EPSILON) / size);
  const maxY = Math.floor((player.y + player.height - EPSILON) / size);
  const depth = Math.ceil((reach + WALL_STRUCTURE_DEPTH) / size);
  const minX = side < 0 ? cellX - depth : cellX;
  const maxX = side < 0 ? cellX : cellX + depth;
  const visited = new Set<number>();
  for (let y = minY; y <= maxY; y++) {
    // Contact at the boots alone is a bump, rather than a handhold. Once held,
    // allow the hands to reach across a shallow recess in an excavated face.
    const handOverlap = Math.min((y + 1) * size, player.y + 20) - Math.max(y * size, player.y + 4);
    if (handOverlap < Math.min(2, size) - EPSILON) continue;
    for (let x = cellX; side < 0 ? x >= minX : x <= maxX; x += side) {
      const gap = side < 0 ? player.x - (x + 1) * size : x * size - player.x - player.width;
      if (gap > reach + EPSILON) break;
      if (!world.isSolid(x, y) || visited.has(world.index(x, y))) continue;
      const queue = [{ x, y }];
      const rows = new Set<number>();
      visited.add(world.index(x, y));
      for (let i = 0; i < queue.length; i++) {
        const cell = queue[i];
        rows.add(cell.y);
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = cell.x + dx;
          const ny = cell.y + dy;
          if (nx < minX || nx > maxX || ny < minY || ny > maxY || !world.isSolid(nx, ny)) continue;
          const index = world.index(nx, ny);
          if (visited.has(index)) continue;
          visited.add(index);
          queue.push({ x: nx, y: ny });
        }
      }
      let support = 0;
      for (const row of rows) support += Math.min(player.y + player.height, (row + 1) * size) - Math.max(player.y, row * size);
      if (support >= MIN_WALL_CONTACT - EPSILON) return true;
    }
  }
  return false;
}

function canOccupy(world: World, player: Player, x: number, y: number): boolean {
  const size = world.cellSize;
  for (let cellY = Math.floor((y + EPSILON) / size); cellY <= Math.floor((y + player.height - EPSILON) / size); cellY++) {
    for (let cellX = Math.floor((x + EPSILON) / size); cellX <= Math.floor((x + player.width - EPSILON) / size); cellX++) {
      if (world.isSolid(cellX, cellY)) return false;
    }
  }
  return true;
}

/** Trace small steps in a rough wall without moving through solid terrain. */
function moveAlongWall(world: World, player: Player, distance: number): void {
  const side = player.wall as -1 | 1;
  if (distance !== 0) {
    for (let offset = 0; offset <= WALL_CONTOUR_REACH; offset++) {
      const x = player.x - side * offset;
      // Checking every intermediate position also rules out crossing a narrow obstacle.
      if (!canOccupy(world, player, x, player.y)) break;
      if (!canOccupy(world, player, x, player.y + distance)) continue;
      moveHorizontal(world, player, -side * offset);
      break;
    }
    moveVertical(world, player, distance);
  }
  if (!player.grounded && hasClimbingSupport(world, player, side, WALL_CONTOUR_REACH)) {
    // Close a shallow recess only as far as the first real collision allows.
    moveHorizontal(world, player, side * WALL_CONTOUR_REACH);
  }
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
