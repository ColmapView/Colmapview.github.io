/**
 * RANSAC-based plane detection for floor normal estimation.
 *
 * This module provides functions to detect the dominant plane (typically the floor)
 * in a point cloud using the RANSAC algorithm, and compute point-to-plane distances.
 */

import * as THREE from 'three';
import type { Sim3d } from '../types/sim3d';

export interface Plane {
  /** Unit normal vector (floor "up" direction) */
  normal: [number, number, number];
  /** Plane equation constant: n·x + d = 0 */
  d: number;
  /** Center point of inliers (for widget position) */
  centroid: [number, number, number];
  /** Number of points within distance threshold */
  inlierCount: number;
  /** Approximate radius of inlier points (for widget size) */
  radius: number;
}

export interface RansacParams {
  /** Maximum distance from plane to be considered inlier (default: 0.05) */
  distanceThreshold: number;
  /** Maximum iterations (default: 1000) */
  maxIterations: number;
  /** Maximum points to sample for RANSAC iterations (default: 50000) */
  sampleCount: number;
}

const DEFAULT_PARAMS: RansacParams = {
  distanceThreshold: 0.05,
  maxIterations: 1000,
  sampleCount: 50000,
};

/** Early termination threshold - stop if we find a plane with this inlier ratio */
const EARLY_TERMINATION_RATIO = 0.8;

/**
 * Compute cross product of two vectors: a × b
 */
function cross(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number
): [number, number, number] {
  return [
    ay * bz - az * by,
    az * bx - ax * bz,
    ax * by - ay * bx,
  ];
}

/**
 * Compute dot product of two vectors: a · b
 */
function dot(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number
): number {
  return ax * bx + ay * by + az * bz;
}

/**
 * Normalize a vector to unit length
 */
function normalize(x: number, y: number, z: number): [number, number, number] {
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-10) return [0, 0, 1]; // Default to Z-up if degenerate
  return [x / len, y / len, z / len];
}

/**
 * Fit a plane through 3 points and return normal + d
 * Returns null if points are collinear
 */
function fitPlaneThrough3Points(
  p1x: number, p1y: number, p1z: number,
  p2x: number, p2y: number, p2z: number,
  p3x: number, p3y: number, p3z: number
): { normal: [number, number, number]; d: number } | null {
  // Edge vectors
  const v1x = p2x - p1x;
  const v1y = p2y - p1y;
  const v1z = p2z - p1z;

  const v2x = p3x - p1x;
  const v2y = p3y - p1y;
  const v2z = p3z - p1z;

  // Normal = v1 × v2
  const [nx, ny, nz] = cross(v1x, v1y, v1z, v2x, v2y, v2z);

  // Check for collinear points (zero-length normal)
  const lenSq = nx * nx + ny * ny + nz * nz;
  if (lenSq < 1e-10) return null;

  // Normalize
  const normal = normalize(nx, ny, nz);

  // Plane equation: n·p + d = 0, so d = -n·p1
  const d = -dot(normal[0], normal[1], normal[2], p1x, p1y, p1z);

  return { normal, d };
}

/**
 * Compute signed distance from a point to a plane
 */
function pointToPlaneDistance(
  px: number, py: number, pz: number,
  nx: number, ny: number, nz: number,
  d: number
): number {
  return nx * px + ny * py + nz * pz + d;
}

/**
 * Generate random indices for sampling (without replacement)
 */
function randomSample3(count: number): [number, number, number] {
  const i1 = Math.floor(Math.random() * count);
  let i2 = Math.floor(Math.random() * (count - 1));
  if (i2 >= i1) i2++;
  let i3 = Math.floor(Math.random() * (count - 2));
  if (i3 >= Math.min(i1, i2)) i3++;
  if (i3 >= Math.max(i1, i2)) i3++;
  return [i1, i2, i3];
}

/**
 * Create a subsampled index array for large point clouds
 */
function createSubsampleIndices(pointCount: number, maxPoints: number): Uint32Array {
  if (pointCount <= maxPoints) {
    // No subsampling needed - return all indices
    const indices = new Uint32Array(pointCount);
    for (let i = 0; i < pointCount; i++) indices[i] = i;
    return indices;
  }

  // Random subsampling
  const indices = new Uint32Array(maxPoints);
  const step = pointCount / maxPoints;

  for (let i = 0; i < maxPoints; i++) {
    // Stratified random sampling with jitter
    const base = Math.floor(i * step);
    const jitter = Math.floor(Math.random() * step);
    indices[i] = Math.min(base + jitter, pointCount - 1);
  }

  return indices;
}

/**
 * Detect the dominant plane in a point cloud using RANSAC.
 *
 * @param positions Float32Array of [x,y,z, x,y,z, ...] point positions
 * @param params RANSAC parameters (distanceThreshold, maxIterations)
 * @returns Detected plane or null if no valid plane found
 */
export function detectPlaneRANSAC(
  positions: Float32Array,
  params: Partial<RansacParams> = {}
): Plane | null {
  const { distanceThreshold, maxIterations, sampleCount } = { ...DEFAULT_PARAMS, ...params };

  const pointCount = positions.length / 3;
  if (pointCount < 3) return null;

  // Subsample for performance on large point clouds
  const sampleIndices = createSubsampleIndices(pointCount, sampleCount);
  const actualSampleCount = sampleIndices.length;

  let bestPlane: { normal: [number, number, number]; d: number } | null = null;
  let bestInlierCount = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Sample 3 random points from subsample
    const [s1, s2, s3] = randomSample3(actualSampleCount);
    const i1 = sampleIndices[s1];
    const i2 = sampleIndices[s2];
    const i3 = sampleIndices[s3];

    // Fit plane through these 3 points
    const plane = fitPlaneThrough3Points(
      positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2],
      positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2],
      positions[i3 * 3], positions[i3 * 3 + 1], positions[i3 * 3 + 2]
    );

    if (!plane) continue;

    // Count inliers in subsample
    let inlierCount = 0;
    for (let j = 0; j < actualSampleCount; j++) {
      const idx = sampleIndices[j];
      const dist = Math.abs(pointToPlaneDistance(
        positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2],
        plane.normal[0], plane.normal[1], plane.normal[2],
        plane.d
      ));
      if (dist <= distanceThreshold) {
        inlierCount++;
      }
    }

    if (inlierCount > bestInlierCount) {
      bestInlierCount = inlierCount;
      bestPlane = plane;

      // Early termination if we found a very good plane
      if (inlierCount / actualSampleCount >= EARLY_TERMINATION_RATIO) {
        break;
      }
    }
  }

  if (!bestPlane || bestInlierCount < 3) return null;

  // Now compute final statistics using ALL points (not just subsample)
  const { normal, d } = bestPlane;
  let totalInliers = 0;
  let centroidX = 0, centroidY = 0, centroidZ = 0;

  // First pass: count inliers and compute centroid
  for (let i = 0; i < pointCount; i++) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    const dist = Math.abs(pointToPlaneDistance(px, py, pz, normal[0], normal[1], normal[2], d));

    if (dist <= distanceThreshold) {
      totalInliers++;
      centroidX += px;
      centroidY += py;
      centroidZ += pz;
    }
  }

  if (totalInliers === 0) return null;

  centroidX /= totalInliers;
  centroidY /= totalInliers;
  centroidZ /= totalInliers;

  // Second pass: compute radius (max distance from centroid among inliers)
  let maxRadiusSq = 0;
  for (let i = 0; i < pointCount; i++) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    const dist = Math.abs(pointToPlaneDistance(px, py, pz, normal[0], normal[1], normal[2], d));

    if (dist <= distanceThreshold) {
      const dx = px - centroidX;
      const dy = py - centroidY;
      const dz = pz - centroidZ;
      const radiusSq = dx * dx + dy * dy + dz * dz;
      if (radiusSq > maxRadiusSq) maxRadiusSq = radiusSq;
    }
  }

  return {
    normal,
    d,
    centroid: [centroidX, centroidY, centroidZ],
    inlierCount: totalInliers,
    radius: Math.sqrt(maxRadiusSq),
  };
}

/**
 * Compute distances from all points to a plane.
 * Returns signed distances (positive = above plane in normal direction).
 *
 * @param positions Float32Array of [x,y,z, x,y,z, ...] point positions
 * @param plane The plane to compute distances to
 * @returns Float32Array of signed distances, one per point
 */
export function computeDistancesToPlane(
  positions: Float32Array,
  plane: Plane
): Float32Array {
  const pointCount = positions.length / 3;
  const distances = new Float32Array(pointCount);
  const { normal, d } = plane;

  for (let i = 0; i < pointCount; i++) {
    distances[i] = pointToPlaneDistance(
      positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2],
      normal[0], normal[1], normal[2],
      d
    );
  }

  return distances;
}

/**
 * Flip the plane normal (for when the detected normal points "down" instead of "up")
 */
export function flipPlaneNormal(plane: Plane): Plane {
  return {
    ...plane,
    normal: [-plane.normal[0], -plane.normal[1], -plane.normal[2]],
    d: -plane.d,
  };
}

/**
 * Apply a Sim3d transform to a Float32Array of positions.
 * This is used to transform positions before RANSAC detection when there's
 * an unapplied transform in the scene.
 *
 * Transform: x_new = scale * (rotation * x_old) + translation
 *
 * @param positions Float32Array of [x,y,z, x,y,z, ...] point positions
 * @param sim3d The Sim3d transform to apply
 * @returns New Float32Array with transformed positions
 */
export function transformPositions(
  positions: Float32Array,
  sim3d: Sim3d
): Float32Array {
  const pointCount = positions.length / 3;
  const transformed = new Float32Array(positions.length);

  const p = new THREE.Vector3();

  for (let i = 0; i < pointCount; i++) {
    const i3 = i * 3;
    p.set(positions[i3], positions[i3 + 1], positions[i3 + 2]);
    p.applyQuaternion(sim3d.rotation);
    p.multiplyScalar(sim3d.scale);
    p.add(sim3d.translation);
    transformed[i3] = p.x;
    transformed[i3 + 1] = p.y;
    transformed[i3 + 2] = p.z;
  }

  return transformed;
}
