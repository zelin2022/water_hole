import { describe, expect, it } from 'vitest';
import { APP_VERSION, DEMO_LABEL, normalizeReleaseLink } from './release-info';

describe('release metadata', () => {
  it('uses the package version for a recognizable demo build label', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/);
    expect(DEMO_LABEL).toBe(`Demo v${APP_VERSION}`);
  });

  it('allows only explicit HTTPS destinations with ordinary ports and no credentials', () => {
    expect(normalizeReleaseLink('https://github.com/zelin2022/water_hole/issues')).toBe('https://github.com/zelin2022/water_hole/issues');
    expect(normalizeReleaseLink('https://store.steampowered.com/app/123456/')).toBe('https://store.steampowered.com/app/123456/');
    for (const value of [undefined, '', 'javascript:alert(1)', 'file:///C:/test', 'http://example.com',
      'https://user:secret@example.com', 'https://example.com:8443', 'https://example.com/#fragment',
      ' https://example.com', 'https:\\example.com', 'https://example.com/\n']) {
      expect(normalizeReleaseLink(value)).toBeNull();
    }
  });
});
