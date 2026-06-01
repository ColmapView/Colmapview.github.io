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
import { appLogger } from './logger';
import type { WasmReconstructionWrapper } from '../wasm/reconstruction';

export {
  computeDistanceScale,
  computeNormalAlignment,
  computeOriginTranslation,
  computePlaneAlignment,
} from './sim3dAlignment';
export {
  computeCenterAtOrigin,
  computeNormalizeScale,
} from './sim3dNormalization';

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
 *
 * @param sim3d - The similarity transform to apply
 * @param reconstruction - The reconstruction to transform
 * @param wasmReconstruction - Optional WASM wrapper (used to build points3D if not in reconstruction)
 */
export function transformReconstruction(
  sim3d: Sim3d,
  reconstruction: Reconstruction,
  wasmReconstruction?: WasmReconstructionWrapper | null
): Reconstruction {
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

  // Get points3D Map (build on-demand from WASM if needed)
  let sourcePoints3D = reconstruction.points3D;
  if (!sourcePoints3D || sourcePoints3D.size === 0) {
    if (wasmReconstruction?.hasPoints()) {
      appLogger.info('[Transform] Building points3D Map on-demand from WASM...');
      const startTime = performance.now();
      sourcePoints3D = wasmReconstruction.buildPoints3DMap();
      const elapsed = performance.now() - startTime;
      appLogger.info(`[Transform] Built ${sourcePoints3D.size.toLocaleString()} points in ${elapsed.toFixed(0)}ms`);
    } else {
      sourcePoints3D = new Map();
    }
  }

  // Transform all 3D points
  const transformedPoints3D = new Map<bigint, Point3D>();
  for (const [point3DId, point3D] of sourcePoints3D) {
    const xyz = transformPoint(sim3d, point3D.xyz);
    transformedPoints3D.set(point3DId, {
      ...point3D,
      xyz,
    });
  }

  // Transform rig frames: rigFromWorld has the same structural role as
  // cam_from_world (world-to-body rigid transform) so it uses the same
  // math. Sensor poses within rigs (sensor_from_rig) are rigid
  // body-frame transforms, invariant under a world Sim3D.
  let transformedRigData = reconstruction.rigData;
  if (reconstruction.rigData) {
    const transformedFrames = new Map(reconstruction.rigData.frames);
    for (const [frameId, frame] of reconstruction.rigData.frames) {
      const { qvec, tvec } = transformCameraPose(sim3d, frame.rigFromWorld.qvec, frame.rigFromWorld.tvec);
      transformedFrames.set(frameId, { ...frame, rigFromWorld: { qvec, tvec } });
    }
    transformedRigData = { rigs: reconstruction.rigData.rigs, frames: transformedFrames };
  }

  // Cameras (intrinsics) unchanged
  return {
    ...reconstruction,
    images: transformedImages,
    points3D: transformedPoints3D,
    rigData: transformedRigData,
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
