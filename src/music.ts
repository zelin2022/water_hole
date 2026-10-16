/** A shared harmonic clock lets scene layers crossfade without changing songs. */
export const MUSIC_BEAT_SECONDS = 0.8;
export const MUSIC_BLEND_SECONDS = 1.6;

export interface MusicMix {
  exploration: number;
  returning: number;
  depth: number;
  surface: number;
}

export type MusicLayer = keyof MusicMix | 'common';
export interface MusicNote {
  layer: MusicLayer;
  frequency: number;
  duration: number;
  volume: number;
  offset: number;
  attack: number;
  type: OscillatorType;
}

function unit(value: number): number {
  return Number.isNaN(value) ? 0 : Math.max(0, Math.min(1, value));
}
function smoothstep(value: number): number { return value * value * (3 - 2 * value); }

/** Depth uses HUD metres; tankFill is current carried water / current capacity. */
export function musicMix(depth: number, tankFill: number): MusicMix {
  const underground = smoothstep(unit(depth / 160));
  const returning = smoothstep(unit(tankFill));
  return { exploration: 1 - returning * 0.65, returning, depth: underground, surface: 1 - underground };
}

/** About 92% of a scene change arrives in four seconds, at any update rate. */
export function advanceMusicMix(current: MusicMix, target: MusicMix, elapsed: number): MusicMix {
  const blend = Number.isFinite(elapsed) && elapsed > 0 ? 1 - Math.exp(-elapsed / MUSIC_BLEND_SECONDS) : 0;
  return {
    exploration: current.exploration + (target.exploration - current.exploration) * blend,
    returning: current.returning + (target.returning - current.returning) * blend,
    depth: current.depth + (target.depth - current.depth) * blend,
    surface: current.surface + (target.surface - current.surface) * blend,
  };
}

const roots = [110, 87.307, 97.999, 82.407];
const melodies = [
  [57, 60, 64, 62, 57, 55, 60, 59, 57, 64, 62, 60, 55, 52, 55, 57],
  [57, 64, 60, 62, 60, 57, 65, 60, 59, 62, 67, 62, 64, 59, 56, 59],
  [64, 60, 57, 60, 65, 60, 57, 55, 62, 59, 55, 59, 64, 59, 56, 57],
  [57, 60, 62, 64, 60, 65, 64, 60, 59, 62, 64, 67, 64, 59, 56, 57],
];

/** Original quiet sine motif with four phrases and related layers in A minor. */
export function musicNotes(beat: number): MusicNote[] {
  const step = Math.max(0, Number.isFinite(beat) ? Math.floor(beat) : 0);
  const phrase = Math.floor(step / 16) % melodies.length;
  const inBar = step % 4;
  const root = roots[Math.floor(step / 4) % roots.length];
  const notes: MusicNote[] = [];
  const add = (layer: MusicLayer, frequency: number, duration: number, volume: number, offset = 0, attack = 0.04, type: OscillatorType = 'sine') => {
    notes.push({ layer, frequency, duration, volume, offset, attack, type });
  };
  const midi = melodies[phrase][step % 16];
  add('exploration', 440 * 2 ** ((midi - 69) / 12), 1.5, inBar === 0 ? 0.25 : 0.21);

  // A gentler rising arpeggio makes a full tank feel like movement home. It
  // shares each chord with the exploration line, so any fill ratio can blend.
  const returningRatios = phrase % 2 === 0 ? [2, 3, 4, 3] : [3, 4, 3, 2];
  add('returning', root * returningRatios[inBar], 1.2, 0.16, 0, 0.07, 'triangle');
  if (inBar === 1 || inBar === 3) add('returning', root * (phrase % 2 === 0 ? 4 : 3), 0.85, 0.065, 0.4, 0.09);
  if (inBar === 0) {
    add('common', root, 3.1, 0.24, 0, 0.12);
    add('common', root * 1.5, 3.1, 0.10, 0, 0.12);
    add('depth', root * 0.5, 3.5, 0.20, 0, 0.45);
    add('depth', root * 0.75, 3.5, 0.06, 0, 0.45);
    add('surface', root * (phrase % 2 === 0 ? 4 : 3), 2.6, 0.075, 0, 0.18);
  } else if (inBar === 2) {
    add('surface', root * (phrase % 2 === 0 ? 6 : 4), 1.8, 0.055, 0.2, 0.16);
  }
  return notes;
}
