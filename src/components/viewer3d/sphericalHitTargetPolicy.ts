import * as THREE from 'three';

/**
 * Pure helpers for the batched spherical-camera hit targets.
 *
 * All spherical hit targets live in ONE InstancedMesh over a shared unit-sphere
 * geometry (see SphericalCameraHitTargets). These helpers own the two bits of logic
 * that are worth testing in isolation: mapping a raycast `instanceId` back to an
 * imageId, and composing a per-instance matrix that sizes the unit sphere purely
 * through a uniform scale (so the size slider never rebuilds geometry).
 */

/** Minimal shape needed to resolve an imageId from an instance index. */
export interface SphericalHitTargetFrustum {
  image: { imageId: number };
}

/**
 * Resolve the imageId for a raycast hit on the batched hit-target InstancedMesh.
 * `instanceId` is the per-instance index three.js reports on an InstancedMesh
 * intersection; it maps 1:1 to the frustum at that array index. Returns null for a
 * miss (undefined instanceId) or an index outside the current frustum list.
 */
export function resolveSphericalHitTargetImageId(
  frustums: readonly SphericalHitTargetFrustum[],
  instanceId: number | undefined
): number | null {
  if (instanceId === undefined) return null;
  return frustums[instanceId]?.image.imageId ?? null;
}

/**
 * Compose the per-instance matrix for a spherical hit target from the frustum pose
 * and the camera-size scale. The shared geometry is a UNIT sphere, so `cameraScale`
 * is applied as a uniform scale — a size-slider change only rewrites these matrices,
 * never the geometry. `scale` is a reused scratch vector (mutated in place).
 */
export function composeSphericalHitTargetMatrix(
  matrix: THREE.Matrix4,
  scale: THREE.Vector3,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  cameraScale: number
): THREE.Matrix4 {
  scale.set(cameraScale, cameraScale, cameraScale);
  return matrix.compose(position, quaternion, scale);
}

/**
 * Stable React key for the hit-target InstancedMesh. Changing the instance count (or
 * the leading image) forces a remount so the fixed-size instanceMatrix buffer is
 * re-allocated; a size-slider change keeps the key stable (no remount, no rebuild).
 */
export function getSphericalHitTargetMeshKey(
  count: number,
  firstImageId: number | null | undefined
): string {
  return `${count}-${firstImageId ?? 0}`;
}
