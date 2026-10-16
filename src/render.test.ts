import { describe, expect, it } from 'vitest';
import { Renderer } from './render';
import { World } from './game/world';

/** Only opacity is relevant here; illustration paths are checked in the browser. */
class OpacityCanvas {
  width = 0;
  height = 0;
  readonly pixels = new Set<string>();
  private offsetX = 0;
  private offsetY = 0;
  readonly context = {
    globalCompositeOperation: 'source-over', globalAlpha: 1,
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    setTransform: (_a: number, _b: number, _c: number, _d: number, x: number, y: number): void => { this.offsetX = x; this.offsetY = y; },
    clearRect: (x: number, y: number, w: number, h: number): void => {
      x += this.offsetX; y += this.offsetY;
      for (let py = Math.floor(y); py < y + h; py++) {
        for (let px = Math.floor(x); px < x + w; px++) this.pixels.delete(`${px},${py}`);
      }
    },
    fillRect: (x: number, y: number, w: number, h: number): void => {
      x += this.offsetX; y += this.offsetY;
      if (this.context.globalAlpha <= 0) return;
      for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.height, y + h); py++) {
        for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.width, x + w); px++) {
          const key = `${px},${py}`;
          if (this.context.globalCompositeOperation !== 'source-atop' || this.pixels.has(key)) this.pixels.add(key);
        }
      }
    },
    drawImage: (source: OpacityCanvas, x = 0, y = 0): void => {
      for (const pixel of source.pixels) {
        const [px, py] = pixel.split(',').map(Number);
        const dx = px + x + this.offsetX, dy = py + y + this.offsetY;
        if (dx >= 0 && dy >= 0 && dx < this.width && dy < this.height) this.pixels.add(`${dx},${dy}`);
      }
    },
    beginPath: (): void => {}, moveTo: (): void => {}, lineTo: (): void => {},
    closePath: (): void => {}, fill: (): void => {}, stroke: (): void => {},
  };
  getContext(): typeof this.context { return this.context; }
}

describe('terrain rendering', () => {
  it('paints reinforced support as solid terrain and keeps its decoration out of adjacent air', () => {
    const world = new World(10, 12);
    for (let y = 3; y < 11; y++) {
      for (let x = 1; x < 4; x++) {
        world.material[world.index(x, y)] = 3;
        world.solid[world.index(x, y)] = 1;
      }
    }
    const terrain = new OpacityCanvas();
    const renderer = Object.assign(Object.create(Renderer.prototype), { terrain, materialLayer: new OpacityCanvas(), cameraY: 0, height: 100 }) as {
      cacheTerrain(world: World): void;
    };
    renderer.cacheTerrain(world);

    expect(terrain.pixels.has('9,25')).toBe(true);
    expect(terrain.pixels.has('17,25')).toBe(false);
  });

  it.each([4, 5, 6] as const)('paints material %i without making adjacent cave space opaque', (material) => {
    const world = new World(10, 12);
    for (let y = 3; y < 11; y++) for (let x = 1; x < 4; x++) world.setMaterial(x, y, material);
    const terrain = new OpacityCanvas();
    const renderer = Object.assign(Object.create(Renderer.prototype), { terrain, materialLayer: new OpacityCanvas(), cameraY: 0, height: 100 }) as { cacheTerrain(world: World): void };
    renderer.cacheTerrain(world);
    expect(terrain.pixels.has('9,25')).toBe(true);
    expect(terrain.pixels.has('17,25')).toBe(false);
  });

  it('keeps deep terrain buffers near the camera instead of allocating an entire two-kilometre image', () => {
    const world = new World(10, 2053);
    world.setMaterial(2, 1995, 5);
    const terrain = new OpacityCanvas();
    const renderer = Object.assign(Object.create(Renderer.prototype), { terrain, materialLayer: new OpacityCanvas(), cameraY: 7980, height: 180 }) as {
      terrainTop: number; cacheTerrain(world: World): void;
    };
    renderer.cacheTerrain(world);
    expect(terrain.height).toBeLessThan(600);
    expect(renderer.terrainTop).toBeGreaterThan(7000);
    expect(terrain.pixels.has(`9,${7982 - renderer.terrainTop}`)).toBe(true);
    expect(terrain.pixels.has(`13,${7982 - renderer.terrainTop}`)).toBe(false);
  });
});
