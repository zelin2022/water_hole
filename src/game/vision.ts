import { World, type Point } from './world';

export const SONAR_COOLDOWN = 15;
export const SONAR_TRAVEL_TIME = 2;
export const SONAR_OUTLINE_LIFETIME = 0.5;
export const SONAR_ATTACK_TIME = 0.025;
export const TORSO_LIGHT_RADIUS = 55;
export const TERRAIN_REVEAL_CELLS = 2;
export const HEADLAMP_RANGE = 126;
export const HEADLAMP_HALF_ANGLE = Math.PI / 5 * 0.9;
export const DAYLIGHT_FALLOFF_DISTANCE = 64;
export const DAYLIGHT_SURFACE_SAMPLE_RADIUS = 96;
export const MINIMUM_VISIBLE_LIGHT = 0.025;
// Kept below the weakest moon colour channel (220 / 255), so moving into
// brighter ambient light never makes any rendered colour channel darker.
export const LAMP_AMBIENT_SUPPRESSION = 0.85;

const daylightCache = new WeakMap<World, { version: number; field: Float32Array }>();
interface SonarField { version: number; field: Float32Array; parents: Int32Array }
const sonarDistanceCache = new WeakMap<SonarPulse, WeakMap<World, SonarField>>();

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
  subsurfaceScan: SonarPulse | null;
  lastSubsurfaceScanAt: number;
}

export interface VisionInput {
  position: Point;
  headPosition?: Point;
  aim: Point;
  facing: -1 | 1;
  time: number;
  debugVision?: boolean;
  torsoRadius?: number;
  terrainRevealCells?: number;
  bodyBounds?: { x: number; y: number; width: number; height: number };
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
    subsurfaceScan: null, lastSubsurfaceScanAt: -SONAR_COOLDOWN,
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
function hasLineOfSight(world: World, origin: Point, targetX: number, targetY: number, targetPoint?: Point): boolean {
  const ox = origin.x / world.cellSize;
  const oy = origin.y / world.cellSize;
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  if (!world.inBounds(x, y) || world.isSolid(x, y)) return false;
  if (x === targetX && y === targetY) return true;
  const dx = (targetPoint ? targetPoint.x / world.cellSize : targetX + 0.5) - ox;
  const dy = (targetPoint ? targetPoint.y / world.cellSize : targetY + 0.5) - oy;
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
  const terrainRadius = (input.terrainRevealCells ?? TERRAIN_REVEAL_CELLS) * world.cellSize;
  const body = input.bodyBounds ?? { ...input.position, width: 0, height: 0 };
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
  const minX = Math.max(1, Math.floor(Math.min(input.position.x - torsoRadius, headPosition.x - beamRange, body.x - terrainRadius) / world.cellSize));
  const maxX = Math.min(world.width - 2, Math.floor(Math.max(input.position.x + torsoRadius, headPosition.x + beamRange, body.x + body.width + terrainRadius) / world.cellSize));
  const minY = Math.max(1, Math.floor(Math.min(input.position.y - torsoRadius, headPosition.y - beamRange, body.y - terrainRadius) / world.cellSize));
  const maxY = Math.min(world.height - 2, Math.floor(Math.max(input.position.y + torsoRadius, headPosition.y + beamRange, body.y + body.height + terrainRadius) / world.cellSize));
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
      if (world.solid[index] && terrainRadius > 0) {
        // A small band beyond the body exposes mining damage without opening
        // sight into sealed air or water. The ordinary lamps still use rays.
        const bodyDistance = Math.hypot(
          Math.max(body.x - cellX, 0, cellX - body.x - body.width),
          Math.max(body.y - cellY, 0, cellY - body.y - body.height),
        );
        if (bodyDistance < terrainRadius) {
          strength = Math.max(strength, 0.6 * Math.sqrt(1 - bodyDistance / terrainRadius));
        }
      }
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

export function pingSonar(world: World, state: VisionState, position: Point, time: number, maxRadius: number): boolean {
  if (![position.x, position.y, time, maxRadius].every(Number.isFinite)
    || maxRadius <= 0 || time - state.lastSonarAt < SONAR_COOLDOWN
    || world.isSolidAtPixel(position.x, position.y)) return false;
  state.sonar = { origin: { ...position }, startedAt: time, maxRadius };
  state.lastSonarAt = time;
  return true;
}

/** The original penetrating pulse, reserved for the separate subsurface scanner. */
export function pingSubsurfaceScanner(state: VisionState, position: Point, time: number, maxRadius: number): boolean {
  if (![position.x, position.y, time, maxRadius].every(Number.isFinite)
    || maxRadius <= 0 || time - state.lastSubsurfaceScanAt < SONAR_COOLDOWN) return false;
  state.subsurfaceScan = { origin: { ...position }, startedAt: time, maxRadius };
  state.lastSubsurfaceScanAt = time;
  return true;
}

function pulseOpacity(pulse: SonarPulse, distance: number, time: number): number {
  if (!Number.isFinite(distance) || !Number.isFinite(time)) return 0;
  if (distance > pulse.maxRadius) return 0;
  const arrival = pulse.startedAt + distance / pulse.maxRadius * SONAR_TRAVEL_TIME;
  const elapsed = time - arrival;
  if (elapsed < 0 || elapsed >= SONAR_OUTLINE_LIFETIME) return 0;
  if (elapsed < SONAR_ATTACK_TIME) return elapsed / SONAR_ATTACK_TIME;
  return 1 - (elapsed - SONAR_ATTACK_TIME) / (SONAR_OUTLINE_LIFETIME - SONAR_ATTACK_TIME);
}

/** Uses straight-line distance through terrain, preserving the original scan. */
export function subsurfaceScannerOpacity(state: VisionState, point: Point, time: number): number {
  const pulse = state.subsurfaceScan;
  if (!pulse || ![point.x, point.y, time].every(Number.isFinite)) return 0;
  return pulseOpacity(pulse, Math.hypot(point.x - pulse.origin.x, point.y - pulse.origin.y), time);
}

function sonarDistances(world: World, pulse: SonarPulse): SonarField {
  let worlds = sonarDistanceCache.get(pulse);
  if (!worlds) {
    worlds = new WeakMap();
    sonarDistanceCache.set(pulse, worlds);
  }
  const cached = worlds.get(world);
  if (cached?.version === world.terrainVersion) return cached;

  const field = new Float32Array(world.solid.length).fill(Infinity);
  const parents = new Int32Array(field.length).fill(-2);
  const originVisibility = new Int8Array(field.length);
  const originX = Math.floor(pulse.origin.x / world.cellSize);
  const originY = Math.floor(pulse.origin.y / world.cellSize);
  if (!world.isSolid(originX, originY)) {
    // A summed-area table gives an exact cheap visibility proof when the
    // anchor-to-target rectangle contains no rock. Large open caves otherwise
    // repeat a long ray traversal for every cell in the circular wave.
    const reach = Math.ceil(pulse.maxRadius / world.cellSize) + 2;
    const minX = Math.max(0, originX - reach), maxX = Math.min(world.width - 1, originX + reach);
    const minY = Math.max(0, originY - reach), maxY = Math.min(world.height - 1, originY + reach);
    const stride = maxX - minX + 2;
    const obstacles = new Uint32Array(stride * (maxY - minY + 2));
    for (let y = minY; y <= maxY; y++) {
      let row = 0;
      for (let x = minX; x <= maxX; x++) {
        row += world.solid[world.index(x, y)];
        const index = (y - minY + 1) * stride + x - minX + 1;
        obstacles[index] = obstacles[index - stride] + row;
      }
    }
    const anchorVisible = (anchor: Point, x: number, y: number): boolean => {
      const ax = Math.floor(anchor.x / world.cellSize), ay = Math.floor(anchor.y / world.cellSize);
      const left = Math.min(ax, x) - minX, right = Math.max(ax, x) - minX + 1;
      const top = Math.min(ay, y) - minY, bottom = Math.max(ay, y) - minY + 1;
      const rocks = obstacles[bottom * stride + right] - obstacles[top * stride + right]
        - obstacles[bottom * stride + left] + obstacles[top * stride + left];
      return rocks === 0 || hasLineOfSight(world, anchor, x, y);
    };
    // Any-angle propagation keeps straight travel Euclidean instead of counting
    // horizontal/vertical grid steps. Visible parent anchors also let the wave
    // bend around rock without cutting through it or through touching corners.
    const queue: { index: number; distance: number }[] = [];
    const enqueue = (index: number): void => {
      const entry = { index, distance: field[index] };
      let slot = queue.length;
      queue.push(entry);
      while (slot > 0) {
        const parent = (slot - 1) >> 1;
        if (queue[parent].distance <= entry.distance) break;
        queue[slot] = queue[parent]; slot = parent;
      }
      queue[slot] = entry;
    };
    const dequeue = (): { index: number; distance: number } => {
      const entry = queue[0], last = queue.pop()!;
      if (queue.length) {
        let slot = 0;
        while (slot * 2 + 1 < queue.length) {
          let child = slot * 2 + 1;
          if (child + 1 < queue.length && queue[child + 1].distance < queue[child].distance) child++;
          if (queue[child].distance >= last.distance) break;
          queue[slot] = queue[child]; slot = child;
        }
        queue[slot] = last;
      }
      return entry;
    };
    const originIndex = world.index(originX, originY);
    field[originIndex] = Math.hypot((originX + 0.5) * world.cellSize - pulse.origin.x,
      (originY + 0.5) * world.cellSize - pulse.origin.y);
    // The virtual parent -1 is the actual pulse position, not its cell centre.
    parents[originIndex] = -1;
    enqueue(originIndex);
    while (queue.length) {
      const { index, distance } = dequeue();
      if (distance !== field[index]) continue;
      const x = index % world.width;
      const y = Math.floor(index / world.width);
      // Keep one cell of margin so an edge just inside the range can be queried.
      if (distance > pulse.maxRadius + world.cellSize) continue;
      const parent = parents[index];
      const anchor = parent < 0 ? pulse.origin : {
        x: (parent % world.width + 0.5) * world.cellSize,
        y: (Math.floor(parent / world.width) + 0.5) * world.cellSize,
      };
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (world.isSolid(nx, ny)) continue;
        if (dx && dy && (world.isSolid(x + dx, y) || world.isSolid(x, y + dy))) continue;
        const neighbour = world.index(nx, ny);
        let visible: boolean;
        if (parent < 0) {
          if (!originVisibility[neighbour]) originVisibility[neighbour] = anchorVisible(anchor, nx, ny) ? 1 : -1;
          visible = originVisibility[neighbour] === 1;
        } else visible = anchorVisible(anchor, nx, ny);
        const nextParent = visible ? parent : index;
        const candidate = visible
          ? (parent < 0 ? 0 : field[parent]) + Math.hypot((nx + 0.5) * world.cellSize - anchor.x, (ny + 0.5) * world.cellSize - anchor.y)
          : distance + world.cellSize * (dx && dy ? Math.SQRT2 : 1);
        // Compare the value that will actually be stored. A double can be
        // smaller yet round to the same Float32, endlessly requeuing a node.
        const storedDistance = Math.fround(candidate);
        if (candidate > pulse.maxRadius + world.cellSize || storedDistance >= field[neighbour]) continue;
        field[neighbour] = storedDistance;
        parents[neighbour] = nextParent;
        enqueue(neighbour);
      }
    }
  }
  const result = { version: world.terrainVersion, field, parents };
  worlds.set(world, result);
  return result;
}

/** Accept only the first solid/open face, never a solid cell's opposite face. */
function boundaryOpenCell(world: World, point: Point): number {
  const gx = point.x / world.cellSize;
  const gy = point.y / world.cellSize;
  const vertical = Math.abs(gx - Math.round(gx)) < 1e-7;
  const horizontal = Math.abs(gy - Math.round(gy)) < 1e-7;
  if (vertical === horizontal) return -1;
  const ax = vertical ? Math.round(gx) - 1 : Math.floor(gx);
  const ay = horizontal ? Math.round(gy) - 1 : Math.floor(gy);
  const bx = vertical ? ax + 1 : ax;
  const by = horizontal ? ay + 1 : ay;
  const aSolid = world.isSolid(ax, ay);
  const bSolid = world.isSolid(bx, by);
  if (aSolid === bSolid) return -1;
  return aSolid ? world.index(bx, by) : world.index(ax, ay);
}

/** Any-angle open-space travel, also usable to draw a round wave inside tunnels. */
export function sonarTravelDistance(world: World, state: VisionState, point: Point): number {
  const pulse = state.sonar;
  if (!pulse || ![point.x, point.y].every(Number.isFinite)
    || point.x < 0 || point.y < 0
    || point.x >= world.width * world.cellSize || point.y >= world.height * world.cellSize) return Infinity;
  const { field, parents } = sonarDistances(world, pulse);
  const boundary = boundaryOpenCell(world, point);
  const x = Math.floor(point.x / world.cellSize);
  const y = Math.floor(point.y / world.cellSize);
  const index = boundary >= 0 ? boundary : world.isSolid(x, y) ? -1 : world.index(x, y);
  if (index < 0 || !Number.isFinite(field[index])) return Infinity;
  const parent = parents[index];
  const anchorX = parent < 0 ? pulse.origin.x : (parent % world.width + 0.5) * world.cellSize;
  const anchorY = parent < 0 ? pulse.origin.y : (Math.floor(parent / world.width) + 0.5) * world.cellSize;
  let distance = (parent < 0 ? 0 : field[parent]) + Math.hypot(point.x - anchorX, point.y - anchorY);
  const centerX = (index % world.width + 0.5) * world.cellSize;
  const centerY = (Math.floor(index / world.width) + 0.5) * world.cellSize;
  if ((point.x !== centerX || point.y !== centerY)
    && !hasLineOfSight(world, { x: anchorX, y: anchorY }, index % world.width, Math.floor(index / world.width), {
      // A face belongs to its open neighbour. Nudge the endpoint inward so
      // traversing to that face cannot accidentally choose the solid side.
      x: point.x + (centerX - point.x) * 1e-7,
      y: point.y + (centerY - point.y) * 1e-7,
    })) distance = field[index] + Math.hypot(point.x - centerX, point.y - centerY);
  return distance <= pulse.maxRadius ? distance : Infinity;
}

/** Reveal only cave boundary segments reached through the current open space. */
export function sonarOpacity(world: World, state: VisionState, point: Point, time: number): number {
  const pulse = state.sonar;
  if (!pulse || ![point.x, point.y, time].every(Number.isFinite)
    || time < pulse.startedAt || time >= pulse.startedAt + SONAR_TRAVEL_TIME + SONAR_OUTLINE_LIFETIME
    || boundaryOpenCell(world, point) < 0) return 0;
  return pulseOpacity(pulse, sonarTravelDistance(world, state, point), time);
}
