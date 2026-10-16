import { HOPPER_RANGE, type Session } from './session';

export const MAX_DEV_CREDITS = 1_000_000_000;

/** Change the balance without treating development credits as water delivered. */
export function setDevCredits(session: Session, amount: number): boolean {
  if (session.completed || !Number.isFinite(amount) || amount < 0 || amount > MAX_DEV_CREDITS) return false;
  session.devCreditAdjustment += amount - session.tank.credits;
  session.tank.credits = amount;
  return true;
}

/** A visibility override must leave ordinary exploration and the run intact. */
export function setOmniVision(session: Session, enabled: boolean): boolean {
  if (session.completed || typeof enabled !== 'boolean') return false;
  session.options.debugVision = enabled;
  return true;
}

/** Return to the actual saved hopper, preferring nearby ground without altering the site. */
export function teleportToHopper(session: Session): boolean {
  if (session.completed) return false;
  const { world, player, hopper } = session;
  const size = world.cellSize;
  const epsilon = 0.001;
  const preferred = { x: hopper.x + 32, y: session.surfaceY - player.height };
  let supported: { x: number; y: number; score: number } | null = null;
  let airborne: { x: number; y: number; score: number } | null = null;
  const minX = Math.max(1, Math.floor((hopper.x - HOPPER_RANGE - player.width / 2) / size));
  const maxX = Math.min(world.width - 2, Math.ceil((hopper.x + HOPPER_RANGE - player.width / 2) / size));
  const minY = Math.max(1, Math.floor((hopper.y - HOPPER_RANGE - player.height / 2) / size));
  const maxY = Math.min(world.height - 2, Math.ceil((hopper.y + HOPPER_RANGE - player.height / 2) / size));

  for (let cellY = minY; cellY <= maxY; cellY++) {
    for (let cellX = minX; cellX <= maxX; cellX++) {
      const x = cellX * size;
      const y = cellY * size;
      if (Math.hypot(x + player.width / 2 - hopper.x, y + player.height / 2 - hopper.y) > HOPPER_RANGE) continue;
      const right = Math.floor((x + player.width - epsilon) / size);
      const bottom = Math.floor((y + player.height - epsilon) / size);
      let clear = true;
      for (let row = cellY; row <= bottom && clear; row++) {
        for (let column = cellX; column <= right; column++) {
          if (world.isSolid(column, row)) { clear = false; break; }
        }
      }
      if (!clear) continue;
      let grounded = false;
      const floor = Math.floor((y + player.height + epsilon) / size);
      for (let column = cellX; column <= right; column++) {
        if (world.isSolid(column, floor)) { grounded = true; break; }
      }
      const candidate = { x, y, score: (x - preferred.x) ** 2 + (y - preferred.y) ** 2 };
      if (grounded && (!supported || candidate.score < supported.score)) supported = candidate;
      else if (!grounded && (!airborne || candidate.score < airborne.score)) airborne = candidate;
    }
  }

  const destination = supported ?? airborne;
  if (!destination) return false;
  Object.assign(player, { x: destination.x, y: destination.y, vx: 0, vy: 0,
    grounded: supported !== null, wall: 0, suppressedWall: 0, wallJumpTime: 0,
    airJumpAvailable: true, wallJumpChain: false });
  session.digCooldown = 0;
  session.strikeTime = -1;
  session.lastStrike = null;
  session.unloading = false;
  return true;
}
