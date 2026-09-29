// Regenerates e2e/fixtures/splats/sog-scene.{ply,sog}: a seeded 2,000-splat
// SH1 torus, ringed in the XY plane, encoded with PlayCanvas's reference converter.
// It sits at (0.15, 0, 0), midway between the e2e dataset's two cameras: that is the
// target of the viewer's default view, about 0.34 m away, so the torus is sized to fit
// the centre crop the e2e specs capture. The .ply is byte-identical on every run; the
// .sog is not (zip timestamps and the converter's randomly seeded SH k-means palette).
// Dev-time only:
//   node scripts/generate-sog-fixture.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = 'e2e/fixtures/splats';
const count = 2000;
const CENTER = [0.15, 0, 0];
const MAJOR = 0.04;
const MINOR = 0.012;
let seed = 42;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const SH_C0 = 0.28209479177387814;
const props = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', ...Array.from({ length: 9 }, (_, i) => `f_rest_${i}`),
  'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${count}\n${props.map((p) => `property float ${p}`).join('\n')}\nend_header\n`;
const body = new Float32Array(count * props.length);
for (let i = 0; i < count; i++) {
  const u = rand() * Math.PI * 2;
  const v = rand() * Math.PI * 2;
  const ring = MAJOR + MINOR * Math.cos(v);
  const [x, y, z] = [CENTER[0] + ring * Math.cos(u), CENTER[1] + ring * Math.sin(u), CENTER[2] + MINOR * Math.sin(v)];
  const rgb = [0.5 + 0.45 * Math.cos(u), 0.5 + 0.45 * Math.sin(u), 0.5 + 0.45 * Math.sin(v)];
  const q = [rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5];
  const n = Math.hypot(...q);
  body.set([
    x, y, z,
    ...rgb.map((c) => (c - 0.5) / SH_C0),
    ...Array.from({ length: 9 }, () => (rand() - 0.5) * 0.2),
    3,
    // Splat sizes scale with the tube radius so the ring's hole stays open.
    Math.log(MINOR * (0.15 + rand() * 0.1)), Math.log(MINOR * (0.15 + rand() * 0.1)), Math.log(MINOR * (0.05 + rand() * 0.05)),
    ...q.map((c) => c / n),
  ], i * props.length);
}
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/sog-scene.ply`, Buffer.concat([Buffer.from(header, 'ascii'), Buffer.from(body.buffer)]));
execFileSync('npx', ['--yes', '@playcanvas/splat-transform@3.7.0', '-g', 'cpu', '-w', `${out}/sog-scene.ply`, `${out}/sog-scene.sog`],
  { stdio: 'inherit', shell: process.platform === 'win32' });
