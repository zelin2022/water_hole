import { createPlayer, stepPlayer, type Player, type PlayerInput } from './player';
import { buyUpgrade, collectIntoTank, createTank, depositAtHopper, upgradeStats, type Tank, type UpgradeId } from './economy';
import type { Point, World } from './world';
import { stepWater, totalWater } from './water';
import { damageStrike, DIG_REACH_PADDING } from './digging';
import { generateSite } from './generation';
import { detachSmallDirt, stepFallingDirt, type FallingDirt } from './dirt';

export const DIG_RADIUS = 12;
export const DIG_REACH = 24;
export const DIG_INTERVAL = 0.48;
export const DIG_WINDUP = 0.12;
export const COLLECTION_RADIUS = 28;
export const HOPPER_RANGE = 96;
export const UNLOAD_RATE = 25;
export const DEMO_DELIVERY_LIMIT = 400;

export interface GameInput extends PlayerInput {
  digging: boolean;
  aim: Point;
  collecting: boolean;
  depositPressed: boolean;
  upgradePressed?: boolean;
  purchase?: UpgradeId;
  sonarPressed?: boolean;
}
export interface SessionOptions {
  seed?: number;
  caveMemory?: 'remembered' | 'sonar';
  headlamp?: 'character' | 'mouse';
  debugVision?: boolean;
}
export interface LastStrike { center: Point; damaged: number; removed: number; time: number }
export interface SonarSave { origin: Point; startedAt: number; maxRadius: number }
export interface Session {
  world: World;
  player: Player;
  tank: Tank;
  hopper: Point;
  seed: number;
  options: Required<SessionOptions>;
  surfaceY: number;
  delivered: number;
  time: number;
  completed: boolean;
  initialWater: number;
  digCooldown: number;
  /** Remaining time to impact, or -1 when no swing is pending. */
  strikeTime: number;
  lastStrike: LastStrike | null;
  unloading: boolean;
  facing: -1 | 1;
  explored: Uint8Array;
  sonar: SonarSave | null;
  lastSonarAt: number;
  fallingDirt: FallingDirt[];
}

export function createSession(options: SessionOptions = {}): Session {
  const seed = (options.seed ?? 14321) >>> 0;
  const site = generateSite(seed);
  return {
    world: site.world,
    player: createPlayer(site.spawn.x, site.spawn.y),
    tank: createTank(),
    hopper: site.hopper,
    surfaceY: site.surfaceY,
    seed,
    options: { seed, caveMemory: options.caveMemory ?? 'remembered', headlamp: options.headlamp ?? 'character', debugVision: options.debugVision ?? false },
    delivered: 0, time: 0, completed: false,
    initialWater: totalWater(site.world),
    digCooldown: 0, strikeTime: -1, lastStrike: null,
    unloading: false, facing: 1,
    explored: new Uint8Array(site.world.solid.length),
    sonar: null, lastSonarAt: -15,
    fallingDirt: detachSmallDirt(site.world),
  };
}

export function playerCenter(session: Session): Point {
  return { x: session.player.x + session.player.width / 2, y: session.player.y + session.player.height / 2 };
}

export function nearHopper(session: Session): boolean {
  const center = playerCenter(session);
  return Math.hypot(center.x - session.hopper.x, center.y - session.hopper.y) <= HOPPER_RANGE;
}

/** Distinct swing and impact clocks keep held digging from becoming continuous removal. */
function stepDigging(session: Session, input: GameInput, dt: number): void {
  session.digCooldown = Math.max(0, session.digCooldown - dt);
  const canDig = input.digging && (!session.player.wall || session.tank.upgrades.wallDig > 0);
  if (!canDig) {
    session.strikeTime = -1;
    return;
  }
  if (session.strikeTime < 0 && session.digCooldown === 0) {
    session.strikeTime = DIG_WINDUP;
    session.digCooldown = DIG_INTERVAL;
  }
  if (session.strikeTime < 0) return;
  session.strikeTime -= dt;
  if (session.strikeTime > 0) return;
  const stats = upgradeStats(session.tank);
  const result = damageStrike(session.world, playerCenter(session), input.aim, stats.digRadius, stats.digDamage, session.facing);
  if (result.removed > 0) {
    // Any newly detached island must touch a removed cell in the pick's reach.
    session.fallingDirt.push(...detachSmallDirt(session.world, {
      center: playerCenter(session), radius: stats.digRadius * 2 + DIG_REACH_PADDING + session.world.cellSize,
    }));
  }
  session.lastStrike = { ...result, time: session.time };
  session.strikeTime = -1;
}

export function stepSession(session: Session, input: GameInput, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0 || session.completed) return;
  session.time += dt;
  if (input.left !== input.right) session.facing = input.right ? 1 : -1;
  stepDigging(session, input, dt);
  stepFallingDirt(session.world, session.fallingDirt, dt);
  stepPlayer(session.world, session.player, input, dt, { climbSpeed: upgradeStats(session.tank).climbSpeed });
  stepWater(session.world, dt);
  const center = playerCenter(session);
  if (input.collecting) collectIntoTank(session.world, session.tank, center, COLLECTION_RADIUS, dt * 36);
  const nearby = nearHopper(session);
  if (!nearby) session.unloading = false;
  else if (input.depositPressed) session.unloading = !session.unloading;
  if (session.unloading) {
    session.delivered += depositAtHopper(session.tank, center, session.hopper, HOPPER_RANGE,
      Math.min(dt * UNLOAD_RATE, DEMO_DELIVERY_LIMIT - session.delivered));
    if (session.tank.water <= 1e-8) session.unloading = false;
  }
  if (session.delivered >= DEMO_DELIVERY_LIMIT - 1e-8) {
    session.delivered = DEMO_DELIVERY_LIMIT;
    session.completed = true;
    session.unloading = false;
    return;
  }
  if (nearby && (input.purchase || input.upgradePressed)) buyUpgrade(session.tank, input.purchase ?? 'capacity');
}
