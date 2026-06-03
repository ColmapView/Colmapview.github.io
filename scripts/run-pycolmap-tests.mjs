import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const env = { ...process.env };

if (process.argv.includes('--regen')) {
  env.REGEN_FIXTURES = '1';
}

const result = spawnSync('uv', ['run', 'pytest'], {
  cwd: resolve(root, 'tests', 'pycolmap'),
  env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(`[pycolmap] failed to start uv: ${result.error.message}`);
}

process.exit(result.status ?? 1);
