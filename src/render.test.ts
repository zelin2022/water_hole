import { describe, expect, it } from 'vitest';
import { Renderer } from './render';
import { World } from './game/world';
import type { Session } from './game/session';
import { createPlayer } from './game/player';
import { createTank } from './game/economy';
import { createVision } from './game/vision';

describe('tank equipment rendering', () => {
  it('grows through all ten sizes without extending above the worker or changing carried water', () => {
    const shapes: number[][] = [];
    const context = new Proxy<Record<string, unknown>>({
      roundRect: (...values: number[]) => shapes.push(values),
    }, { get: (target, key) => target[String(key)] ?? (() => {}) });
    const renderer = Object.assign(Object.create(Renderer.prototype), { context }) as {
      drawWorker(session: Session, aim: { x: number; y: number }): void;
    };
    const tank = createTank();
    const session = { player: createPlayer(72, 88), tank, facing: 1, time: 0,
      strikeTime: -1, lastStrike: null } as Session;
    let previousHeight = 0;
    for (let level = 0; level <= 9; level++) {
      tank.upgrades.capacity = level; tank.capacity = 20 + level * 20; tank.water = tank.capacity;
      shapes.length = 0;
      renderer.drawWorker(session, { x: 200, y: 104 });
      const [, top, width, height] = shapes[0];
      expect(top).toBeGreaterThanOrEqual(5);
      expect(width).toBeLessThanOrEqual(8.4);
      expect(height).toBeLessThanOrEqual(18);
      expect(height).toBeGreaterThan(previousHeight);
      expect(tank.water).toBe(tank.capacity);
      previousHeight = height;
    }
  });
});

describe('terrain halo lighting', () => {
  it.each([
    { scale: 1, x: 0, y: 0, waterRect: [52, 52, 4, 4], rockRect: [48, 52, 4, 4], litRect: [52, 56, 4, 4], farRect: [80, 52, 4, 4] },
    { scale: 1.8, x: -0.3, y: -0.7, waterRect: [93, 92, 8, 9], rockRect: [86, 92, 8, 9], litRect: [93, 100, 8, 8], farRect: [143, 92, 8, 9] },
  ])('seals nearby zero-light water at scale $scale while preserving rock and normal lighting', ({ scale, x, y, waterRect, rockRect, litRect, farRect }) => {
    const world = new World(30, 30, 4), vision = createVision(world);
    const player = createPlayer(32, 40), tank = createTank();
    const water = world.index(13, 13), rock = world.index(12, 13), litAir = world.index(13, 14);
    world.water[water] = 1;
    world.setSolid(12, 13, true);
    vision.light[rock] = vision.lamplight[rock] = 0.4;
    vision.light[litAir] = vision.lamplight[litAir] = 0.3;
    const before = { solid: world.solid.slice(), water: world.water.slice(), light: vision.light.slice() };
    const rectangles: number[][] = [];
    const fills: Array<{ operation: string; color: string; rectangles: number[][] }> = [];
    const context = {
      globalCompositeOperation: 'source-over', fillStyle: '', imageSmoothingEnabled: true,
      save: () => {}, restore: () => {}, drawImage: () => {}, fillRect: () => {},
      getTransform: () => ({ a: scale, d: scale, e: x, f: y }), setTransform: () => {},
      beginPath: () => { rectangles.length = 0; },
      rect: (...values: number[]) => rectangles.push(values),
      fill: () => fills.push({ operation: context.globalCompositeOperation, color: context.fillStyle,
        rectangles: rectangles.map(rectangle => [...rectangle]) }),
    };
    const maskContext = {
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: () => {},
    };
    const renderer = Object.assign(Object.create(Renderer.prototype), {
      context, lightMask: { width: 0, height: 0, getContext: () => maskContext },
      lightChannels: [0, 0, 0], cameraX: 0, cameraY: 0, width: 120, height: 120,
    }) as { drawLighting(session: Session, vision: ReturnType<typeof createVision>): void };
    renderer.drawLighting({ world, player, tank } as Session, vision);

    const seal = fills.find(fill => fill.operation === 'source-over' && fill.color === 'rgb(8,12,16)');
    expect(seal).toBeDefined();
    expect(seal?.rectangles).toContainEqual(waterRect);
    expect(seal?.rectangles).not.toContainEqual(rockRect);
    expect(seal?.rectangles).not.toContainEqual(litRect);
    expect(seal?.rectangles).not.toContainEqual(farRect);
    expect(world.solid).toEqual(before.solid);
    expect(world.water).toEqual(before.water);
    expect(vision.light).toEqual(before.light);
  });
});

/** Only opacity is relevant here; illustration paths are checked in the browser. */
class OpacityCanvas {
  width = 0;
  height = 0;
  readonly pixels = new Set<string>();
  readonly fills: Array<{ x: number; y: number; width: number; height: number; alpha: number }> = [];
  readonly lines: Array<{ x: number; y: number }> = [];
  readonly patches: Array<{ alpha: number; color: string }> = [];
  readonly clips: Array<{ x: number; y: number; width: number; height: number }> = [];
  private path: Array<{ x: number; y: number }> = [];
  private clipBox: { x: number; y: number; width: number; height: number } | undefined;
  private saved: Array<{ alpha: number; clip: { x: number; y: number; width: number; height: number } | undefined }> = [];
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
      this.fills.push({ x, y, width: w, height: h, alpha: this.context.globalAlpha });
      for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.height, y + h); py++) {
        for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.width, x + w); px++) {
          if (this.clipBox && (px < this.clipBox.x || py < this.clipBox.y
            || px >= this.clipBox.x + this.clipBox.width || py >= this.clipBox.y + this.clipBox.height)) continue;
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
    createLinearGradient: () => ({ addColorStop: (): void => {} }),
    save: (): void => { this.saved.push({ alpha: this.context.globalAlpha, clip: this.clipBox }); },
    restore: (): void => { const previous = this.saved.pop()!; this.context.globalAlpha = previous.alpha; this.clipBox = previous.clip; },
    beginPath: (): void => { this.path = []; },
    moveTo: (x: number, y: number): void => { this.path.push({ x, y }); },
    lineTo: (x: number, y: number): void => { this.path.push({ x, y }); this.lines.push({ x: x + this.offsetX, y: y + this.offsetY }); },
    rect: (x: number, y: number, width: number, height: number): void => {
      this.clipBox = { x: x + this.offsetX, y: y + this.offsetY, width, height };
    },
    clip: (): void => { if (this.clipBox) this.clips.push({ ...this.clipBox }); },
    closePath: (): void => {},
    fill: (): void => {
      this.patches.push({ alpha: this.context.globalAlpha, color: this.context.fillStyle });
      if (!this.path.length) return;
      const xs = this.path.map(point => point.x), ys = this.path.map(point => point.y);
      this.context.fillRect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    },
    stroke: (): void => {},
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

function renderTerrain(world: World, cameraY = 0): { terrain: OpacityCanvas; top: number } {
  const terrain = new OpacityCanvas();
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    terrain, materialLayer: new OpacityCanvas(), cameraY, height: 100,
  }) as { terrainTop: number; cacheTerrain(world: World): void };
  renderer.cacheTerrain(world);
  return { terrain, top: renderer.terrainTop };
}

describe('terrain damage rendering', () => {
  it('adds bruising, branching cracks and chipped rubble as the same terrain loses health', () => {
    const render = (damage: number) => {
      const world = new World(10, 12);
      world.setMaterial(4, 5, 6);
      world.damage[world.index(4, 5)] = damage;
      return renderTerrain(world).terrain;
    };
    const intact = render(0), light = render(1), heavy = render(14);
    expect(light.patches.length).toBeGreaterThan(intact.patches.length);
    expect(heavy.patches.length).toBeGreaterThan(light.patches.length);
    expect(heavy.lines.length).toBeGreaterThan(light.lines.length);
    expect(heavy.fills.length).toBeGreaterThan(light.fills.length);
    expect(heavy.patches[0].alpha).toBeGreaterThan(light.patches[0].alpha);
  });

  it('clips every damaged cell, keeps air and water clear, and preserves terrain state', () => {
    const world = new World(10, 12, 8);
    world.setMaterial(4, 5, 5);
    world.damage[world.index(4, 5)] = 9;
    world.water[world.index(5, 5)] = 1;
    const before = { solid: world.solid.slice(), damage: world.damage.slice(), water: world.water.slice() };
    const { terrain } = renderTerrain(world);
    expect(terrain.clips).toContainEqual({ x: 32, y: 40, width: 8, height: 8 });
    expect(terrain.pixels.has('39,45')).toBe(true);
    expect(terrain.pixels.has('40,45')).toBe(false);
    expect(terrain.pixels.has('31,45')).toBe(false);
    expect(world.solid).toEqual(before.solid);
    expect(world.damage).toEqual(before.damage);
    expect(world.water).toEqual(before.water);
  });

  it('does not show damage on foundation or sealed boundaries even with stale values', () => {
    const world = new World(10, 12);
    world.setMaterial(4, 5, 3);
    world.damage[world.index(4, 5)] = 100;
    world.damage[world.index(0, 5)] = 100;
    const { terrain } = renderTerrain(world);
    expect(terrain.patches).toHaveLength(0);
    expect(terrain.lines).toHaveLength(0);
  });

  it('reproduces partially damaged deep terrain from saved values without camera-dependent patterns', () => {
    const world = new World(10, 2053);
    world.setMaterial(4, 1995, 2);
    world.damage[world.index(4, 1995)] = 4.5;
    const restored = new World(world.width, world.height, world.cellSize);
    restored.solid.set(world.solid); restored.material.set(world.material); restored.damage.set(world.damage);
    const first = renderTerrain(world, 7980), second = renderTerrain(restored, 7960);
    expect(first.terrain.patches).toEqual(second.terrain.patches);
    expect(first.terrain.lines.map(point => ({ x: point.x, y: point.y + first.top })))
      .toEqual(second.terrain.lines.map(point => ({ x: point.x, y: point.y + second.top })));
    expect(first.terrain.clips).toHaveLength(1);
    expect(second.terrain.pixels.has(`17,${7982 - second.top}`)).toBe(true);
  });
});

function renderWater(world: World, cameraY = 0): { water: OpacityCanvas; output: OpacityCanvas } {
  const water = new OpacityCanvas();
  const output = new OpacityCanvas();
  output.width = world.width * world.cellSize;
  output.height = world.height * world.cellSize;
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    waterLayer: water, context: output.context,
    cameraX: 0, cameraY, width: 100, height: 80,
  }) as { drawWater(session: Session): void };
  renderer.drawWater({ world, time: 0 } as Session);
  return { water, output };
}

describe('water rendering', () => {
  it('draws unsupported partial water as a continuous translucent column without pool surface stripes', () => {
    const world = new World(10, 14);
    for (let y = 3; y <= 6; y++) world.water[world.index(4, y)] = 0.25;
    const before = world.water.slice();
    const { water } = renderWater(world);

    for (let y = 12; y < 28; y++) expect(water.pixels.has(`17,${y}`)).toBe(true);
    expect(water.fills).toHaveLength(4);
    expect(water.fills.every(fill => fill.height === 4 && fill.alpha > 0 && fill.alpha < 1)).toBe(true);
    expect(water.lines).toHaveLength(0);
    expect(water.context.globalAlpha).toBe(1);
    expect(world.water).toEqual(before);
  });

  it('retains the actual height and surface highlight of a supported partial puddle', () => {
    const world = new World(10, 12);
    world.setSolid(4, 7, true);
    world.water[world.index(4, 6)] = 0.25;
    const { water } = renderWater(world);

    expect(water.pixels.has('17,24')).toBe(false);
    expect(water.pixels.has('17,26')).toBe(false);
    expect(water.pixels.has('17,27')).toBe(true);
    expect(water.fills).toEqual([{ x: 16, y: 27, width: 4, height: 1, alpha: 1 }]);
    expect(water.lines).toHaveLength(1);
  });

  it('supports water above a full cell and makes denser falling water less transparent', () => {
    const world = new World(10, 14);
    world.water[world.index(2, 4)] = 0.25;
    world.water[world.index(2, 5)] = 1;
    world.water[world.index(5, 4)] = 0.25;
    world.water[world.index(6, 4)] = 0.75;
    const { water } = renderWater(world);

    const supported = water.fills.find(fill => fill.x === 8 && fill.y >= 16 && fill.y < 20)!;
    const lightStream = water.fills.find(fill => fill.x === 20 && fill.y === 16)!;
    const denseStream = water.fills.find(fill => fill.x === 24 && fill.y === 16)!;
    expect(supported.height).toBe(1);
    expect(supported.alpha).toBe(1);
    expect(lightStream.height).toBe(4);
    expect(denseStream.height).toBe(4);
    expect(denseStream.alpha).toBeGreaterThan(lightStream.alpha);
  });

  it('does not draw stale liquid values in solid terrain', () => {
    const world = new World(10, 12);
    world.setSolid(4, 5, true);
    world.water[world.index(4, 5)] = 0.5;
    const { water } = renderWater(world);
    expect(water.fills).toHaveLength(0);
    expect(water.lines).toHaveLength(0);
  });

  it('keeps falling columns continuous in a viewport far below the surface', () => {
    const world = new World(10, 2053);
    for (let y = 1995; y <= 1998; y++) world.water[world.index(4, y)] = 0.25;
    const { water, output } = renderWater(world, 7980);

    expect(water.height).toBeLessThan(100);
    for (let y = 0; y < 16; y++) {
      expect(water.pixels.has(`17,${y}`)).toBe(true);
      expect(output.pixels.has(`17,${7980 + y}`)).toBe(true);
    }
    expect(water.lines).toHaveLength(0);
  });
});
