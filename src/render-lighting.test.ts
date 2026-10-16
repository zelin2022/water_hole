import { describe, expect, it } from 'vitest';
import { caveOutlineOpacity, compositeEnvironmentColor, DARKNESS } from './render-lighting';

describe('environment illumination', () => {
  it('conceals the geometry and material colour completely without a light source', () => {
    for (const colour of [[40, 48, 50], [128, 104, 82], [145, 199, 195]] as const) {
      expect(compositeEnvironmentColor(colour, 0, 0)).toEqual(DARKNESS);
    }
  });

  it('adding a lamp never darkens an already moonlit surface, including its blue channel', () => {
    for (const colour of [[40, 48, 50], [128, 104, 82], [225, 235, 245]] as const) {
      let previous = compositeEnvironmentColor(colour, 0.7, 0);
      for (const lamp of [0.05, 0.15, 0.3, 0.6, 1]) {
        const current = compositeEnvironmentColor(colour, 0.7, lamp);
        for (let channel = 0; channel < 3; channel++) expect(current[channel]).toBeGreaterThanOrEqual(previous[channel]);
        previous = current;
      }
    }
    const moonOnly = compositeEnvironmentColor([128, 104, 82], 0.7, 0);
    expect(compositeEnvironmentColor([128, 104, 82], 0.7, 0.3)).not.toEqual(moonOnly);
  });

  it('reveals pale moonlight and a distinct warm lamp tint on a neutral surface', () => {
    const moon = compositeEnvironmentColor([220, 220, 220], 0.6, 0);
    const lamp = compositeEnvironmentColor([220, 220, 220], 0, 0.6);
    expect(moon[2]).toBeGreaterThan(moon[0]);
    expect(Math.max(...moon) - Math.min(...moon)).toBeLessThan(25);
    expect(lamp[0]).toBeGreaterThan(lamp[1]);
    expect(lamp[1]).toBeGreaterThan(lamp[2]);
    expect(lamp[0] - lamp[2]).toBeGreaterThan(35);
  });

  it('keeps a dark sonar cave outline hidden except during a pulse', () => {
    expect(caveOutlineOpacity(false, 0)).toBe(0);
    expect(caveOutlineOpacity(false, 0.8)).toBeCloseTo(0.6);
    expect(caveOutlineOpacity(false, 0)).toBe(0);
    expect(caveOutlineOpacity(true, 0)).toBeGreaterThan(0);
    expect(caveOutlineOpacity(true, 0)).toBeLessThan(0.1);
  });
});
