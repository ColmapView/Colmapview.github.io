/**
 * Sim3d transformation utilities matching COLMAP's implementation.
 *
 * Reference: colmap/src/colmap/geometry/sim3.h
 * Reference: colmap/src/colmap/geometry/pose.cc (TransformCameraWorld)
 * Reference: colmap/src/colmap/scene/reconstruction.cc (Transform)
 */

import * as THREE from 'three';
import type { Sim3d, Sim3dEuler } from '../types/sim3d';
import type { Image, Point3D, Reconstruction } from '../types/colmap';
import { getImageWorldPosition } from './colmapTransforms';
import { median } from './mathUtils';

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an identity Sim3d transformation (no-op).
 */
export function createIdentitySim3d(): Sim3d {
  return {
    scale: 1,
    rotation: new THREE.Quaternion(), // identity
    translation: new THREE.Vector3(), // zero
  };
}

/**
 * Create Sim3d from Euler angle representation.
 * Euler angles are applied in XYZ order.
 */
export function createSim3dFromEuler(euler: Sim3dEuler): Sim3d {
  const rotation = new THREE.Quaternion();
  const eulerObj = new THREE.Euler(euler.rotationX, euler.rotationY, euler.rotationZ, 'XYZ');
  rotation.setFromEuler(eulerObj);

  return {
    scale: euler.scale,
    rotation,
    translation: new THREE.Vector3(euler.translationX, euler.translationY, euler.translationZ),
  };
}

/**
 * Convert Sim3d to Euler angle representation.
 */
export function sim3dToEuler(sim3d: Sim3d): Sim3dEuler {
  const euler = new THREE.Euler().setFromQuaternion(sim3d.rotation, 'XYZ');
  return {
    scale: sim3d.scale,
    rotationX: euler.x,
    rotationY: euler.y,
    rotationZ: euler.z,
    translationX: sim3d.translation.x,
    translationY: sim3d.translation.y,
    translationZ: sim3d.translation.z,
  };
}

/**
 * Create default Euler representation (identity transform).
 */
export function createIdentityEuler(): Sim3dEuler {
  return {
    scale: 1,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    translationX: 0,
    translationY: 0,
    translationZ: 0,
  };
}

// ============================================================================
// Core Transformations (matching COLMAP semantics)
// ============================================================================

/**
 * Transform a 3D point: x_new = scale * (rotation * x_old) + translation
 *
 * Reference: colmap/geometry/sim3.h operator*(Sim3d, Vector3d)
 */
export function transformPoint(
  sim3d: Sim3d,
  xyz: [number, number, number]
): [number, number, number] {
  const p = new THREE.Vector3(xyz[0], xyz[1], xyz[2]);
  p.applyQuaternion(sim3d.rotation); // R * x
  p.multiplyScalar(sim3d.scale); // scale * (R * x)
  p.add(sim3d.translation); // + t
  return [p.x, p.y, p.z];
}

/**
 * Compute inverse of Sim3d transformation.
 *
 * Reference: colmap/geometry/sim3.h Inverse()
 *
 * For b_from_a, the inverse a_from_b is:
 * - scale_inv = 1 / scale
 * - rotation_inv = rotation.inverse()
 * - translation_inv = (rotation_inv * translation) / -scale
 */
export function inverseSim3d(bFromA: Sim3d): Sim3d {
  const scaleInv = 1 / bFromA.scale;
  const rotationInv = bFromA.rotation.clone().invert();

  // t_inv = (R_inv * t) / -scale = R_inv * t * (-1/scale)
  const translationInv = bFromA.translation
    .clone()
    .applyQuaternion(rotationInv)
    .multiplyScalar(-scaleInv);

  return {
    scale: scaleInv,
    rotation: rotationInv,
    translation: translationInv,
  };
}

/**
 * Compose two Sim3d transforms: c_from_a = c_from_b * b_from_a
 *
 * Reference: colmap/geometry/sim3.h operator*(Sim3d, Sim3d)
 *
 * Result:
 * - scale = scale_c * scale_b
 * - rotation = rotation_c * rotation_b
 * - translation = t_c + scale_c * (R_c * t_b)
 */
export function composeSim3d(cFromB: Sim3d, bFromA: Sim3d): Sim3d {
  const scale = cFromB.scale * bFromA.scale;
  const rotation = cFromB.rotation.clone().multiply(bFromA.rotation).normalize();

  // t_result = t_c + scale_c * (R_c * t_b)
  const translation = bFromA.translation
    .clone()
    .applyQuaternion(cFromB.rotation)
    .multiplyScalar(cFromB.scale)
    .add(cFromB.translation);

  return { scale, rotation, translation };
}

/**
 * Transform camera pose (qvec, tvec) for world transformation.
 *
 * Reference: colmap/geometry/pose.cc TransformCameraWorld()
 *
 * COLMAP stores camera poses as cam_from_world (world-to-camera transform).
 * When we transform the world, the camera pose needs to be updated:
 *
 * cam_from_new_world = cam_from_old_world * Inverse(new_from_old_world)
 * final_translation = result_translation * new_from_old.scale
 *
 * @param newFromOld - The world transformation (new_from_old_world)
 * @param qvec - Camera quaternion [w, x, y, z] (COLMAP format)
 * @param tvec - Camera translation [x, y, z]
 * @returns Transformed qvec and tvec
 */
export function transformCameraPose(
  newFromOld: Sim3d,
  qvec: [number, number, number, number],
  tvec: [number, number, number]
): { qvec: [number, number, number, number]; tvec: [number, number, number] } {
  // Step 1: Create Sim3d from camera pose with scale=1
  // Note: COLMAP uses [w, x, y, z], Three.js uses (x, y, z, w)
  const camFromWorld: Sim3d = {
    scale: 1,
    rotation: new THREE.Quaternion(qvec[1], qvec[2], qvec[3], qvec[0]),
    translation: new THREE.Vector3(tvec[0], tvec[1], tvec[2]),
  };

  // Step 2: cam_from_new_world = cam_from_old_world * Inverse(new_from_old_world)
  const oldFromNew = inverseSim3d(newFromOld);
  const camFromNew = composeSim3d(camFromWorld, oldFromNew);

  // Step 3: Scale translation by original scale (CRITICAL - from COLMAP source)
  const scaledT = camFromNew.translation.clone().multiplyScalar(newFromOld.scale);

  // Step 4: Convert back to COLMAP qvec format [w, x, y, z]
  return {
    qvec: [camFromNew.rotation.w, camFromNew.rotation.x, camFromNew.rotation.y, camFromNew.rotation.z],
    tvec: [scaledT.x, scaledT.y, scaledT.z],
  };
}

// ============================================================================
// Reconstruction-level Transforms
// ============================================================================

/**
 * Apply Sim3d transformation to entire reconstruction.
 * Returns a new reconstruction object (does not mutate input).
 *
 * Reference: colmap/scene/reconstruction.cc Reconstruction::Transform()
 */
export function transformReconstruction(sim3d: Sim3d, reconstruction: Reconstruction): Reconstruction {
  // Transform all images (camera poses)
  const transformedImages = new Map<number, Image>();
  for (const [imageId, image] of reconstruction.images) {
    const { qvec, tvec } = transformCameraPose(sim3d, image.qvec, image.tvec);
    transformedImages.set(imageId, {
      ...image,
      qvec,
      tvec,
    });
  }

  // Transform all 3D points
  const transformedPoints3D = new Map<bigint, Point3D>();
  for (const [point3DId, point3D] of reconstruction.points3D) {
    const xyz = transformPoint(sim3d, point3D.xyz);
    transformedPoints3D.set(point3DId, {
      ...point3D,
      xyz,
    });
  }

  // Cameras (intrinsics) and other data are unchanged
  return {
    ...reconstruction,
    images: transformedImages,
    points3D: transformedPoints3D,
  };
}

// ============================================================================
// Preset Computations
// ============================================================================

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
    return createIdentitySim3d();
  }

  // Use median for robustness
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
 *
 * @param reconstruction - The reconstruction to normalize
 * @param extent - Target extent (bounding box diagonal), default 10
 * @param minPercentile - Lower percentile for bounding box, default 0.1
 * @param maxPercentile - Upper percentile for bounding box, default 0.9
 * @param useImages - Use camera positions (true) or 3D points (false), default true
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
  } else {
    for (const point3D of reconstruction.points3D.values()) {
      coordsX.push(point3D.xyz[0]);
      coordsY.push(point3D.xyz[1]);
      coordsZ.push(point3D.xyz[2]);
    }
  }

  if (coordsX.length === 0) {
    return createIdentitySim3d();
  }

  // Helper to compute percentile
  const percentile = (arr: number[], p: number): number => {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = p * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return sorted[lower] * (upper - idx) + sorted[upper] * (idx - lower);
  };

  // Compute percentile-based bounds
  const minX = percentile(coordsX, minPercentile);
  const maxX = percentile(coordsX, maxPercentile);
  const minY = percentile(coordsY, minPercentile);
  const maxY = percentile(coordsY, maxPercentile);
  const minZ = percentile(coordsZ, minPercentile);
  const maxZ = percentile(coordsZ, maxPercentile);

  // Compute center and diagonal
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;

  const diagonal = Math.sqrt(
    Math.pow(maxX - minX, 2) + Math.pow(maxY - minY, 2) + Math.pow(maxZ - minZ, 2)
  );

  // Scale to fit target extent
  const scale = diagonal > 1e-6 ? extent / diagonal : 1;

  // The transform: first translate to center, then scale
  // Combined: p_new = scale * (p_old - center) = scale * p_old - scale * center
  return {
    scale,
    rotation: new THREE.Quaternion(),
    translation: new THREE.Vector3(-centerX * scale, -centerY * scale, -centerZ * scale),
  };
}

// ============================================================================
// Three.js Integration
// ============================================================================

/**
 * Convert Sim3d to THREE.Matrix4 for visual preview.
 * The matrix can be applied to a Three.js group to transform all children.
 */
export function sim3dToMatrix4(sim3d: Sim3d): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();

  // Compose: translation * rotation * scale
  // THREE.Matrix4.compose(position, quaternion, scale)
  matrix.compose(
    sim3d.translation,
    sim3d.rotation,
    new THREE.Vector3(sim3d.scale, sim3d.scale, sim3d.scale)
  );

  return matrix;
}

/**
 * Check if a Sim3dEuler represents an identity transform.
 */
export function isIdentityEuler(euler: Sim3dEuler): boolean {
  const epsilon = 1e-9;
  return (
    Math.abs(euler.scale - 1) < epsilon &&
    Math.abs(euler.rotationX) < epsilon &&
    Math.abs(euler.rotationY) < epsilon &&
    Math.abs(euler.rotationZ) < epsilon &&
    Math.abs(euler.translationX) < epsilon &&
    Math.abs(euler.translationY) < epsilon &&
    Math.abs(euler.translationZ) < epsilon
  );
}

// ============================================================================
// Point-Based Transform Computations
// ============================================================================

/**
 * Compute scale transform to set distance between two points to a target value.
 * Scale is applied uniformly about the midpoint of the two points.
 *
 * @param point1 - First point position
 * @param point2 - Second point position
 * @param targetDistance - Desired distance between the points
 * @returns Sim3d transform that scales the scene appropriately
 */
export function computeDistanceScale(
  point1: THREE.Vector3,
  point2: THREE.Vector3,
  targetDistance: number
): Sim3d {
  const currentDistance = point1.distanceTo(point2);

  // Handle degenerate case (points too close)
  if (currentDistance < 1e-10) {
    return createIdentitySim3d();
  }

  const scale = targetDistance / currentDistance;

  // Scale about the midpoint of the two points
  // Transform: p_new = scale * (p - midpoint) + midpoint
  //          = scale * p + midpoint * (1 - scale)
  const midpoint = new THREE.Vector3()
    .addVectors(point1, point2)
    .multiplyScalar(0.5);

  const translation = midpoint.clone().multiplyScalar(1 - scale);

  return {
    scale,
    rotation: new THREE.Quaternion(), // Identity rotation
    translation,
  };
}

/**
 * Compute rotation transform to align a plane's normal with the Y-up axis.
 * The plane is defined by three points, and rotation is about their centroid.
 *
 * @param point1 - First point of the triangle
 * @param point2 - Second point of the triangle
 * @param point3 - Third point of the triangle
 * @returns Sim3d transform that rotates the scene to align the normal with Y-up
 */
export function computeNormalAlignment(
  point1: THREE.Vector3,
  point2: THREE.Vector3,
  point3: THREE.Vector3
): Sim3d {
  // Compute plane normal using cross product
  const v1 = new THREE.Vector3().subVectors(point2, point1);
  const v2 = new THREE.Vector3().subVectors(point3, point1);
  const normal = new THREE.Vector3().crossVectors(v1, v2);

  // Handle degenerate case (collinear points)
  if (normal.lengthSq() < 1e-10) {
    return createIdentitySim3d();
  }

  normal.normalize();

  // Target: align normal with Y-up (0, 1, 0)
  const yUp = new THREE.Vector3(0, 1, 0);

  // Check if already aligned
  const dot = normal.dot(yUp);
  if (Math.abs(dot - 1) < 1e-6) {
    // Already aligned with Y-up
    return createIdentitySim3d();
  }

  let rotation: THREE.Quaternion;

  if (Math.abs(dot + 1) < 1e-6) {
    // Opposite direction - rotate 180° around X axis
    rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  } else {
    // General case: compute rotation quaternion from current normal to Y-up
    rotation = new THREE.Quaternion().setFromUnitVectors(normal, yUp);
  }

  // Rotation center is centroid of three points
  const centroid = new THREE.Vector3()
    .add(point1)
    .add(point2)
    .add(point3)
    .divideScalar(3);

  // To rotate about centroid, we need:
  // p_new = R * (p - centroid) + centroid
  //       = R * p - R * centroid + centroid
  // So translation = centroid - R * centroid
  const rotatedCentroid = centroid.clone().applyQuaternion(rotation);
  const translation = new THREE.Vector3().subVectors(centroid, rotatedCentroid);

  return {
    scale: 1,
    rotation,
    translation,
  };
}
