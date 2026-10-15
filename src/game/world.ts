export interface Point {
  x: number;
  y: number;
}

/** A finite terrain grid. Positions outside its sealed boundary are solid. */
export class World {
  readonly solid: Uint8Array;
  readonly water: Float32Array;
  terrainVersion = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize = 4,
  ) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
      throw new RangeError('World dimensions must be integers of at least two cells.');
    }
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new RangeError('World cell size must be positive.');
    }
    this.solid = new Uint8Array(width * height);
    this.water = new Float32Array(width * height);

    // Initial terrain is version zero; subsequent edits invalidate render caches.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (this.isBoundary(x, y)) this.solid[this.index(x, y)] = 1;
      }
    }
  }

  inBounds(cellX: number, cellY: number): boolean {
    return Number.isInteger(cellX) && Number.isInteger(cellY)
      && cellX >= 0 && cellY >= 0 && cellX < this.width && cellY < this.height;
  }

  index(cellX: number, cellY: number): number {
    return cellY * this.width + cellX;
  }

  isSolid(cellX: number, cellY: number): boolean {
    return !this.inBounds(cellX, cellY) || this.solid[this.index(cellX, cellY)] !== 0;
  }

  isSolidAtPixel(pixelX: number, pixelY: number): boolean {
    return this.isSolid(Math.floor(pixelX / this.cellSize), Math.floor(pixelY / this.cellSize));
  }

  setSolid(cellX: number, cellY: number, solid: boolean): void {
    if (!this.inBounds(cellX, cellY) || this.isBoundary(cellX, cellY)) return;
    const index = this.index(cellX, cellY);
    const next = solid ? 1 : 0;
    if (this.solid[index] === next) return;
    if (solid && this.water[index] > 0) {
      throw new Error('Cannot make a water-filled cell solid.');
    }
    this.solid[index] = next;
    this.terrainVersion++;
  }

  private isBoundary(cellX: number, cellY: number): boolean {
    return cellX === 0 || cellY === 0 || cellX === this.width - 1 || cellY === this.height - 1;
  }
}

/** Remove a circular brush, counting only cells whose centers are within reach. */
export function dig(world: World, origin: Point, aim: Point, radius: number, reach: number): number {
  if (![origin.x, origin.y, aim.x, aim.y, radius, reach].every(Number.isFinite)
    || radius < 0 || reach < 0) return 0;

  const dx = aim.x - origin.x;
  const dy = aim.y - origin.y;
  const distance = Math.hypot(dx, dy);
  const scale = distance > reach ? reach / distance : 1;
  const centerX = origin.x + dx * scale;
  const centerY = origin.y + dy * scale;
  const size = world.cellSize;
  const minX = Math.max(1, Math.floor((centerX - radius) / size));
  const maxX = Math.min(world.width - 2, Math.floor((centerX + radius) / size));
  const minY = Math.max(1, Math.floor((centerY - radius) / size));
  const maxY = Math.min(world.height - 2, Math.floor((centerY + radius) / size));
  const radiusSquared = radius * radius;
  const reachSquared = reach * reach;
  let removed = 0;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const cellX = (x + 0.5) * size;
      const cellY = (y + 0.5) * size;
      if ((cellX - centerX) ** 2 + (cellY - centerY) ** 2 > radiusSquared
        || (cellX - origin.x) ** 2 + (cellY - origin.y) ** 2 > reachSquared
        || !world.isSolid(x, y)) continue;
      world.setSolid(x, y, false);
      removed++;
    }
  }
  return removed;
}
