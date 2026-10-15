import { packager } from '@electron/packager';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [platform, arch] = process.argv.slice(2);
if (!['win32:x64', 'darwin:arm64', 'darwin:x64'].includes(`${platform}:${arch}`)) {
  throw new Error('Choose win32 x64, darwin arm64, or darwin x64.');
}
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const stagingParent = path.resolve(tmpdir());
const staging = await mkdtemp(path.join(stagingParent, 'water-hole-package-'));
try {
  // Stage an explicit allowlist: source, tests, documentation, saves, and node_modules stay out.
  await cp(path.join(root, 'dist'), path.join(staging, 'dist'), { recursive: true });
  await cp(path.join(root, 'electron'), path.join(staging, 'electron'), { recursive: true });
  await writeFile(path.join(staging, 'package.json'), JSON.stringify({
    name: manifest.name, productName: 'Water Hole', version: manifest.version,
    description: manifest.description, private: true, type: 'module', main: 'electron/main.cjs',
  }, null, 2));
  const output = await packager({
    dir: staging,
    name: 'Water Hole',
    executableName: 'Water Hole',
    platform,
    arch,
    electronVersion: manifest.devDependencies.electron,
    out: path.join(root, 'release'),
    overwrite: true,
    asar: true,
    prune: true,
    appBundleId: 'com.zelin2022.waterhole',
    darwinDarkModeSupport: true,
    // This has no native application dependencies; all game code is in dist + Electron.
  });
  if (!output.length) throw new Error('No app was produced. macOS packaging on Windows requires symlink privileges; build on a Mac instead.');
  for (const directory of output) console.log(`Packaged: ${directory}`);
} finally {
  // Verify the resolved target before recursively removing our temporary staging directory.
  if (path.dirname(path.resolve(staging)) !== stagingParent || !path.basename(staging).startsWith('water-hole-package-')) {
    throw new Error('Refusing to remove an unexpected staging directory.');
  }
  await rm(staging, { recursive: true, force: true });
}
