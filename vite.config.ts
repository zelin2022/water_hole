import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function feedbackOrigin(value: string | undefined): string | null {
  if (!value || value.trim() !== value || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash ? url.origin : null;
  } catch { return null; }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // The native shell permits only the exact destinations compiled into this build.
  const links = [env.VITE_FEEDBACK_URL, env.VITE_STORE_URL].filter(Boolean);
  const apiOrigin = feedbackOrigin(env.VITE_FEEDBACK_API_URL);
  return {
    base: './',
    define: { __APP_VERSION__: JSON.stringify(manifest.version) },
    server: { port: 5173, strictPort: true },
    plugins: [{ name: 'feedback-network-permissions', transformIndexHtml(html) {
      return html.replace("connect-src 'self' ws://127.0.0.1:5173;",
        `connect-src 'self' ws://127.0.0.1:5173${apiOrigin ? ` ${apiOrigin}` : ''}; frame-src ${apiOrigin ?? "'none'"};`);
    } }, { name: 'release-links', generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'release-links.json', source: JSON.stringify(links) });
    } }],
  };
});
