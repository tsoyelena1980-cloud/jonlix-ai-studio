import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pnpmDir = path.join(root, 'node_modules/.pnpm');
const esbuildDir = readdirSync(pnpmDir).find((name) => name.startsWith('esbuild@'));
if (!esbuildDir) throw new Error('esbuild is not installed');
const require = createRequire(import.meta.url);
const { build } = require(path.join(pnpmDir, esbuildDir, 'node_modules/esbuild'));

await build({
  absWorkingDir: root,
  entryPoints: [path.join(root, 'apps/web/src/lead-api/entry.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: path.join(root, 'api/leads.js'),
  alias: {
    '@jonlix/shared': path.join(root, 'packages/shared/src/index.ts'),
  },
  footer: { js: 'module.exports = module.exports.default;' },
});
