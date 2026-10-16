import { describe, expect, it } from 'vitest';
import { Renderer } from './render';
import { World } from './game/world';

/** Only opacity is relevant here; illustration paths are checked in the browser. */
class OpacityCanvas {
  width = 0;
  height = 0;
  readonly pixels = new Set<string>();
  readonly context = {
    globalCompositeOperation: 'source-over', globalAlpha: 1,
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    clearRect: (x: number, y: number, w: number, h: number): void => {
      for (let py = Math.floor(y); py < y + h; py++) {
        for (let px = Math.floor(x); px < x + w; px++) this.pixels.delete(`${px},${py}`);
      }
    },
    fillRect: (x: number, y: number, w: number, h: number): void => {
      if (this.context.globalAlpha <= 0) return;
      for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.height, y + h); py++) {
        for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.width, x + w); px++) {
          const key = `${px},${py}`;
          if (this.context.globalCompositeOperation !== 'source-atop' || this.pixels.has(key)) this.pixels.add(key);
        }
      }
    },
    drawImage: (source: OpacityCanvas): void => { for (const pixel of source.pixels) this.pixels.add(pixel); },
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
    const renderer = Object.assign(Object.create(Renderer.prototype), { terrain, materialLayer: new OpacityCanvas() }) as {
      cacheTerrain(world: World): void;
    };
    renderer.cacheTerrain(world);

    expect(terrain.pixels.has('9,25')).toBe(true);
    expect(terrain.pixels.has('17,25')).toBe(false);
  });
});
