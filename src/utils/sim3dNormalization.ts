import * as THREE from 'three';
import type { Sim3d } from '../types/sim3d';
import type { Reconstruction } from '../types/colmap';
import { getImageWorldPosition } from './colmapTransforms';
import { median } from './mathUtils';

function identitySim3d(): Sim3d {
  return {
    scale: 1,
    rotation: new THREE.Quaternion(),
    translation: new THREE.Vector3(),
  };
}

/**
 * Compute transform to center reconstruction at origin.
 * Uses median of camera positions for robustness to outliers.
 */
export function computeCenterAtOrigin(reconstruction: Reconstruction): Sim3d {
  const positions: THREE.Vector3[] = [];

  for (const image of reconstruction.images.values()) {
    positions.push(getImageWorldPosition(image));
  }

  if (positions.length === 0) {
    return identitySim3d();
  }

  const centerX = median(positions.map((p) => p.x));
  const centerY = median(positions.map((p) => p.y));
  const centerZ = median(positions.map((p) => p.z));

  return {
    scale: 1,
    rotation: new THREE.Quaternion(),
    translation: new THREE.Vector3(-centerX, -centerY, -centerZ),
  };
}

/**
 * Compute transform to normalize scale (fit scene to specified extent).
 * Uses percentile-based bounding box for robustness.
 *
 * Reference: colmap/scene/reconstruction.cc Normalize()
 */
export function computeNormalizeScale(
  reconstruction: Reconstruction,
  extent = 10,
  minPercentile = 0.1,
  maxPercentile = 0.9,
  useImages = true
): Sim3d {
  const coordsX: number[] = [];
  const coordsY: number[] = [];
  const coordsZ: number[] = [];

  if (useImages) {
    for (const image of reconstruction.images.values()) {
      const pos = getImageWorldPosition(image);
      coordsX.push(pos.x);
      coordsY.push(pos.y);
      coordsZ.push(pos.z);
    }
  } else if (reconstruction.points3D) {
    for (const point3D of reconstruction.points3D.values()) {
      coordsX.push(point3D.xyz[0]);
      coordsY.push(point3D.xyz[1]);
      coordsZ.push(point3D.xyz[2]);
    }
  }

  if (coordsX.length === 0) {
    return identitySim3d();
  }

  const minX = percentile(coordsX, minPercentile);
  const maxX = percentile(coordsX, maxPercentile);
  const minY = percentile(coordsY, minPercentile);
  const maxY = percentile(coordsY, maxPercentile);
  const minZ = percentile(coordsZ, minPercentile);
  const maxZ = percentile(coordsZ, maxPercentile);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const diagonal = Math.sqrt(
    Math.pow(maxX - minX, 2) + Math.pow(maxY - minY, 2) + Math.pow(maxZ - minZ, 2)
  );

  const scale = diagonal > 1e-6 ? extent / diagonal : 1;

  return {
    scale,
    rotation: new THREE.Quaternion(),
    translation: new THREE.Vector3(-centerX * scale, -centerY * scale, -centerZ * scale),
  };
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = p * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - idx) + sorted[upper] * (idx - lower);
}
