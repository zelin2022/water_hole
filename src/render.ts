import { COLLECTION_RADIUS, DIG_WINDUP, playerCenter, type Session } from './game/session';
import { strikeCenter } from './game/digging';
import { upgradeStats } from './game/economy';
import { findNearestWater } from './game/detector';
import { SONAR_TRAVEL_TIME, sonarOpacity, sonarTravelDistance, subsurfaceScannerOpacity, type VisionState } from './game/vision';
import type { Point, World } from './game/world';
import { caveOutlineOpacity, DARKNESS, lightTransmission } from './render-lighting';

const ZOOM = 1.8;
const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
const hash = (x: number, y: number): number => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

/** Illustrated presentation; rendering never changes the deterministic site. */
export class Renderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly terrain = document.createElement('canvas');
  private readonly materialLayer = document.createElement('canvas');
  private readonly waterLayer = document.createElement('canvas');
  private readonly lightMask = document.createElement('canvas');
  private readonly lightChannels: [number, number, number] = [0, 0, 0];
  private lightPixels: ImageData | undefined;
  private cachedWorld: World | undefined;
  private cachedVersion = -1;
  private cameraX = 0;
  private cameraY = 0;
  private width = 1;
  private height = 1;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is unavailable.');
    this.context = context;
    this.resize();
  }

  screenToWorld(clientX: number, clientY: number): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) / ZOOM + this.cameraX, y: (clientY - rect.top) / ZOOM + this.cameraY };
  }

  getSonarRadius(session: Session): number {
    const center = playerCenter(session);
    return Math.max(...[
      [this.cameraX, this.cameraY], [this.cameraX + this.width / ZOOM, this.cameraY],
      [this.cameraX, this.cameraY + this.height / ZOOM],
      [this.cameraX + this.width / ZOOM, this.cameraY + this.height / ZOOM],
    ].map(([x, y]) => Math.hypot(x - center.x, y - center.y))) + 32;
  }

  render(session: Session, aim: Point, collecting: boolean, vision: VisionState): void {
    this.resize();
    const { world, player } = session;
    const vw = this.width / ZOOM;
    const vh = this.height / ZOOM;
    this.cameraX = clamp(player.x + player.width / 2 - vw / 2, 0, Math.max(0, world.width * world.cellSize - vw));
    this.cameraY = clamp(player.y + player.height / 2 - vh * 0.42, 0, Math.max(0, world.height * world.cellSize - vh));
    const ctx = this.context;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#121b20';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-this.cameraX, -this.cameraY);
    ctx.imageSmoothingEnabled = true;
    this.drawBackground(world.width * world.cellSize, world.height * world.cellSize, session.surfaceY);
    if (this.cachedWorld !== world || this.cachedVersion !== world.terrainVersion) this.cacheTerrain(world);
    ctx.drawImage(this.terrain, 0, 0);
    this.drawWater(session);
    this.drawFallingDirt(session);
    this.drawMachine(session);
    this.drawActions(session, aim, collecting, vision);
    // All environmental geometry, including cut bevels, water and machinery,
    // receives the same source lighting. No geological cover remains visible
    // in darkness and no post-lighting machine can show through an unlit cave.
    this.drawLighting(session, vision);
    this.drawCaveOutlines(session, vision);
    this.drawWorker(session, aim);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const w = Math.round(this.width * this.dpr);
    const h = Math.round(this.height * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  private bounds(world: World) {
    const s = world.cellSize;
    return {
      minX: Math.max(0, Math.floor(this.cameraX / s)), maxX: Math.min(world.width - 1, Math.ceil((this.cameraX + this.width / ZOOM) / s)),
      minY: Math.max(0, Math.floor(this.cameraY / s)), maxY: Math.min(world.height - 1, Math.ceil((this.cameraY + this.height / ZOOM) / s)),
    };
  }

  private drawBackground(width: number, height: number, ground: number): void {
    const ctx = this.context;
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, '#455d6b'); sky.addColorStop(0.6, '#70858b'); sky.addColorStop(1, '#a5aaa0');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, ground + 28);
    ctx.fillStyle = '#dce6ef'; ctx.beginPath(); ctx.arc(410, Math.max(24, ground - 87), 11, 0, Math.PI * 2); ctx.fill();
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer ? '#8b8d7e' : '#b3ac92';
      ctx.beginPath(); ctx.moveTo(0, ground + 12);
      for (let x = 0; x <= width + 80; x += 80) {
        const ridge = 25 + hash(Math.floor(x / 80), layer + 18) * 45;
        ctx.lineTo(x, ground - ridge - layer * 6); ctx.lineTo(x + 38, ground - ridge + 3);
      }
      ctx.lineTo(width, ground + 28); ctx.lineTo(0, ground + 28); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#283032'; ctx.fillRect(0, ground + 22, width, height);
    for (let y = ground + 22; y < height; y += 96) {
      ctx.fillStyle = Math.floor(y / 96) % 2 ? '#2b3232' : '#303634';
      ctx.beginPath(); ctx.moveTo(0, y);
      for (let x = 0; x <= width + 100; x += 100) ctx.lineTo(x, y + Math.sin(x / 90 + y) * 15);
      ctx.lineTo(width, y + 80); ctx.lineTo(0, y + 80); ctx.closePath(); ctx.fill();
    }
  }

  private cacheTerrain(world: World): void {
    const s = world.cellSize;
    this.terrain.width = this.materialLayer.width = world.width * s;
    this.terrain.height = this.materialLayer.height = world.height * s;
    const terrainContext = this.terrain.getContext('2d')!;
    const layer = this.materialLayer.getContext('2d')!;
    const materials = world.material;
    for (const material of [1, 2, 3]) {
      layer.globalCompositeOperation = 'source-over'; layer.clearRect(0, 0, this.materialLayer.width, this.materialLayer.height);
      layer.fillStyle = material === 1 ? '#806852' : material === 2 ? '#596063' : '#727970';
      for (let y = 0; y < world.height; y++) {
        let start = -1;
        for (let x = 0; x <= world.width; x++) {
          const match = x < world.width && materials[world.index(x, y)] === material;
          if (match && start < 0) start = x;
          if (!match && start >= 0) { layer.fillRect(start * s, y * s, (x - start) * s, s); start = -1; }
        }
      }
      // Surface details stay clipped to actual solid cells, including the support.
      layer.globalCompositeOperation = 'source-atop';
      if (material === 3) {
        // Broad concrete lifts and recessed form ties distinguish manufactured
        // support from geological facets without adding a collision-free ledge.
        for (let y = 0; y < this.terrain.height; y += 48) {
          layer.fillStyle = '#555f5b'; layer.fillRect(0, y, this.terrain.width, 1.5);
          layer.fillStyle = '#8b9185'; layer.fillRect(0, y + 1.5, this.terrain.width, 1);
          for (let x = 16; x < this.terrain.width; x += 32) {
            layer.fillStyle = '#68726a'; layer.fillRect(x, y + 3, 1, 44);
            layer.fillStyle = '#485752'; layer.fillRect(x + 10, y + 18, 2.5, 2.5);
            layer.fillStyle = '#9b9e8b'; layer.fillRect(x + 10, y + 20.5, 2.5, 0.8);
          }
        }
        layer.globalCompositeOperation = 'source-over'; terrainContext.drawImage(this.materialLayer, 0, 0);
        continue;
      }
      // Large stable facets are clipped to each natural material, never tiled per cell.
      const shades = material === 1 ? ['#8e755c', '#74604e', '#9a8063', '#80694f'] : ['#666c6d', '#4f5559', '#707475', '#5c6161'];
      const fw = material === 1 ? 66 : 48;
      const fh = material === 1 ? 42 : 36;
      for (let y = -fh; y < this.terrain.height + fh; y += fh) {
        for (let x = -fw; x < this.terrain.width + fw; x += fw) {
          const h = hash(x, y + material * 97);
          const offset = (Math.floor(y / fh) % 2) * fw * 0.5;
          layer.fillStyle = shades[Math.floor(h * shades.length)]; layer.globalAlpha = material === 1 ? 0.55 : 0.75;
          layer.beginPath(); layer.moveTo(x + offset, y + fh * 0.2); layer.lineTo(x + offset + fw * 0.6, y - h * 7);
          layer.lineTo(x + offset + fw, y + fh * 0.45); layer.lineTo(x + offset + fw * 0.7, y + fh);
          layer.lineTo(x + offset + fw * 0.2, y + fh * 0.9); layer.closePath(); layer.fill();
          if (material === 2 && h > 0.76) {
            layer.strokeStyle = '#323b3e'; layer.lineWidth = 0.8; layer.globalAlpha = 0.35;
            layer.beginPath(); layer.moveTo(x + offset + 8, y + 12); layer.lineTo(x + offset + 23, y + 21);
            layer.lineTo(x + offset + 20, y + 29); layer.stroke();
          }
        }
      }
      layer.globalAlpha = 1; layer.globalCompositeOperation = 'source-over'; terrainContext.drawImage(this.materialLayer, 0, 0);
    }
    const ctx = terrainContext;
    // Bevel every exposed cut, including arbitrary excavation, on its solid side.
    for (let y = 1; y < world.height - 1; y++) {
      for (let x = 1; x < world.width - 1; x++) {
        const index = world.index(x, y);
        if (!world.solid[index]) continue;
        const px = x * s; const py = y * s; const earth = world.material[index] === 1;
        const reinforced = world.material[index] === 3;
        if (!world.isSolid(x, y - 1)) {
          ctx.fillStyle = earth ? '#b09673' : reinforced ? '#bec1a7' : '#92938a'; ctx.fillRect(px, py, s, 1.8);
          ctx.fillStyle = '#15202424'; ctx.fillRect(px, py + 2, s, 2);
        }
        if (!world.isSolid(x - 1, y)) { ctx.fillStyle = earth ? '#a18968' : reinforced ? '#a6af98' : '#7b8281'; ctx.fillRect(px, py, 1.6, s); }
        if (!world.isSolid(x + 1, y)) {
          ctx.fillStyle = '#25303380'; ctx.fillRect(px + s - 1.5, py, 1.5, s);
          if (reinforced) {
            ctx.fillStyle = '#354442'; ctx.fillRect(px + s - 3, py, 3, s);
            ctx.fillStyle = '#b09d6b'; ctx.fillRect(px + s - 2, py, 1, s);
          }
        }
        if (!world.isSolid(x, y + 1)) { ctx.fillStyle = '#1c292b80'; ctx.fillRect(px, py + s - 2, s, 2); }
        if (world.damage[index] > 0) {
          ctx.strokeStyle = '#252b2c'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(px + 0.4, py + 0.3); ctx.lineTo(px + 2.4, py + 2.3); ctx.lineTo(px + 1.3, py + 3.8); ctx.stroke();
        }
      }
    }
    this.cachedWorld = world; this.cachedVersion = world.terrainVersion;
  }

  private drawFallingDirt(session: Session): void {
    const ctx = this.context, size = session.world.cellSize;
    for (const fragment of session.fallingDirt) {
      if (fragment.x + size < this.cameraX || fragment.x > this.cameraX + this.width / ZOOM
        || fragment.y + size < this.cameraY || fragment.y > this.cameraY + this.height / ZOOM) continue;
      ctx.fillStyle = '#806852';
      ctx.beginPath(); ctx.moveTo(fragment.x, fragment.y + size * 0.15);
      ctx.lineTo(fragment.x + size * 0.7, fragment.y); ctx.lineTo(fragment.x + size, fragment.y + size * 0.4);
      ctx.lineTo(fragment.x + size * 0.8, fragment.y + size); ctx.lineTo(fragment.x + size * 0.1, fragment.y + size * 0.85);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b09673'; ctx.fillRect(fragment.x + size * 0.2, fragment.y + size * 0.2, size * 0.5, size * 0.2);
    }
  }

  private drawWater(session: Session): void {
    const { world } = session; const s = world.cellSize;
    if (this.waterLayer.width !== world.width * s || this.waterLayer.height !== world.height * s) {
      this.waterLayer.width = world.width * s; this.waterLayer.height = world.height * s;
    }
    // Rasterize contiguous liquid at integer world pixels, then transform once.
    // Fractional camera zoom must not put antialias seams between liquid rows.
    const ctx = this.waterLayer.getContext('2d')!;
    ctx.clearRect(0, 0, this.waterLayer.width, this.waterLayer.height);
    const { minX, maxX, minY, maxY } = this.bounds(world);
    const depth = ctx.createLinearGradient(0, this.cameraY, 0, this.cameraY + this.height / ZOOM);
    depth.addColorStop(0, '#348f95'); depth.addColorStop(1, '#225e6b');
    for (let y = minY; y <= maxY; y++) {
      let start = -1;
      const flush = (end: number): void => {
        if (start < 0) return;
        ctx.fillStyle = depth;
        ctx.fillRect(start * s, y * s, (end - start) * s, s); start = -1;
      };
      for (let x = minX; x <= maxX + 1; x++) {
        const i = world.index(x, y);
        const amount = x <= maxX ? clamp(world.water[i], 0, 1) : 0;
        if (amount > 0.98) { if (start < 0) start = x; }
        else { flush(x); if (amount > 0.006) { ctx.fillStyle = '#368c94'; ctx.fillRect(x * s, (y + 1 - amount) * s, s, amount * s); } }
      }
    }
    ctx.strokeStyle = '#91c7c3'; ctx.lineWidth = 0.65;
    for (let y = minY; y <= maxY; y++) {
      ctx.beginPath();
      for (let x = minX; x <= maxX; x++) {
        const i = world.index(x, y); const amount = world.water[i];
        if (amount < 0.08 || (y > 0 && world.water[i - world.width] > 0.08)) continue;
        const py = (y + 1 - amount) * s + Math.sin(x * 0.28 + session.time * 1.6) * 0.22;
        ctx.moveTo(x * s, py); ctx.lineTo((x + 1) * s, py);
      }
      ctx.stroke();
    }
    this.context.drawImage(this.waterLayer, 0, 0);
  }

  private drawLighting(session: Session, vision: VisionState): void {
    const { world } = session; const ctx = this.context;
    if (this.lightMask.width !== world.width || this.lightMask.height !== world.height) {
      this.lightMask.width = world.width; this.lightMask.height = world.height;
      this.lightPixels = this.lightMask.getContext('2d')!.createImageData(world.width, world.height);
    }
    const pixels = this.lightPixels!.data;
    for (let index = 0; index < world.solid.length; index++) {
      const transmission = lightTransmission(vision.moonlight[index], vision.lamplight[index], this.lightChannels);
      const offset = index * 4;
      pixels[offset] = Math.round(transmission[0] * 255);
      pixels[offset + 1] = Math.round(transmission[1] * 255);
      pixels[offset + 2] = Math.round(transmission[2] * 255);
      pixels[offset + 3] = 255;
    }
    this.lightMask.getContext('2d')!.putImageData(this.lightPixels!, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(this.lightMask, 0, 0, world.width * world.cellSize, world.height * world.cellSize);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgb(${DARKNESS.join(',')})`;
    ctx.fillRect(this.cameraX, this.cameraY, this.width / ZOOM, this.height / ZOOM);
    ctx.restore();
  }

  private drawCaveOutlines(session: Session, vision: VisionState): void {
    const { world } = session; const s = world.cellSize; const ctx = this.context;
    const { minX, maxX, minY, maxY } = this.bounds(world);
    const paths = Array.from({ length: 8 }, () => new Path2D());
    for (let y = Math.max(1, minY); y <= Math.min(world.height - 2, maxY); y++) {
      for (let x = Math.max(1, minX); x <= Math.min(world.width - 2, maxX); x++) {
        const i = world.index(x, y);
        if (!world.solid[i] || vision.light[i] > 0.3) continue;
        for (const [dx, dy, ax, ay, bx, by] of [[0, -1, 0, 0, 1, 0], [1, 0, 1, 0, 1, 1], [0, 1, 0, 1, 1, 1], [-1, 0, 0, 0, 0, 1]]) {
          if (world.isSolid(x + dx, y + dy)) continue;
          const point = { x: (x + (ax + bx) / 2) * s, y: (y + (ay + by) / 2) * s };
          const sonar = Math.max(sonarOpacity(world, vision, point, session.time), subsurfaceScannerOpacity(vision, point, session.time));
          const opacity = caveOutlineOpacity(sonar);
          if (opacity <= 0) continue;
          const bucket = Math.min(paths.length - 1, Math.ceil(opacity / 0.75 * paths.length) - 1);
          paths[bucket].moveTo((x + ax) * s, (y + ay) * s); paths[bucket].lineTo((x + bx) * s, (y + by) * s);
        }
      }
    }
    for (let i = 0; i < paths.length; i++) {
      ctx.strokeStyle = `rgba(130,188,184,${(i + 1) / paths.length * 0.75})`;
      ctx.lineWidth = 1; ctx.stroke(paths[i]);
    }
    if (vision.sonar) {
      const elapsed = session.time - vision.sonar.startedAt;
      if (elapsed >= 0 && elapsed <= SONAR_TRAVEL_TIME) {
        const distance = elapsed / SONAR_TRAVEL_TIME * vision.sonar.maxRadius;
        const front = new Path2D();
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            if (world.isSolid(x, y)) continue;
            const travel = sonarTravelDistance(world, vision, { x: (x + 0.5) * s, y: (y + 0.5) * s });
            if (travel <= distance && travel > distance - s * 2) front.rect(x * s, y * s, s, s);
          }
        }
        ctx.fillStyle = '#91c1ba33'; ctx.fill(front);
      }
    }
    // The dormant scanner retains the original penetrating radial wave.
    if (vision.subsurfaceScan) {
      const elapsed = session.time - vision.subsurfaceScan.startedAt;
      if (elapsed >= 0 && elapsed <= SONAR_TRAVEL_TIME) {
        ctx.strokeStyle = '#91c1ba33'; ctx.lineWidth = 0.8; ctx.beginPath();
        ctx.arc(vision.subsurfaceScan.origin.x, vision.subsurfaceScan.origin.y, elapsed / SONAR_TRAVEL_TIME * vision.subsurfaceScan.maxRadius, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  private drawMachine(session: Session): void {
    const ctx = this.context; const { x, y } = session.hopper;
    ctx.fillStyle = '#202d30'; ctx.beginPath(); ctx.ellipse(x, session.surfaceY + 1, 43, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#343f42'; ctx.fillRect(x - 33, y + 15, 66, 36);
    ctx.fillStyle = '#717b76'; ctx.fillRect(x - 33, y + 14, 61, 3);
    ctx.fillStyle = '#b49a65'; ctx.fillRect(x - 29, y + 18, 17, 29);
    ctx.fillStyle = '#93815e'; ctx.fillRect(x - 29, y + 43, 17, 4);
    ctx.fillStyle = '#17272b'; ctx.fillRect(x - 7, y + 22, 31, 16);
    ctx.strokeStyle = '#6e8581'; ctx.lineWidth = 1; ctx.strokeRect(x - 7, y + 22, 31, 16);
    ctx.fillStyle = '#b6c9ae'; ctx.font = '7px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(session.tank.credits * 10) / 10} cr`, x + 8, y + 30);
    ctx.fillStyle = '#707b77'; ctx.fillRect(x - 28, y + 51, 11, 5); ctx.fillRect(x + 15, y + 51, 11, 5);
    ctx.fillStyle = '#bca579'; ctx.beginPath(); ctx.moveTo(x - 22, y); ctx.lineTo(x + 22, y);
    ctx.lineTo(x + 10, y + 17); ctx.lineTo(x - 10, y + 17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d3bd94'; ctx.fillRect(x - 23, y - 2, 46, 3);
    ctx.fillStyle = '#253b3e'; ctx.fillRect(x - 19, y + 1, 38, 3);
    ctx.fillStyle = session.unloading ? '#9cc8bb' : '#8d9c89'; ctx.fillRect(x + 26, y + 23, 3, 5);
    ctx.fillStyle = '#c4c5ac'; ctx.font = '6px ui-monospace, monospace'; ctx.fillText('WATER EXCHANGE', x, y - 10);
    if (session.unloading) {
      const source = playerCenter(session); const control = { x: (source.x + x) / 2, y: Math.min(source.y, y) - 21 };
      ctx.strokeStyle = '#64aeb0'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(source.x, source.y);
      ctx.quadraticCurveTo(control.x, control.y, x, y + 3); ctx.stroke(); ctx.fillStyle = '#b1d5cc';
      for (let i = 0; i < 4; i++) {
        const t = (session.time * 1.7 + i / 4) % 1;
        const px = (1 - t) ** 2 * source.x + 2 * (1 - t) * t * control.x + t * t * x;
        const py = (1 - t) ** 2 * source.y + 2 * (1 - t) * t * control.y + t * t * (y + 3);
        ctx.fillRect(px, py, 1.2, 1.2);
      }
    }
  }

  private drawWorker(session: Session, aim: Point): void {
    const ctx = this.context; const p = session.player; const cx = p.x + p.width / 2; const y = p.y;
    const facing = p.wall || session.facing;
    const stride = Math.sin(session.time * (p.wall ? 8 : 12)) * (p.wall ? Math.min(2.4, Math.abs(p.vy) / 30) : p.grounded ? Math.min(2.4, Math.abs(p.vx) / 60) : 0.7);
    ctx.save(); ctx.translate(cx, y); ctx.scale(facing, 1); ctx.lineCap = 'round';
    if (p.wall) {
      // Bent knees and planted toes give attachment a different silhouette,
      // rather than looking like a standing worker frozen against a wall.
      ctx.strokeStyle = '#303d40'; ctx.lineWidth = 4.6;
      ctx.beginPath(); ctx.moveTo(1, 22); ctx.lineTo(-1, 25 - stride); ctx.lineTo(7, 21 - stride); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-4, 22); ctx.lineTo(-6, 28 + stride); ctx.lineTo(7, 30 + stride); ctx.stroke();
      ctx.strokeStyle = '#202d30'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(7, 19 - stride); ctx.lineTo(7, 23 - stride);
      ctx.moveTo(7, 28 + stride); ctx.lineTo(7, 32 + stride); ctx.stroke();
    } else {
      for (const side of [-1, 1]) {
        ctx.strokeStyle = '#303d40'; ctx.lineWidth = 4.6; ctx.beginPath(); ctx.moveTo(side * 3, 22);
        ctx.lineTo(side * 3 + stride * side, 27); ctx.lineTo(side * 3 - stride * side, 30); ctx.stroke();
        ctx.strokeStyle = '#252f32'; ctx.lineWidth = 4; ctx.beginPath();
        ctx.moveTo(side * 3 - stride * side - 1, 31); ctx.lineTo(side * 3 - stride * side + 2, 31); ctx.stroke();
      }
    }
    const th = 12 + session.tank.upgrades.capacity * 3; const tw = 6 + session.tank.upgrades.capacity * 1.2;
    ctx.fillStyle = '#89958c'; ctx.beginPath(); ctx.roundRect(-10 - tw / 2, 23 - th, tw, th, 2); ctx.fill();
    ctx.fillStyle = '#43575b'; ctx.fillRect(-9 - tw / 2, 25 - th, tw - 2, th - 4);
    const fill = (th - 4) * clamp(session.tank.water / session.tank.capacity, 0, 1);
    ctx.fillStyle = '#69aeb0'; ctx.fillRect(-9 - tw / 2, 21 - fill, tw - 2, fill);
    ctx.fillStyle = '#bb7b44'; ctx.beginPath(); ctx.moveTo(-5, 11); ctx.quadraticCurveTo(1, 8, 6, 12);
    ctx.lineTo(6, 22); ctx.quadraticCurveTo(0, 25, -6, 22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d39b62'; ctx.fillRect(-4, 11, 2.5, 9); ctx.fillStyle = '#3a4544'; ctx.fillRect(-6, 21, 12, 2.5);
    if (session.tank.upgrades.wallDig) {
      ctx.strokeStyle = '#c6b78b'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-4, 11); ctx.lineTo(4, 22);
      ctx.moveTo(4, 11); ctx.lineTo(-4, 22); ctx.stroke();
    }
    if (p.wall) {
      ctx.strokeStyle = '#c28a51'; ctx.lineWidth = 3.3; ctx.beginPath(); ctx.moveTo(-1, 13); ctx.lineTo(3, 8 + stride); ctx.lineTo(8, 5 + stride); ctx.stroke();
      ctx.fillStyle = '#343f3d'; ctx.beginPath(); ctx.roundRect(6.6, 3.5 + stride, 2.5, 4, 1); ctx.fill();
      if (!session.tank.upgrades.wallDig) {
        // Without the harness both hands are occupied; no pickaxe or swing arm.
        ctx.strokeStyle = '#dfaa6e'; ctx.lineWidth = 3.3;
        ctx.beginPath(); ctx.moveTo(2, 16); ctx.lineTo(4, 20 - stride); ctx.lineTo(8, 15 - stride); ctx.stroke();
        ctx.fillStyle = '#343f3d'; ctx.beginPath(); ctx.roundRect(6.6, 13.5 - stride, 2.5, 4, 1); ctx.fill();
      }
    }
    ctx.restore();
    // Mirror independently, then tilt: facing left does not turn the helmet upside down.
    const aimX = aim.x - cx;
    const aimY = aim.y - (y + 6);
    const hf = aimX === 0 && aimY === 0 ? session.facing : aimX >= 0 ? 1 : -1;
    const tilt = Math.atan2(aimY, Math.abs(aimX));
    ctx.save(); ctx.translate(cx, y + 6); ctx.scale(hf, 1); ctx.rotate(tilt);
    ctx.fillStyle = '#d7b77b'; ctx.beginPath(); ctx.ellipse(0, 0, 6.4, 5.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0d29a'; ctx.beginPath(); ctx.ellipse(-0.5, -2.2, 5.8, 3.3, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2c444a'; ctx.beginPath(); ctx.roundRect(0, -1.4, 6.1, 4.1, 1.5); ctx.fill();
    ctx.fillStyle = '#8caaa6'; ctx.fillRect(2, -0.5, 2.5, 1.3);
    ctx.fillStyle = '#3b4747'; ctx.fillRect(4.8, -3.4, 2.5, 3); ctx.fillStyle = '#f1e4b8'; ctx.fillRect(6.2, -2.9, 1.4, 2);
    ctx.restore();
    if (p.wall && !session.tank.upgrades.wallDig) return;
    const origin = playerCenter(session); const base = Math.atan2(aim.y - origin.y, aim.x - origin.x);
    const windup = session.strikeTime >= 0 ? clamp(session.strikeTime / DIG_WINDUP, 0, 1) : 0;
    const age = session.lastStrike ? session.time - session.lastStrike.time : 1;
    const impact = age < 0.13 ? 1 - age / 0.13 : 0;
    const angle = base - facing * (windup + (impact ? -0.12 * impact : 0.25));
    const reach = windup || impact ? upgradeStats(session.tank).digRadius + 12 : 18;
    ctx.strokeStyle = '#c18b53'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(origin.x - facing * 2, origin.y - 3); ctx.lineTo(origin.x + Math.cos(angle) * 8, origin.y + Math.sin(angle) * 8); ctx.stroke();
    ctx.strokeStyle = '#8a7353'; ctx.lineWidth = 2.3; ctx.beginPath();
    ctx.moveTo(origin.x + Math.cos(angle) * 6, origin.y + Math.sin(angle) * 6); ctx.lineTo(origin.x + Math.cos(angle) * reach, origin.y + Math.sin(angle) * reach); ctx.stroke();
    ctx.save(); ctx.translate(origin.x + Math.cos(angle) * reach, origin.y + Math.sin(angle) * reach); ctx.rotate(angle);
    ctx.fillStyle = session.tank.upgrades.digDamage ? '#bdc4b6' : '#8b9b97';
    const ps = 6 + session.tank.upgrades.digRadius * 1.8;
    ctx.beginPath(); ctx.moveTo(-2, -ps); ctx.lineTo(2.5, -ps + 2); ctx.lineTo(3.5, 3); ctx.lineTo(-2.5, ps); ctx.lineTo(0, 2); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  private drawActions(session: Session, aim: Point, collecting: boolean, vision: VisionState): void {
    const ctx = this.context; const origin = playerCenter(session); const stats = upgradeStats(session.tank);
    const center = strikeCenter(origin, aim, stats.digRadius, session.facing);
    if (!session.player.wall || session.tank.upgrades.wallDig) {
      ctx.strokeStyle = '#d6bc864d'; ctx.lineWidth = 0.75;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(center.x, center.y, stats.digRadius, i * Math.PI / 2 - 0.12, i * Math.PI / 2 + 0.12); ctx.stroke(); }
    }
    if (session.lastStrike?.damaged) {
      const age = session.time - session.lastStrike.time;
      if (age >= 0 && age < 0.28) {
        ctx.globalAlpha = 1 - age / 0.28; ctx.fillStyle = '#b6a083';
        for (let i = 0; i < 7; i++) {
          const angle = hash(i, session.lastStrike.time) * Math.PI * 2; const radius = 3 + age * (13 + hash(i, 33) * 19);
          ctx.fillRect(session.lastStrike.center.x + Math.cos(angle) * radius, session.lastStrike.center.y + Math.sin(angle) * radius + age ** 2 * 50, 1 + i % 2, 1 + i % 2);
        }
        ctx.globalAlpha = 1;
      }
    }
    if (collecting && session.tank.water < session.tank.capacity) {
      const { world } = session; const s = world.cellSize; let displayed = 0;
      for (let y = Math.floor((origin.y - COLLECTION_RADIUS) / s); y <= Math.ceil((origin.y + COLLECTION_RADIUS) / s); y++) {
        for (let x = Math.floor((origin.x - COLLECTION_RADIUS) / s); x <= Math.ceil((origin.x + COLLECTION_RADIUS) / s); x++) {
          if (!world.inBounds(x, y)) continue;
          const i = world.index(x, y);
          if (world.water[i] < 0.05 || !vision.visible[i] || hash(x, y) > 0.13 || displayed > 7) continue;
          const px = (x + 0.5) * s; const py = (y + 0.5) * s;
          if (Math.hypot(px - origin.x, py - origin.y) > COLLECTION_RADIUS) continue;
          const t = (session.time * 2.5 + hash(x, y)) % 1;
          ctx.fillStyle = '#94c5c1'; ctx.beginPath(); ctx.ellipse(px + (origin.x - px) * t, py + (origin.y - py) * t - Math.sin(t * Math.PI) * 3, 1, 1.5, 0, 0, Math.PI * 2); ctx.fill(); displayed++;
        }
      }
    }
    const detection = stats.detectorRadius > 0 ? findNearestWater(session.world, origin, stats.detectorRadius) : null;
    if (detection) {
      const angle = Math.atan2(detection.position.y - origin.y, detection.position.x - origin.x);
      ctx.save(); ctx.translate(origin.x + Math.cos(angle) * 36, origin.y + Math.sin(angle) * 36); ctx.rotate(angle);
      ctx.fillStyle = '#90c4bf'; ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, -3.5); ctx.lineTo(-1, 0); ctx.lineTo(-3, 3.5); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
}
