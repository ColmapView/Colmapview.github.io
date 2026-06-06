import type { GaussianCloud as GsToolboxGaussianCloud } from 'gs-toolbox';

export type GaussianCloud = GsToolboxGaussianCloud;
export type GaussianCloudFormat = 'spz' | 'ply';

export interface LoadedGaussianCloud {
  file: File;
  format: GaussianCloudFormat;
  byteLength: number;
  cloud: GaussianCloud;
}

export function validateGaussianCloud(cloud: GaussianCloud): void {
  if (!Number.isInteger(cloud.count) || cloud.count < 0) {
    throw new Error(`Invalid Gaussian cloud count: ${cloud.count}`);
  }

  requireFloat32Array('positions', cloud.positions, cloud.count * 3);
  requireFloat32Array('scales', cloud.scales, cloud.count * 3);
  requireFloat32Array('rotations', cloud.rotations, cloud.count * 4);
  requireFloat32Array('opacities', cloud.opacities, cloud.count);
  requireFloat32Array('sh0', cloud.sh0, cloud.count * 3);

  if (!Number.isInteger(cloud.shDegree) || cloud.shDegree < 0 || cloud.shDegree > 3) {
    throw new Error(`Invalid Gaussian cloud SH degree: ${cloud.shDegree}`);
  }

  const shCoeffCount = cloud.shDegree > 0 ? (cloud.shDegree + 1) ** 2 - 1 : 0;
  const expectedShNLength = cloud.count * shCoeffCount * 3;
  if (expectedShNLength > 0) {
    requireFloat32Array('shN', cloud.shN, expectedShNLength);
  }
}

function requireFloat32Array(
  name: string,
  value: Float32Array | undefined,
  expectedLength: number
): void {
  if (!(value instanceof Float32Array)) {
    throw new Error(`Invalid Gaussian cloud ${name}: expected Float32Array`);
  }

  if (value.length !== expectedLength) {
    throw new Error(
      `Invalid Gaussian cloud ${name} length: expected ${expectedLength}, got ${value.length}`
    );
  }
}
