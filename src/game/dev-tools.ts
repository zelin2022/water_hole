import { demoDepthLimit, finishDemo, HOPPER_RANGE, type Session } from './session';

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

/** Exercise the depth ending without changing any water or credit ledger. */
export function warpToDemoEnd(session: Session): boolean {
  if (session.completed || session.demoEnd.kind !== 'depth') return false;
  const { world, player } = session;
  const size = world.cellSize;
  const y = session.surfaceY + demoDepthLimit(session) * size;
  const firstRow = Math.floor(y / size);
  const lastRow = Math.floor((y + player.height - 0.001) / size);
  if (firstRow < 1 || lastRow >= world.height - 1) return false;

  let destination: { x: number; cells: number[]; score: number } | null = null;
  // Prefer an existing dry cavity. Otherwise remove only the diggable footprint
  // after checking the entire destination, so a failed warp is transactional.
  for (let column = 1; column < world.width - 1; column++) {
    const x = column * size;
    const lastColumn = Math.floor((x + player.width - 0.001) / size);
    if (lastColumn >= world.width - 1) break;
    const cells: number[] = [];
    let usable = true;
    for (let row = firstRow; row <= lastRow && usable; row++) {
      for (let cellX = column; cellX <= lastColumn; cellX++) {
        const index = world.index(cellX, row);
        if (world.water[index] > 0 || world.material[index] === 3) { usable = false; break; }
        if (world.solid[index]) cells.push(index);
      }
    }
    if (!usable) continue;
    const score = cells.length * world.width * size + Math.abs(x - player.x);
    if (!destination || score < destination.score) destination = { x, cells, score };
  }
  if (!destination) return false;
  for (const index of destination.cells) {
    world.setSolid(index % world.width, Math.floor(index / world.width), false);
  }
  const floor = Math.floor((y + player.height + 0.001) / size);
  let grounded = false;
  for (let column = Math.floor(destination.x / size);
    column <= Math.floor((destination.x + player.width - 0.001) / size); column++) {
    if (world.isSolid(column, floor)) { grounded = true; break; }
  }
  Object.assign(player, { x: destination.x, y, vx: 0, vy: 0, grounded,
    wall: 0, suppressedWall: 0, wallJumpTime: 0, airJumpAvailable: true, wallJumpChain: false });
  finishDemo(session);
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
