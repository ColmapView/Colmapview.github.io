import { Vector3 } from 'three';
import { worldToCameraPose } from './cameraMath';
import { finite, importError, positive } from './types';

/** RQ via row orthogonalization. Positive focal lengths fix the projective sign. */
export function decomposePinholeProjection(values: readonly number[], relativeSkewTolerance = 1e-12) {
  if (values.length !== 12) return importError('INVALID_CALIBRATION', 'Projection must have 12 values.');
  const p = values.map((value, index) => finite(value, `projection[${index}]`));
  const norm = positive(Math.hypot(p[8], p[9], p[10]), 'projection scale');
  for (let index = 0; index < p.length; index++) p[index] /= norm;
  const row = (index: number) => new Vector3(p[index * 4], p[index * 4 + 1], p[index * 4 + 2]);
  const determinant = row(0).dot(row(1).cross(row(2)));
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return importError('INVALID_CALIBRATION', 'Singular projection matrix.');
  if (determinant < 0) for (let index = 0; index < p.length; index++) p[index] = -p[index];
  const z = row(2), y = row(1), x = row(0);
  const cy = y.dot(z); y.addScaledVector(z, -cy);
  const fy = positive(y.length(), 'fy'); y.divideScalar(fy);
  const cx = x.dot(z); x.addScaledVector(z, -cx);
  const skew = x.dot(y); x.addScaledVector(y, -skew);
  const fx = positive(x.length(), 'fx'); x.divideScalar(fx);
  if (Math.abs(skew) > relativeSkewTolerance * Math.max(fx, fy)) return importError('UNREPRESENTABLE_DISTORTION', 'Projection contains skew that COLMAP pinhole cameras cannot represent.');
  const tz = p[11], ty = (p[7] - cy * tz) / fy, tx = (p[3] - cx * tz - skew * ty) / fx;
  return { params: [fx, fy, cx, cy].map((value, index) => finite(value, `intrinsic[${index}]`)),
    pose: worldToCameraPose([x.toArray(), y.toArray(), z.toArray()], [tx, ty, tz]), skew };
}
