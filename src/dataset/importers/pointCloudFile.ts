import type { Point3D } from '../../types/colmap';
import { importError } from './types';

/** Small derived XYZ/RGB PLY, also used for explicitly selected temporal vertices. */
export function xyzRgbPly(points: Iterable<Pick<Point3D, 'xyz' | 'rgb'>>, count: number): File {
  const header = new TextEncoder().encode(`ply\nformat binary_little_endian 1.0\nelement vertex ${count}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`);
  const bytes = new Uint8Array(header.length + count * 15), view = new DataView(bytes.buffer);
  bytes.set(header);
  let offset = header.length;
  for (const { xyz, rgb } of points) {
    if (xyz.some(value => !Number.isFinite(Math.fround(value)))) return importError('INVALID_POINT_CLOUD', 'Point coordinates exceed finite float32 geometry.');
    for (let axis = 0; axis < 3; axis++) view.setFloat32(offset + axis * 4, xyz[axis], true);
    bytes.set(rgb, offset + 12); offset += 15;
  }
  if (offset !== bytes.length) return importError('INVALID_POINT_CLOUD', 'Point count differs from the selected vertices.');
  return new File([bytes], 'points3D.ply');
}

export function validateCloudTransform(matrix: readonly number[]): void {
  if (matrix.length !== 16 || matrix.some(value => !Number.isFinite(value))
    || matrix.slice(12).some((value, index) => value !== Number(index === 3))) {
    return importError('INVALID_POINT_CLOUD', 'Point transform must be a finite affine 4 by 4 matrix in row-major order.');
  }
  const columns = [0, 1, 2].map(column => [0, 1, 2].map(row => matrix[row * 4 + column]));
  const scale = Math.hypot(...columns[0]);
  if (!(scale > 0) || !Number.isFinite(scale) || columns.some(column => Math.abs(Math.hypot(...column) / scale - 1) > 1e-6)
    || columns.some((a, i) => columns.some((b, j) => i !== j && Math.abs(a.reduce((sum, value, axis) => sum + value / scale * (b[axis] / scale), 0)) > 1e-6))) {
    return importError('INVALID_POINT_CLOUD', 'Point transform must be a nonsingular similarity, without shear or unequal scale.');
  }
}
