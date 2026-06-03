import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const sourceDir = resolve(root, 'colmap-wasm', 'build');
const targetDir = resolve(root, 'public', 'wasm');
const files = ['colmap_wasm.js', 'colmap_wasm.wasm'];

mkdirSync(targetDir, { recursive: true });

for (const file of files) {
  copyFileSync(resolve(sourceDir, file), resolve(targetDir, file));
}
