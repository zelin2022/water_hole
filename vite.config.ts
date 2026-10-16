import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // The native shell permits only the exact destinations compiled into this build.
  const links = [env.VITE_FEEDBACK_URL, env.VITE_STORE_URL].filter(Boolean);
  return {
    base: './',
    define: { __APP_VERSION__: JSON.stringify(manifest.version) },
    server: { port: 5173, strictPort: true },
    plugins: [{ name: 'release-links', generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'release-links.json', source: JSON.stringify(links) });
    } }],
  };
});
