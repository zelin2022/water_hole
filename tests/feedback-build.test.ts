import { afterEach, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';

async function compiledHTML() {
  const result = await build({ mode: 'release', logLevel: 'silent', build: { write: false } });
  if ('on' in result) throw new Error('Expected a completed build.');
  const outputs = Array.isArray(result) ? result : [result];
  const asset = outputs.flatMap(output => output.output).find(output => output.type === 'asset' && output.fileName === 'index.html');
  if (!asset || asset.type !== 'asset') throw new Error('Missing application HTML.');
  return String(asset.source);
}

describe('feedback network permissions', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('allows the configured HTTPS service for API requests and verification frames', async () => {
    vi.stubEnv('VITE_FEEDBACK_API_URL', 'https://feedback.example.com:8443/');
    const html = await compiledHTML();
    expect(html).toContain("connect-src 'self' ws://127.0.0.1:5173 https://feedback.example.com:8443;");
    expect(html).toContain('frame-src https://feedback.example.com:8443;');
  });

  it('keeps frames disabled when a safe public endpoint has not been configured', async () => {
    vi.stubEnv('VITE_FEEDBACK_API_URL', 'javascript:alert(1)');
    const html = await compiledHTML();
    expect(html).toContain("frame-src 'none';");
    expect(html).not.toContain('javascript:alert(1)');
  });
});
