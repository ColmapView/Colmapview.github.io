import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Generated only inside an explicitly opted-in test, never at collection time. */
export function prepareSplatFixture(count: 100000 | 1000000) {
  const directory = resolve('.tmp/performance/fixtures/splats');
  const path = resolve(directory, `seed42-${count}.ply`);
  const metadataPath = `${path}.json`;
  const properties = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
  if (existsSync(path) && existsSync(metadataPath)) {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    if (metadata.version !== 1 || metadata.splats !== count || createHash('sha256').update(readFileSync(path)).digest('hex') !== metadata.fingerprint) throw new Error(`Fixture mismatch: ${path}`);
    return { path, metadata };
  }
  if (existsSync(path) || existsSync(metadataPath)) throw new Error(`Incomplete fixture; preserve and inspect ${path}`);
  mkdirSync(directory, { recursive: true });
  const header = Buffer.from(['ply', 'format binary_little_endian 1.0', `element vertex ${count}`, ...properties.map(name => `property float ${name}`), 'end_header', ''].join('\n'));
  const rows = Buffer.alloc(count * properties.length * 4);
  let state = 42;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const logScale = Math.log(1.5 / Math.cbrt(count));
  for (let row = 0; row < count; row++) {
    const x = random() * 2 - 1, y = random() * 2 - 1, z = random() * 2 - 1;
    // Saturated red cloud gives screenshot validation a semantic color signal.
    const values = [x, y, z, (0.9 - 0.5) / 0.28209479177387814, (0.1 - 0.5) / 0.28209479177387814, (0.1 - 0.5) / 0.28209479177387814, 3, logScale, logScale, logScale, 1, 0, 0, 0];
    values.forEach((value, column) => rows.writeFloatLE(value, (row * properties.length + column) * 4));
  }
  const bytes = Buffer.concat([header, rows]);
  const metadata = { version: 1, splats: count, seed: 42, fingerprint: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    definition: 'Binary little-endian SH0 PLY; seeded uniform cube, normalized identity quaternions, finite positions, red color, density-scaled isotropic Gaussian radii.' };
  writeFileSync(path, bytes, { flag: 'wx' });
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), { flag: 'wx' });
  return { path, metadata };
}
