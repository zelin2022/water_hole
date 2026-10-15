import { World, type Point } from './world';

export const SONAR_COOLDOWN = 15;
export const SONAR_TRAVEL_TIME = 2;
export const SONAR_OUTLINE_LIFETIME = 0.5;
export const SONAR_ATTACK_TIME = 0.025;
export const TORSO_LIGHT_RADIUS = 55;
export const HEADLAMP_RANGE = 180;
export const HEADLAMP_HALF_ANGLE = Math.PI / 5;
export const DAYLIGHT_FALLOFF_DISTANCE = 64;
export const MINIMUM_VISIBLE_LIGHT = 0.025;

const daylightCache = new WeakMap<World, { version: number; field: Float32Array }>();

export interface SonarPulse { origin: Point; startedAt: number; maxRadius: number; }
export interface VisionState {
  explored: Uint8Array;
  visible: Uint8Array;
  light: Float32Array;
  daylight: Float32Array;
  sonar: SonarPulse | null;
  lastSonarAt: number;
}

export interface VisionInput {
  position: Point;
  aim: Point;
  facing: -1 | 1;
  headlamp: 'character' | 'mouse';
  time: number;
  debugVision?: boolean;
  torsoRadius?: number;
  headlampRange?: number;
  headlampHalfAngle?: number;
}

export function createVision(world: World, explored?: Uint8Array): VisionState {
  const size = world.width * world.height;
  if (explored && explored.length !== size) throw new RangeError('Exploration must match the terrain grid.');
  return {
    explored: explored ?? new Uint8Array(size), visible: new Uint8Array(size),
    light: new Float32Array(size), daylight: new Float32Array(size),
    sonar: null, lastSonarAt: -SONAR_COOLDOWN,
  };
}

export function computeDaylight(world: World): Float32Array {
  const cached = daylightCache.get(world);
  if (cached?.version === world.terrainVersion) return cached.field;
  const light = new Float32Array(world.width * world.height);
  const queue = new Uint32Array(light.length);
  let head = 0;
  let tail = 0;

  // The outer grid ring is sealed for collision. Interior row one represents
  // the sky. Only uninterrupted sky columns supply light; new cave faces do not.
  for (let x = 1; x < world.width - 1; x++) {
    for (let y = 1; y < world.height - 1 && !world.isSolid(x, y); y++) {
      const index = world.index(x, y);
      light[index] = 1;
      queue[tail++] = index;
    }
  }
  const attenuation = Math.exp(-world.cellSize / DAYLIGHT_FALLOFF_DISTANCE);
  while (head < tail) {
    const index = queue[head++];
    const strength = light[index] * attenuation;
    if (strength < MINIMUM_VISIBLE_LIGHT) continue;
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    const neighbours = [index - 1, index + 1, index - world.width, index + world.width];
    for (const neighbour of neighbours) {
      const nx = neighbour % world.width;
      const ny = Math.floor(neighbour / world.width);
      if (Math.abs(nx - x) + Math.abs(ny - y) !== 1
        || !world.inBounds(nx, ny) || world.solid[neighbour] || light[neighbour]) continue;
      light[neighbour] = strength;
      queue[tail++] = neighbour;
    }
  }

  // Illuminate the first rock face next to open lit space, without letting
  // these faces propagate light through a solid wall.
  for (let y = 1; y < world.height - 1; y++) {
    for (let x = 1; x < world.width - 1; x++) {
      const index = world.index(x, y);
      if (!world.solid[index]) continue;
      let exposure = 0;
      for (const neighbour of [index - 1, index + 1, index - world.width, index + world.width]) {
        if (!world.solid[neighbour]) exposure = Math.max(exposure, light[neighbour]);
      }
      light[index] = exposure * 0.82;
    }
  }
  daylightCache.set(world, { version: world.terrainVersion, field: light });
  return light;
}

/** Grid traversal also closes diagonal gaps between touching solid corners. */
function hasLineOfSight(world: World, origin: Point, targetX: number, targetY: number): boolean {
  const ox = origin.x / world.cellSize;
  const oy = origin.y / world.cellSize;
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  if (!world.inBounds(x, y) || world.isSolid(x, y)) return false;
  if (x === targetX && y === targetY) return true;
  const dx = targetX + 0.5 - ox;
  const dy = targetY + 0.5 - oy;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const deltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const deltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  let crossX = dx === 0 ? Infinity : (stepX > 0 ? x + 1 - ox : ox - x) * deltaX;
  let crossY = dy === 0 ? Infinity : (stepY > 0 ? y + 1 - oy : oy - y) * deltaY;

  while (x !== targetX || y !== targetY) {
    if (Math.abs(crossX - crossY) < 1e-10) {
      if (world.isSolid(x + stepX, y) || world.isSolid(x, y + stepY)) return false;
      x += stepX;
      y += stepY;
      crossX += deltaX;
      crossY += deltaY;
    } else if (crossX < crossY) {
      x += stepX;
      crossX += deltaX;
    } else {
      y += stepY;
      crossY += deltaY;
    }
    // A wall's first surface is visible; cells beyond it are not.
    if (x === targetX && y === targetY) return true;
    if (world.isSolid(x, y)) return false;
  }
  return true;
}

export function updateVision(world: World, state: VisionState, input: VisionInput): void {
  state.daylight = computeDaylight(world);
  state.light.set(state.daylight);
  const torsoRadius = input.torsoRadius ?? TORSO_LIGHT_RADIUS;
  const beamRange = input.headlampRange ?? HEADLAMP_RANGE;
  const halfAngle = input.headlampHalfAngle ?? HEADLAMP_HALF_ANGLE;
  const radius = Math.max(torsoRadius, beamRange);
  let directionX = input.facing;
  let directionY = 0;
  if (input.headlamp === 'mouse') {
    const dx = input.aim.x - input.position.x;
    const dy = input.aim.y - input.position.y;
    const length = Math.hypot(dx, dy);
    if (length > 0) {
      directionX = dx / length;
      directionY = dy / length;
    }
  }
  const coneLimit = Math.cos(halfAngle);
  const minX = Math.max(1, Math.floor((input.position.x - radius) / world.cellSize));
  const maxX = Math.min(world.width - 2, Math.floor((input.position.x + radius) / world.cellSize));
  const minY = Math.max(1, Math.floor((input.position.y - radius) / world.cellSize));
  const maxY = Math.min(world.height - 2, Math.floor((input.position.y + radius) / world.cellSize));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = (x + 0.5) * world.cellSize - input.position.x;
      const dy = (y + 0.5) * world.cellSize - input.position.y;
      const distance = Math.hypot(dx, dy);
      let strength = distance < torsoRadius ? 0.8 * Math.pow(1 - distance / torsoRadius, 0.6) : 0;
      const alignment = distance > 0 ? (dx * directionX + dy * directionY) / distance : 1;
      if (distance < beamRange && alignment > coneLimit) {
        const edgeFade = Math.sqrt((alignment - coneLimit) / (1 - coneLimit));
        strength = Math.max(strength, Math.pow(1 - distance / beamRange, 0.55) * edgeFade);
      }
      const index = world.index(x, y);
      if (strength <= state.light[index] || !hasLineOfSight(world, input.position, x, y)) continue;
      state.light[index] = strength;
    }
  }
  for (let index = 0; index < state.visible.length; index++) {
    state.visible[index] = state.light[index] >= MINIMUM_VISIBLE_LIGHT ? 1 : 0;
    if (state.visible[index]) state.explored[index] = 1;
  }
  if (input.debugVision) {
    state.visible.fill(1);
    state.light.fill(1);
  }
}

export function pingSonar(state: VisionState, position: Point, time: number, maxRadius: number): boolean {
  if (![position.x, position.y, time, maxRadius].every(Number.isFinite)
    || maxRadius <= 0 || time - state.lastSonarAt < SONAR_COOLDOWN) return false;
  state.sonar = { origin: { ...position }, startedAt: time, maxRadius };
  state.lastSonarAt = time;
  return true;
}

/** Called for cave outline segments by the renderer, never for resource data. */
export function sonarOpacity(state: VisionState, point: Point, time: number): number {
  const pulse = state.sonar;
  if (!pulse || ![point.x, point.y, time].every(Number.isFinite)) return 0;
  const distance = Math.hypot(point.x - pulse.origin.x, point.y - pulse.origin.y);
  if (distance > pulse.maxRadius) return 0;
  const arrival = pulse.startedAt + distance / pulse.maxRadius * SONAR_TRAVEL_TIME;
  const elapsed = time - arrival;
  if (elapsed < 0 || elapsed >= SONAR_OUTLINE_LIFETIME) return 0;
  if (elapsed < SONAR_ATTACK_TIME) return elapsed / SONAR_ATTACK_TIME;
  return 1 - (elapsed - SONAR_ATTACK_TIME) / (SONAR_OUTLINE_LIFETIME - SONAR_ATTACK_TIME);
}
