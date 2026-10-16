import { World, type Point } from './world';

export const SONAR_COOLDOWN = 15;
export const SONAR_TRAVEL_TIME = 2;
export const SONAR_OUTLINE_LIFETIME = 0.5;
export const SONAR_ATTACK_TIME = 0.025;
export const TORSO_LIGHT_RADIUS = 55;
export const HEADLAMP_RANGE = 180;
export const HEADLAMP_HALF_ANGLE = Math.PI / 5;
export const DAYLIGHT_FALLOFF_DISTANCE = 64;
export const DAYLIGHT_SURFACE_SAMPLE_RADIUS = 96;
export const MINIMUM_VISIBLE_LIGHT = 0.025;
// Kept below the weakest moon colour channel (220 / 255), so moving into
// brighter ambient light never makes any rendered colour channel darker.
export const LAMP_AMBIENT_SUPPRESSION = 0.85;

const daylightCache = new WeakMap<World, { version: number; field: Float32Array }>();

export interface SonarPulse { origin: Point; startedAt: number; maxRadius: number; }
export interface VisionState {
  explored: Uint8Array;
  visible: Uint8Array;
  light: Float32Array;
  moonlight: Float32Array;
  lamplight: Float32Array;
  daylight: Float32Array;
  sonar: SonarPulse | null;
  lastSonarAt: number;
}

export interface VisionInput {
  position: Point;
  headPosition?: Point;
  aim: Point;
  facing: -1 | 1;
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
    moonlight: new Float32Array(size), lamplight: new Float32Array(size),
    sonar: null, lastSonarAt: -SONAR_COOLDOWN,
  };
}

export function computeDaylight(world: World): Float32Array {
  const cached = daylightCache.get(world);
  if (cached?.version === world.terrainVersion) return cached.field;
  const light = new Float32Array(world.width * world.height);
  const queue = new Uint32Array(light.length);
  const queued = new Uint8Array(light.length);
  let head = 0;
  let tail = 0;
  let pending = 0;

  // Current sky-facing terrain defines the surface. A local skyline average
  // keeps narrow shafts below that surface, while broad excavation lowers it.
  const skyline = new Uint32Array(world.width);
  const surfaceSums = new Float64Array(world.width + 1);
  for (let x = 1; x < world.width - 1; x++) {
    let y = 1;
    while (y < world.height - 1 && !world.isSolid(x, y)) y++;
    skyline[x] = y;
    surfaceSums[x + 1] = surfaceSums[x] + y;
  }
  const sampleRadius = Math.ceil(DAYLIGHT_SURFACE_SAMPLE_RADIUS / world.cellSize);
  const enqueue = (index: number): void => {
    if (queued[index]) return;
    queue[tail] = index;
    tail = (tail + 1) % queue.length;
    queued[index] = 1;
    pending++;
  };

  // The outer grid ring is sealed for collision. Interior row one represents
  // the sky. Direct sky exposure still attenuates below the nearby surface;
  // freshly uncovered underground faces never become independent light sources.
  for (let x = 1; x < world.width - 1; x++) {
    const left = Math.max(1, x - sampleRadius);
    const right = Math.min(world.width - 2, x + sampleRadius);
    const surface = (surfaceSums[right + 1] - surfaceSums[left]) / (right - left + 1);
    for (let y = 1; y < skyline[x]; y++) {
      const index = world.index(x, y);
      const depth = Math.max(0, (y + 0.5 - surface) * world.cellSize);
      light[index] = Math.exp(-depth / DAYLIGHT_FALLOFF_DISTANCE);
      enqueue(index);
    }
  }
  const attenuation = Math.exp(-world.cellSize / DAYLIGHT_FALLOFF_DISTANCE);
  while (pending > 0) {
    const index = queue[head];
    head = (head + 1) % queue.length;
    queued[index] = 0;
    pending--;
    const strength = light[index] * attenuation;
    if (strength < MINIMUM_VISIBLE_LIGHT) continue;
    const x = index % world.width;
    const y = Math.floor(index / world.width);
    const neighbours = [index - 1, index + 1, index - world.width, index + world.width];
    for (const neighbour of neighbours) {
      const nx = neighbour % world.width;
      const ny = Math.floor(neighbour / world.width);
      if (Math.abs(nx - x) + Math.abs(ny - y) !== 1
        || !world.inBounds(nx, ny) || world.solid[neighbour]
        || strength <= light[neighbour] + 1e-6) continue;
      light[neighbour] = strength;
      enqueue(neighbour);
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

/** Dim each illuminated target locally, preserving a beam into a dark tunnel. */
export function dimLamplight(strength: number, ambient: number): number {
  return Math.max(0, strength - ambient * LAMP_AMBIENT_SUPPRESSION);
}

export function updateVision(world: World, state: VisionState, input: VisionInput): void {
  state.daylight = computeDaylight(world);
  state.moonlight.set(state.daylight);
  state.lamplight.fill(0);
  const torsoRadius = input.torsoRadius ?? TORSO_LIGHT_RADIUS;
  const beamRange = input.headlampRange ?? HEADLAMP_RANGE;
  const halfAngle = input.headlampHalfAngle ?? HEADLAMP_HALF_ANGLE;
  const headPosition = input.headPosition ?? input.position;
  let directionX = input.facing;
  let directionY = 0;
  const aimX = input.aim.x - headPosition.x;
  const aimY = input.aim.y - headPosition.y;
  const aimDistance = Math.hypot(aimX, aimY);
  if (aimDistance > 0) {
    directionX = aimX / aimDistance;
    directionY = aimY / aimDistance;
  }
  const coneLimit = Math.cos(halfAngle);
  const minX = Math.max(1, Math.floor(Math.min(input.position.x - torsoRadius, headPosition.x - beamRange) / world.cellSize));
  const maxX = Math.min(world.width - 2, Math.floor(Math.max(input.position.x + torsoRadius, headPosition.x + beamRange) / world.cellSize));
  const minY = Math.max(1, Math.floor(Math.min(input.position.y - torsoRadius, headPosition.y - beamRange) / world.cellSize));
  const maxY = Math.min(world.height - 2, Math.floor(Math.max(input.position.y + torsoRadius, headPosition.y + beamRange) / world.cellSize));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const cellX = (x + 0.5) * world.cellSize;
      const cellY = (y + 0.5) * world.cellSize;
      const torsoDistance = Math.hypot(cellX - input.position.x, cellY - input.position.y);
      let strength = torsoDistance < torsoRadius && hasLineOfSight(world, input.position, x, y)
        ? 0.8 * Math.pow(1 - torsoDistance / torsoRadius, 0.6) : 0;
      const dx = cellX - headPosition.x;
      const dy = cellY - headPosition.y;
      const distance = Math.hypot(dx, dy);
      const alignment = distance > 0 ? (dx * directionX + dy * directionY) / distance : 1;
      if (distance < beamRange && alignment > coneLimit && hasLineOfSight(world, headPosition, x, y)) {
        const edgeFade = Math.sqrt((alignment - coneLimit) / (1 - coneLimit));
        strength = Math.max(strength, Math.pow(1 - distance / beamRange, 0.55) * edgeFade);
      }
      const index = world.index(x, y);
      state.lamplight[index] = dimLamplight(strength, state.moonlight[index]);
    }
  }
  for (let index = 0; index < state.visible.length; index++) {
    state.light[index] = Math.min(1, state.moonlight[index] + state.lamplight[index]);
    state.visible[index] = state.light[index] >= MINIMUM_VISIBLE_LIGHT ? 1 : 0;
    if (state.visible[index]) state.explored[index] = 1;
  }
  if (input.debugVision) {
    state.visible.fill(1);
    state.light.fill(1);
    state.moonlight.fill(1);
    state.lamplight.fill(0);
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
