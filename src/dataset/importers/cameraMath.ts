import { Matrix4, Quaternion, Vector3 } from 'three';
import { finite, importError } from './types';

export interface ColmapPose {
  qvec: [number, number, number, number];
  tvec: [number, number, number];
}

function rows(value: unknown, count: number, field: string): number[][] {
  if (!Array.isArray(value) || value.length !== count) return importError('INVALID_POSE', `${field} must have ${count} rows.`);
  return value.map((row, i) => {
    if (!Array.isArray(row) || row.length !== count) return importError('INVALID_POSE', `${field}[${i}] must have ${count} numbers.`);
    return row.map((v, j) => finite(v, `${field}[${i}][${j}]`));
  });
}

export function validateRotation(value: unknown, field: string): number[][] {
  const r = rows(value, 3, field);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const dot = r[0][i]*r[0][j] + r[1][i]*r[1][j] + r[2][i]*r[2][j];
    if (Math.abs(dot - Number(i === j)) > 1e-5) return importError('INVALID_POSE', `${field} contains scale or shear.`);
  }
  const det = r[0][0]*(r[1][1]*r[2][2]-r[1][2]*r[2][1])
    - r[0][1]*(r[1][0]*r[2][2]-r[1][2]*r[2][0]) + r[0][2]*(r[1][0]*r[2][1]-r[1][1]*r[2][0]);
  if (Math.abs(det-1) > 1e-5) return importError('INVALID_POSE', `${field} must be a proper rotation (determinant +1).`);
  return r;
}

function quaternion(r: number[][]): Quaternion {
  const matrix = new Matrix4().set(
    ...r[0] as [number,number,number], 0,
    ...r[1] as [number,number,number], 0,
    ...r[2] as [number,number,number], 0,
    0,0,0,1,
  );
  const q = new Quaternion().setFromRotationMatrix(matrix).normalize();
  // A stable hemisphere makes equivalent orientations deterministic on export.
  const first = [q.w,q.x,q.y,q.z].find(v => Math.abs(v) > 1e-15);
  if (first !== undefined && first < 0) q.set(-q.x,-q.y,-q.z,-q.w);
  return q;
}

function result(q: Quaternion, t: Vector3): ColmapPose {
  if (![q.w,q.x,q.y,q.z,t.x,t.y,t.z].every(Number.isFinite)) return importError('INVALID_POSE','Pose conversion produced nonfinite coordinates.');
  return { qvec: [q.w,q.x,q.y,q.z], tvec: [t.x,t.y,t.z] };
}

/** OpenGL C2W -> OpenCV W2C. Change the camera basis on the right, preserving world coordinates. */
export function nerfCameraToColmap(value: unknown, field = 'transform_matrix'): ColmapPose {
  const m = rows(value, 4, field);
  if (m[3].some((v,i) => Math.abs(v-Number(i === 3)) > 1e-8)) return importError('INVALID_POSE', `${field} must be affine with last row [0,0,0,1].`);
  validateRotation(m.slice(0,3).map(row => row.slice(0,3)), field);
  const r = [[m[0][0],m[1][0],m[2][0]],[-m[0][1],-m[1][1],-m[2][1]],[-m[0][2],-m[1][2],-m[2][2]]];
  const q = quaternion(r);
  // Compute translation using the normalized rotation that COLMAP will reload.
  const t = new Vector3(m[0][3],m[1][3],m[2][3]).applyQuaternion(q).negate();
  return result(q,t);
}

export function worldToCameraPose(rotation: unknown, translation: unknown, field = 'pose'): ColmapPose {
  const r = validateRotation(rotation, `${field}.rotation`);
  if (!Array.isArray(translation) || translation.length !== 3) return importError('INVALID_POSE', `${field}.translation must have three numbers.`);
  return result(quaternion(r), new Vector3(...translation.map((v,i) => finite(v, `${field}.translation[${i}]`)) as [number,number,number]));
}

export function worldToCameraFromCenter(rotation: unknown, center: unknown, field = 'pose'): ColmapPose {
  const r = validateRotation(rotation, `${field}.rotation`);
  if (!Array.isArray(center) || center.length !== 3) return importError('INVALID_POSE', `${field}.center must have three numbers.`);
  const q = quaternion(r);
  return result(q, new Vector3(...center.map((v,i) => finite(v, `${field}.center[${i}]`)) as [number,number,number]).applyQuaternion(q).negate());
}

export function rodrigues(value: unknown, field: string): number[][] {
  if (!Array.isArray(value) || value.length !== 3) return importError('INVALID_POSE', `${field} must have three numbers.`);
  const v = new Vector3(...value.map((x,i) => finite(x, `${field}[${i}]`)) as [number,number,number]);
  const angle = Math.hypot(v.x,v.y,v.z);
  const m = new Matrix4().makeRotationFromQuaternion(angle > 0 ? new Quaternion().setFromAxisAngle(v.divideScalar(angle),angle) : new Quaternion());
  const e = m.elements;
  return [[e[0],e[4],e[8]],[e[1],e[5],e[9]],[e[2],e[6],e[10]]];
}

export function bundlerCameraToColmap(rotation: unknown, translation: unknown, field: string): ColmapPose {
  const r = validateRotation(rotation, `${field}.rotation`);
  if (!Array.isArray(translation) || translation.length !== 3) return importError('INVALID_POSE', `${field}.translation must have three numbers.`);
  const t = translation.map((v,i) => finite(v, `${field}.translation[${i}]`));
  return worldToCameraPose([r[0],r[1].map(v => -v),r[2].map(v => -v)],[t[0],-t[1],-t[2]],field);
}
