import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, readSettings, rebind } from './settings';

describe('player settings', () => {
  it('reserves Escape for pause and menu navigation even when pause is rebound', () => {
    const bindings = { ...DEFAULT_SETTINGS.bindings, pause: 'KeyP' };
    expect(rebind(bindings, 'dig', 'Escape')).toBe(false);
    const stored = { ...bindings, dig: 'Escape' };
    expect(readSettings(JSON.stringify({ bindings: stored })).bindings).toEqual(DEFAULT_SETTINGS.bindings);
  });
  it('falls back safely for corrupt saved preferences', () => {
    expect(readSettings('{bad')).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(JSON.stringify({ music: 9, sfx: -2, resolution: 'bad' })).music).toBe(1);
    expect(readSettings(JSON.stringify({ music: 9, sfx: -2, resolution: 'bad' })).sfx).toBe(0);
  });
  it('keeps conflicting key assignments from disabling another action', () => {
    const bindings = { ...DEFAULT_SETTINGS.bindings };
    expect(rebind(bindings, 'jump', bindings.left)).toBe(false);
    expect(bindings.jump).toBe('Space');
    expect(rebind(bindings, 'jump', 'KeyJ')).toBe(true);
    expect(bindings.jump).toBe('KeyJ');
  });
  it('restores a complete valid binding map and rejects saved conflicts', () => {
    const settings = readSettings(JSON.stringify({ bindings: { ...DEFAULT_SETTINGS.bindings, jump: 'KeyJ' } }));
    expect(settings.bindings.jump).toBe('KeyJ');
    const broken = { ...settings.bindings, left: 'KeyJ' };
    expect(readSettings(JSON.stringify({ bindings: broken })).bindings).toEqual(DEFAULT_SETTINGS.bindings);
    expect(Object.keys(settings.bindings).length).toBeGreaterThan(8);
  });
});
