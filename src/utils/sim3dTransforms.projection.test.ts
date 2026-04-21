/**
 * Numerical check: after transformCameraPose + transformPoint, projecting any
 * 3D point through the new camera must reproduce the same normalized-image-plane
 * coordinates as the original (point, camera) pair. If this holds, the sim3d
 * export math is self-consistent at the projection level — meaning "poses not
 * aligned to PC after transform" complaints are a rendering/UI issue, not a
 * math bug.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createSim3dFromEuler,
  transformPoint,
  transformCameraPose,
} from './sim3dTransforms';

type Vec3 = [number, number, number];

function projectNormalized(
  qvec: [number, number, number, number],
  tvec: Vec3,
  xyz: Vec3,
): { x: number; y: number; z: number } {
  // P_cam = R_c * P + t_c, where R_c = quaternion from COLMAP qvec (w,x,y,z)
  const q = new THREE.Quaternion(qvec[1], qvec[2], qvec[3], qvec[0]);
  const p = new THREE.Vector3(xyz[0], xyz[1], xyz[2]);
  p.applyQuaternion(q);
  p.x += tvec[0];
  p.y += tvec[1];
  p.z += tvec[2];
  // Normalized image plane (x/z, y/z)
  return { x: p.x / p.z, y: p.y / p.z, z: p.z };
}

describe('transformCameraPose + transformPoint preserve projection', () => {
  // A realistic-ish bicycle-dataset-style camera pose
  const qvec: [number, number, number, number] = [
    0.9015232185173201, -0.071399717394061, -0.4232897078625928, -0.054624079377334545,
  ];
  const tvec: Vec3 = [0.002767, -1.1024, 3.8378];
  const worldPoints: Vec3[] = [
    [0.5, 0.2, 1.0],
    [-1.0, 0.0, 2.5],
    [2.3, -0.8, 0.3],
    [0.0, 0.0, 0.0],
    [-0.2, 0.9, -1.4],
  ];

  const cases: { label: string; euler: Parameters<typeof createSim3dFromEuler>[0] }[] = [
    {
      label: 'pure rotation (Y 45°)',
      euler: { scale: 1, rotationX: 0, rotationY: Math.PI / 4, rotationZ: 0, translationX: 0, translationY: 0, translationZ: 0 },
    },
    {
      label: 'pure translation',
      euler: { scale: 1, rotationX: 0, rotationY: 0, rotationZ: 0, translationX: 1.5, translationY: -0.7, translationZ: 0.3 },
    },
    {
      label: 'pure scale (2x)',
      euler: { scale: 2, rotationX: 0, rotationY: 0, rotationZ: 0, translationX: 0, translationY: 0, translationZ: 0 },
    },
    {
      label: 'full Sim3D: rotation + translation + scale',
      euler: { scale: 1.37, rotationX: 0.12, rotationY: 0.8, rotationZ: -0.25, translationX: 0.4, translationY: 1.1, translationZ: -0.6 },
    },
  ];

  for (const { label, euler } of cases) {
    it(`${label}: projections match the originals`, () => {
      const sim3d = createSim3dFromEuler(euler);
      const { qvec: newQvec, tvec: newTvec } = transformCameraPose(sim3d, qvec, tvec);

      for (const p of worldPoints) {
        const origProj = projectNormalized(qvec, tvec, p);
        if (!Number.isFinite(origProj.x) || !Number.isFinite(origProj.y)) continue;
        const pNew = transformPoint(sim3d, p);
        const newProj = projectNormalized(newQvec, newTvec, pNew);

        // (x/z, y/z) should match — camera scale factor is absorbed into tvec so
        // P_cam_new = s * P_cam_old, leaving the normalized-plane coordinates
        // identical.
        expect(newProj.x).toBeCloseTo(origProj.x, 9);
        expect(newProj.y).toBeCloseTo(origProj.y, 9);
        // P_cam_new.z should be s * P_cam_old.z — scale consistency
        expect(newProj.z / origProj.z).toBeCloseTo(euler.scale, 9);
      }
    });
  }
});
