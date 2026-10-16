import { MATERIAL_DURABILITY } from './game/digging';

export type TerrainDamageStage = 0 | 1 | 2 | 3 | 4;

/** Saved damage remains physical; presentation uses the fraction of each rock's health. */
export function terrainDamageStage(material: number, damage: number): TerrainDamageStage {
  const durability = MATERIAL_DURABILITY[material];
  if (!Number.isFinite(damage) || damage <= 0 || !Number.isFinite(durability)) return 0;
  return Math.min(4, Math.ceil(damage / durability * 4)) as TerrainDamageStage;
}
