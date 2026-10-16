import { describe, expect, it } from 'vitest';
import { advanceMusicMix, musicMix, musicNotes } from './music';

describe('adaptive score', () => {
  it('moves from exploring to returning as the current tank fills, at any depth', () => {
    const empty = musicMix(0, 0);
    const half = musicMix(0, 0.5);
    const full = musicMix(0, 1);
    expect(empty.returning).toBe(0);
    expect(full.returning).toBe(1);
    expect(half.returning).toBeGreaterThan(empty.returning);
    expect(half.returning).toBeLessThan(full.returning);
    expect(full.exploration).toBeLessThan(empty.exploration);
    expect(musicMix(160, 1).returning).toBe(full.returning);
  });

  it('replaces surface airiness with a lower underground pad gradually with depth', () => {
    const surface = musicMix(0, 0);
    const middle = musicMix(80, 0);
    const deep = musicMix(160, 0);
    expect(surface.depth).toBe(0);
    expect(deep.depth).toBe(1);
    expect(surface.surface).toBe(1);
    expect(deep.surface).toBe(0);
    expect(middle.depth).toBeGreaterThan(0);
    expect(middle.depth).toBeLessThan(1);
    expect(musicMix(79.99, 0.5).depth).toBeCloseTo(musicMix(80.01, 0.5).depth, 3);
  });

  it('clamps scene inputs and treats invalid values as a quiet surface exploration', () => {
    expect(musicMix(-100, -2)).toEqual(musicMix(0, 0));
    expect(musicMix(1000, 4)).toEqual(musicMix(160, 1));
    expect(musicMix(Number.NaN, Number.NaN)).toEqual(musicMix(0, 0));
  });

  it('crossfades continuously without overshoot, independent of the update rate', () => {
    const initial = musicMix(0, 0);
    const target = musicMix(160, 1);
    const first = advanceMusicMix(initial, target, 0.05);
    expect(first.returning).toBeGreaterThan(0);
    expect(first.returning).toBeLessThan(0.1);
    let split = initial;
    for (let i = 0; i < 80; i++) {
      const next = advanceMusicMix(split, target, 0.05);
      expect(next.returning).toBeGreaterThanOrEqual(split.returning);
      expect(next.returning).toBeLessThanOrEqual(1);
      split = next;
    }
    const whole = advanceMusicMix(initial, target, 4);
    expect(split.returning).toBeCloseTo(whole.returning, 10);
    expect(whole.returning).toBeGreaterThan(0.9);
    expect(whole.returning).toBeLessThan(1);
    expect(advanceMusicMix(initial, target, -1)).toEqual(initial);
    expect(advanceMusicMix(initial, target, Number.NaN)).toEqual(initial);
  });

  it('keeps the original melodic direction while varying compatible phrases deterministically', () => {
    const phrase = (start: number) => Array.from({ length: 16 }, (_, i) => musicNotes(start + i));
    expect(phrase(0)).toEqual(phrase(0));
    expect(phrase(0)).not.toEqual(phrase(16));
    expect(musicNotes(0).some(note => note.layer === 'exploration' && Math.abs(note.frequency - 220) < 0.01)).toBe(true);
    const layers = new Set(phrase(0).flat().map(note => note.layer));
    expect(layers).toEqual(new Set(['common', 'exploration', 'returning', 'depth', 'surface']));
    for (const note of [...phrase(0), ...phrase(16), ...phrase(32), ...phrase(48)].flat()) {
      expect(note.frequency).toBeGreaterThan(20);
      expect(note.duration).toBeGreaterThan(0);
      expect(note.volume).toBeGreaterThan(0);
      expect(note.volume).toBeLessThanOrEqual(0.3);
      expect(note.offset).toBeGreaterThanOrEqual(0);
      expect(note.offset).toBeLessThan(0.8);
    }
  });
});
