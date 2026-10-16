import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { build, loadEnv } from 'vite';

describe('developer tools build flag', () => {
  beforeEach(() => vi.stubEnv('VITE_DEV_TOOLS', undefined));
  afterEach(() => vi.unstubAllEnvs());

  it('enables developer tools for local development and provisional packaged builds', () => {
    expect(loadEnv('development', process.cwd(), 'VITE_DEV_TOOLS').VITE_DEV_TOOLS).toBe('true');
    expect(loadEnv('production', process.cwd(), 'VITE_DEV_TOOLS').VITE_DEV_TOOLS).toBe('true');
  });

  it('disables developer tools for release builds', () => {
    expect(loadEnv('release', process.cwd(), 'VITE_DEV_TOOLS').VITE_DEV_TOOLS).toBe('false');
  });

  it('lets build environment overrides disable tools without editing committed defaults', () => {
    vi.stubEnv('VITE_DEV_TOOLS', 'false');
    expect(loadEnv('production', process.cwd(), 'VITE_DEV_TOOLS').VITE_DEV_TOOLS).toBe('false');
    vi.stubEnv('VITE_DEV_TOOLS', '0');
    expect(loadEnv('production', process.cwd(), 'VITE_DEV_TOOLS').VITE_DEV_TOOLS).toBe('0');
  });

  it('removes the developer panel and its hotkey from the executable release artifact', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const compiledJavaScript = async (mode: string) => {
      const result = await build({ mode, logLevel: 'silent', build: { write: false } });
      if ('on' in result) throw new Error('Expected a completed build, not a watcher.');
      const outputs = Array.isArray(result) ? result : [result];
      return outputs.flatMap(output => output.output)
        .filter(output => output.type === 'chunk')
        .map(output => output.code).join('\n');
    };
    const provisional = await compiledJavaScript('production');
    const release = await compiledJavaScript('release');
    for (const marker of ['dev-credits-form', 'dev-omni-vision', 'data-dev-teleport', 'Teleport to hopper', 'data-dev-end', 'Warp to demo end', 'Backquote']) {
      expect(provisional).toContain(marker);
      expect(release).not.toContain(marker);
    }
    expect(provisional).not.toContain('dev-step-height');
    expect(release).not.toContain('dev-step-height');
  }, 30_000);
});
