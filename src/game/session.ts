import { createPlayer, stepPlayer, type Player, type PlayerInput } from './player';
import { buyCapacityUpgrade, collectIntoTank, createTank, depositAtHopper, type Tank } from './economy';
import { dig, World } from './world';
import { stepWater, totalWater } from './water';

export const DIG_RADIUS = 12;
export const DIG_REACH = 64;
export const COLLECTION_RADIUS = 28;
export const HOPPER_RANGE = 96;

export interface GameInput extends PlayerInput {
  digging: boolean;
  aim: { x: number; y: number };
  collecting: boolean;
  depositPressed: boolean;
  upgradePressed: boolean;
}

export interface Session {
  world: World;
  player: Player;
  tank: Tank;
  hopper: { x: number; y: number };
  delivered: number;
  time: number;
  completed: boolean;
  initialWater: number;
}

export function createSession(): Session {
  const world = new World(512, 288, 4);
  for (let y = 48; y < world.height - 1; y++) {
    for (let x = 1; x < world.width - 1; x++) world.setSolid(x, y, true);
  }

  // A deliberately fixed fixture: the first reservoir has a thin wall beside
  // a climbable shaft, so the complete water loop can be tested immediately.
  for (let y = 48; y < 124; y++) {
    for (let x = 88; x < 106; x++) world.setSolid(x, y, false);
  }
  carvePocket(world, 130, 87, 20, 14, true);
  carvePocket(world, 222, 140, 31, 21, true);
  carvePocket(world, 390, 218, 42, 28, true);
  carvePocket(world, 302, 88, 27, 16, false);

  return {
    world,
    player: createPlayer(232, 160),
    tank: createTank(),
    hopper: { x: 160, y: 136 },
    delivered: 0,
    time: 0,
    completed: false,
    initialWater: totalWater(world),
  };
}

function carvePocket(world: World, cx: number, cy: number, rx: number, ry: number, filled: boolean): void {
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
      world.setSolid(x, y, false);
      if (filled) world.water[world.index(x, y)] = 1;
    }
  }
}

export function playerCenter(session: Session): { x: number; y: number } {
  return { x: session.player.x + session.player.width / 2, y: session.player.y + session.player.height / 2 };
}

export function nearHopper(session: Session): boolean {
  const center = playerCenter(session);
  return Math.hypot(center.x - session.hopper.x, center.y - session.hopper.y) <= HOPPER_RANGE;
}

export function stepSession(session: Session, input: GameInput, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  session.time += dt;
  if (input.digging) dig(session.world, playerCenter(session), input.aim, DIG_RADIUS, DIG_REACH);
  stepPlayer(session.world, session.player, input, dt);
  stepWater(session.world, dt);
  const center = playerCenter(session);
  if (input.collecting) {
    collectIntoTank(session.world, session.tank, center, COLLECTION_RADIUS, dt * 36);
  }
  if (input.depositPressed) {
    session.delivered += depositAtHopper(session.tank, center, session.hopper, HOPPER_RANGE);
  }
  if (input.upgradePressed && nearHopper(session)) buyCapacityUpgrade(session.tank);
  if (session.tank.upgraded && session.tank.water > 20.01) session.completed = true;
}
