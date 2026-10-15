export interface Point {
  x: number;
  y: number;
}

export type Material = 0 | 1 | 2;

/** A finite terrain grid. Positions outside its sealed boundary are solid. */
export class World {
  readonly solid: Uint8Array;
  readonly water: Float32Array;
  /** 0 = air, 1 = earth, 2 = stone. Keep edits synchronized through setMaterial. */
  readonly material: Uint8Array;
  /** Accumulated pickaxe damage, reset when a cell changes material or breaks. */
  readonly damage: Float32Array;
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
    this.material = new Uint8Array(width * height);
    this.damage = new Float32Array(width * height);

    // Initial terrain is version zero; subsequent edits invalidate render caches.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (this.isBoundary(x, y)) {
          this.solid[this.index(x, y)] = 1;
          this.material[this.index(x, y)] = 2;
        }
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
    if (!this.inBounds(cellX, cellY)) return;
    const material = this.material[this.index(cellX, cellY)] as Material;
    this.setMaterial(cellX, cellY, solid ? material || 1 : 0);
  }

  /** Solid replacement never destroys water; the outer boundary is immutable. */
  setMaterial(cellX: number, cellY: number, material: Material): void {
    if (!this.inBounds(cellX, cellY) || this.isBoundary(cellX, cellY)) return;
    if (material !== 0 && material !== 1 && material !== 2) throw new RangeError('Unknown terrain material.');
    const index = this.index(cellX, cellY);
    if (this.material[index] === material) return;
    if (material && this.water[index] > 0) {
      throw new Error('Cannot make a water-filled cell solid.');
    }
    this.material[index] = material;
    this.solid[index] = material ? 1 : 0;
    this.damage[index] = 0;
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
