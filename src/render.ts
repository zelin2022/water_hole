import { COLLECTION_RADIUS, DIG_RADIUS, DIG_REACH, type Session } from './game/session';
import type { World } from './game/world';

const ZOOM = 1.5;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** Presentation only: the simulation owns all movement, liquid, and economy state. */
export class Renderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly terrain = document.createElement('canvas');
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

  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / ZOOM + this.cameraX,
      y: (clientY - rect.top) / ZOOM + this.cameraY,
    };
  }

  render(session: Session, aim: { x: number; y: number }, collecting: boolean): void {
    this.resize();
    const { world, player } = session;
    const worldWidth = world.width * world.cellSize;
    const worldHeight = world.height * world.cellSize;
    const viewportWidth = this.width / ZOOM;
    const viewportHeight = this.height / ZOOM;
    this.cameraX = clamp(player.x + player.width / 2 - viewportWidth / 2, 0, Math.max(0, worldWidth - viewportWidth));
    this.cameraY = clamp(player.y + player.height / 2 - viewportHeight * 0.42, 0, Math.max(0, worldHeight - viewportHeight));

    const ctx = this.context;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#141e23';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-this.cameraX, -this.cameraY);
    ctx.imageSmoothingEnabled = false;

    const ground = session.hopper.y + 56;
    this.drawBackground(worldWidth, worldHeight, ground);
    if (this.cachedWorld !== world || this.cachedVersion !== world.terrainVersion) this.cacheTerrain(world, ground);
    ctx.drawImage(this.terrain, 0, 0);
    this.drawWater(session);
    this.drawMachine(session, ground);
    this.drawPlayer(session, aim);
    this.drawAim(session, aim, collecting);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const backingWidth = Math.round(this.width * this.dpr);
    const backingHeight = Math.round(this.height * this.dpr);
    if (this.canvas.width !== backingWidth || this.canvas.height !== backingHeight) {
      this.canvas.width = backingWidth;
      this.canvas.height = backingHeight;
    }
  }

  private drawBackground(worldWidth: number, worldHeight: number, ground: number): void {
    const ctx = this.context;
    ctx.fillStyle = '#182327';
    ctx.fillRect(0, ground, worldWidth, worldHeight - ground);
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, '#1a303c');
    sky.addColorStop(1, '#30484c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, worldWidth, ground);

    ctx.fillStyle = '#bfd0ba';
    ctx.beginPath();
    ctx.arc(590, 66, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#293e43';
    ctx.beginPath();
    ctx.moveTo(0, ground);
    for (let x = 0; x <= worldWidth; x += 64) {
      ctx.lineTo(x, ground - 18 - Math.sin(x * 0.009) * 10 - Math.sin(x * 0.025) * 5);
    }
    ctx.lineTo(worldWidth, ground);
    ctx.closePath();
    ctx.fill();

    // Subtle strata stay visible in excavated space without drawing a cell grid.
    ctx.strokeStyle = '#223035';
    ctx.lineWidth = 1;
    for (let y = ground + 72; y < worldHeight; y += 96) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(worldWidth, y + 7);
      ctx.stroke();
    }
  }

  private cacheTerrain(world: World, ground: number): void {
    const size = world.cellSize;
    this.terrain.width = world.width * size;
    this.terrain.height = world.height * size;
    const ctx = this.terrain.getContext('2d');
    if (!ctx) throw new Error('Terrain rendering is unavailable.');

    for (let y = 0; y < world.height; y++) {
      const depth = Math.max(0, y * size - ground);
      const fade = Math.min(1, depth / 800);
      const red = Math.round(104 - fade * 34);
      const green = Math.round(83 - fade * 22);
      const blue = Math.round(65 - fade * 9);
      ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      // A run of solid cells is one rectangle, regardless of simulation cell count.
      let runStart = -1;
      for (let x = 0; x <= world.width; x++) {
        const solid = x < world.width && world.solid[world.index(x, y)] !== 0;
        if (solid && runStart < 0) runStart = x;
        if (!solid && runStart >= 0) {
          ctx.fillRect(runStart * size, y * size, (x - runStart) * size, size);
          runStart = -1;
        }
      }

      // Exposed upper surfaces make small excavations readable at a glance.
      ctx.fillStyle = y * size <= ground ? '#a28e64' : '#88725a';
      runStart = -1;
      for (let x = 0; x <= world.width; x++) {
        const exposed = x < world.width && world.solid[world.index(x, y)] !== 0
          && y > 0 && world.solid[world.index(x, y - 1)] === 0;
        if (exposed && runStart < 0) runStart = x;
        if (!exposed && runStart >= 0) {
          ctx.fillRect(runStart * size, y * size, (x - runStart) * size, 1);
          runStart = -1;
        }
      }
    }

    // Deterministic flecks supply scale without outlining individual cells.
    ctx.fillStyle = '#ffffff0a';
    for (let y = 3; y < world.height - 1; y += 5) {
      for (let x = 2 + (y % 7); x < world.width - 1; x += 11) {
        if (world.solid[world.index(x, y)]) ctx.fillRect(x * size, y * size, 2, 1);
      }
    }
    this.cachedWorld = world;
    this.cachedVersion = world.terrainVersion;
  }

  private drawWater(session: Session): void {
    const { world } = session;
    const size = world.cellSize;
    const minX = Math.max(0, Math.floor(this.cameraX / size));
    const maxX = Math.min(world.width - 1, Math.ceil((this.cameraX + this.width / ZOOM) / size));
    const minY = Math.max(0, Math.floor(this.cameraY / size));
    const maxY = Math.min(world.height - 1, Math.ceil((this.cameraY + this.height / ZOOM) / size));
    const ctx = this.context;
    ctx.fillStyle = '#50b7c6';
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const amount = clamp(world.water[world.index(x, y)], 0, 1);
        if (amount < 0.005) continue;
        ctx.fillRect(x * size, (y + 1 - amount) * size, size, amount * size);
      }
    }
    ctx.fillStyle = '#a5e5df';
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const amount = clamp(world.water[world.index(x, y)], 0, 1);
        if (amount < 0.08 || (y > 0 && world.water[world.index(x, y - 1)] > 0.08)) continue;
        ctx.fillRect(x * size, (y + 1 - amount) * size, size, 0.7);
      }
    }
  }

  private drawMachine(session: Session, ground: number): void {
    const ctx = this.context;
    const { x, y } = session.hopper;
    ctx.fillStyle = '#101d22';
    ctx.fillRect(x - 39, ground - 5, 78, 5);
    ctx.fillStyle = '#718b87';
    ctx.fillRect(x - 33, y + 13, 66, 38);
    ctx.fillStyle = '#425c5e';
    ctx.fillRect(x - 30, y + 16, 60, 33);
    ctx.fillStyle = '#273e42';
    ctx.fillRect(x - 25, y + 21, 37, 18);
    ctx.fillStyle = '#a7d9a1';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`$${Math.floor(session.tank.credits)}`, x - 21, y + 30);
    ctx.fillStyle = '#cfb782';
    ctx.beginPath();
    ctx.moveTo(x - 22, y - 2);
    ctx.lineTo(x + 22, y - 2);
    ctx.lineTo(x + 11, y + 13);
    ctx.lineTo(x - 11, y + 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#25393b';
    ctx.fillRect(x - 19, y - 2, 38, 4);
    ctx.fillStyle = '#bedbc0';
    ctx.fillRect(x + 20, y + 23, 4, 4);
    ctx.fillStyle = '#a5b9b2';
    ctx.font = '7px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WATER EXCHANGE', x, y - 15);
  }

  private drawPlayer(session: Session, aim: { x: number; y: number }): void {
    const ctx = this.context;
    const player = session.player;
    const x = Math.round(player.x);
    const y = Math.round(player.y);
    const facing = player.wall || (aim.x >= x + player.width / 2 ? 1 : -1);
    const stride = player.grounded ? Math.sin(session.time * 15) * Math.min(2, Math.abs(player.vx) / 70) : 0;

    ctx.fillStyle = '#13242b';
    ctx.fillRect(x - 1, y + 3, player.width + 2, player.height - 2);
    // High-contrast work suit, helmet, and visor at the collision body's scale.
    ctx.fillStyle = '#df9252';
    ctx.fillRect(x + 2, y + 11, 12, 15);
    ctx.fillStyle = '#f3b867';
    ctx.fillRect(x + 1, y + 1, 14, 10);
    ctx.fillStyle = '#263f47';
    ctx.fillRect(facing > 0 ? x + 7 : x + 2, y + 4, 7, 5);
    ctx.fillStyle = '#b0e3df';
    ctx.fillRect(facing > 0 ? x + 11 : x + 2, y + 4, 3, 2);
    ctx.fillStyle = '#384a4d';
    ctx.fillRect(x + 2, y + 25 + stride, 5, 7 - stride);
    ctx.fillRect(x + 9, y + 25 - stride, 5, 7 + stride);
    // The tank is visible on the side opposite the aim and fills with collected water.
    const tankX = facing > 0 ? x - 4 : x + 13;
    ctx.fillStyle = '#bac9bf';
    ctx.fillRect(tankX, y + 12, 7, 13);
    ctx.fillStyle = '#21363b';
    ctx.fillRect(tankX + 1, y + 13, 5, 11);
    const fill = 10 * clamp(session.tank.water / session.tank.capacity, 0, 1);
    ctx.fillStyle = '#71d4d6';
    ctx.fillRect(tankX + 1, y + 24 - fill, 5, fill);
    // Hand/tool follows the cursor without affecting the simulation.
    const centerX = x + player.width / 2;
    const centerY = y + player.height / 2;
    const angle = Math.atan2(aim.y - centerY, aim.x - centerX);
    ctx.strokeStyle = '#e9b878';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(angle) * 11, centerY + Math.sin(angle) * 11);
    ctx.stroke();
    ctx.fillStyle = '#b4c7bf';
    ctx.fillRect(centerX + Math.cos(angle) * 12 - 2, centerY + Math.sin(angle) * 12 - 2, 4, 4);
  }

  private drawAim(session: Session, aim: { x: number; y: number }, collecting: boolean): void {
    const ctx = this.context;
    const originX = session.player.x + session.player.width / 2;
    const originY = session.player.y + session.player.height / 2;
    const dx = aim.x - originX;
    const dy = aim.y - originY;
    const distance = Math.hypot(dx, dy);
    const scale = distance > DIG_REACH ? DIG_REACH / distance : 1;
    const x = originX + dx * scale;
    const y = originY + dy * scale;
    ctx.strokeStyle = '#f2d3a4bb';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(x, y, DIG_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f6dfb8';
    ctx.fillRect(x - 1, y - 1, 2, 2);

    if (collecting) {
      ctx.strokeStyle = '#8de3e1aa';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(originX, originY, COLLECTION_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4 + session.time * 0.5;
        const radius = 8 + ((1 - (session.time * 1.7) % 1) * (COLLECTION_RADIUS - 8));
        ctx.fillStyle = '#a8efeb';
        ctx.fillRect(originX + Math.cos(angle) * radius - 1, originY + Math.sin(angle) * radius - 1, 2, 2);
      }
    }
  }
}
