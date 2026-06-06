import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evalSH } from 'gs-toolbox';

const rootDir = process.cwd();
const SH_C0 = 0.28209479177387814;
const SH_C1 = 0.4886025119029199;
const SH_C2_0 = 1.092548430592079;
const SH_C2_1 = 0.9461746957575601;
const SH_C2_2 = 0.3153915652525201;
const SH_C2_3 = 0.5462742152960395;
const SH_C3_0 = 2.285228997322329;
const SH_C3_1 = 0.4570457994644658;
const SH_C3_2 = 1.445305721320277;
const SH_C3_3 = 1.865881662950577;
const SH_C3_4 = 1.119528997770346;
const SH_C3_5 = 0.5900435899266435;

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(rootDir, relativePath), 'utf8')) as T;
}

function expectColorClose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < expected.length; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index], 6);
  }
}

function referenceSparkSH(
  sh0: [number, number, number],
  shN: Float32Array,
  degree: number,
  dir: [number, number, number]
): [number, number, number] {
  const [x, y, z] = normalize3(dir);
  const result = [
    SH_C0 * sh0[0],
    SH_C0 * sh0[1],
    SH_C0 * sh0[2],
  ];
  const addCoeff = (basis: number, coeffIndex: number) => {
    const base = (coeffIndex - 1) * 3;
    result[0] += basis * shN[base];
    result[1] += basis * shN[base + 1];
    result[2] += basis * shN[base + 2];
  };

  if (degree >= 1) {
    addCoeff(-SH_C1 * y, 1);
    addCoeff(SH_C1 * z, 2);
    addCoeff(-SH_C1 * x, 3);
  }

  if (degree >= 2) {
    const xx = x * x;
    const yy = y * y;
    const zz = z * z;
    const fTmp0B = -SH_C2_0 * z;
    const fC1 = xx - yy;
    const fS1 = 2 * x * y;
    addCoeff(SH_C2_3 * fS1, 4);
    addCoeff(fTmp0B * y, 5);
    addCoeff(SH_C2_1 * zz - SH_C2_2, 6);
    addCoeff(fTmp0B * x, 7);
    addCoeff(SH_C2_3 * fC1, 8);
  }

  if (degree >= 3) {
    const xx = x * x;
    const yy = y * y;
    const zz = z * z;
    const fC1 = xx - yy;
    const fS1 = 2 * x * y;
    const fTmp0C = -SH_C3_0 * zz + SH_C3_1;
    const fTmp1B = SH_C3_2 * z;
    const fC2 = x * fC1 - y * fS1;
    const fS2 = x * fS1 + y * fC1;
    addCoeff(-SH_C3_5 * fS2, 9);
    addCoeff(fTmp1B * fS1, 10);
    addCoeff(fTmp0C * y, 11);
    addCoeff(z * (SH_C3_3 * zz - SH_C3_4), 12);
    addCoeff(fTmp0C * x, 13);
    addCoeff(fTmp1B * fC1, 14);
    addCoeff(-SH_C3_5 * fC2, 15);
  }

  return [
    clamp01(result[0] + 0.5),
    clamp01(result[1] + 0.5),
    clamp01(result[2] + 0.5),
  ];
}

function normalize3(value: [number, number, number]): [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

describe('Gaussian toolbox release packaging', () => {
  it('uses the vendored package for release installs', () => {
    const packageJson = readJson<{ dependencies: Record<string, string> }>('package.json');
    const packageLockText = readFileSync(join(rootDir, 'package-lock.json'), 'utf8');

    expect(packageJson.dependencies['gs-toolbox']).toBe('file:vendor/gs-toolbox');
    expect(packageLockText).toContain('"gs-toolbox": "file:vendor/gs-toolbox"');
    expect(packageLockText).toContain('"resolved": "vendor/gs-toolbox"');
    expect(packageLockText).not.toContain('file:../../gsplat');
    expect(packageLockText).not.toContain('../../gsplat/packages/gs-toolbox');
    expect(packageLockText).not.toContain('"jszip"');
    expect(existsSync(join(rootDir, 'vendor/gs-toolbox/dist/index.js'))).toBe(true);
    expect(existsSync(join(rootDir, 'vendor/gs-toolbox/dist/index.d.ts'))).toBe(true);
  });

  it('keeps browser-sort exports resolvable without missing optional WASM files', () => {
    const indexJs = readFileSync(join(rootDir, 'vendor/gs-toolbox/dist/index.js'), 'utf8');
    const sortIndexJs = readFileSync(join(rootDir, 'vendor/gs-toolbox/dist/sort/index.js'), 'utf8');

    expect(indexJs).toContain("from './sort/index.js'");
    expect(indexJs).not.toContain("from './sort'");
    expect(sortIndexJs).not.toContain("from './wasm/wrapper'");
    expect(sortIndexJs).toContain('WASM sort modules are not included');
  });

  it('keeps higher-order SH evaluation aligned with the Spark basis and view direction', () => {
    const sh0: [number, number, number] = [0.08, -0.04, 0.03];
    const shN = new Float32Array(45);
    for (let index = 0; index < shN.length; index += 1) {
      shN[index] = (index + 1) * 0.001;
    }
    const dir = normalize3([0.23, -0.41, 0.88]);

    expectColorClose(
      evalSH(sh0, shN, 3, dir[0], dir[1], dir[2]),
      referenceSparkSH(sh0, shN, 3, dir)
    );

    const shaderSource = readFileSync(
      join(rootDir, 'vendor/gs-toolbox/dist/projection/gpu/shaders.js'),
      'utf8'
    );
    expect(shaderSource).toContain('const SH_C2_1: f32 = 0.9461746957575601;');
    expect(shaderSource).toContain('const SH_C3_5: f32 = 0.5900435899266435;');
    expect(shaderSource).toContain('let fTmp0C = -SH_C3_0 * z2 + SH_C3_1;');
    expect(shaderSource).toContain('let viewDir = normalize(g.position - uniforms.camPos);');
    expect(shaderSource).toContain('writeIndices: u32');
    expect(shaderSource).toContain('if (uniforms.writeIndices != 0u)');
    expect(shaderSource).toContain('depths[idx] = sortDepth;');
    expect(shaderSource).not.toContain('const SH_C2_1: f32 = -1.092548430592079;');
    expect(shaderSource).not.toContain('let viewDir = normalize(uniforms.camPos - g.position);');
  });
});
