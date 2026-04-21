/**
 * Transform Actions
 *
 * Coordinates cross-store operations for Sim3D transform management.
 * These actions replace direct cross-store access in transformStore with explicit coordination.
 */

import type { TransformPreset } from '../../types/sim3d.js';
import {
  createIdentityEuler,
  createSim3dFromEuler,
  sim3dToEuler,
  composeSim3d,
  computeCenterAtOrigin,
  computeNormalizeScale,
  transformReconstruction,
  isIdentityEuler,
} from '../../utils/sim3dTransforms.js';
import { useReconstructionStore } from '../reconstructionStore.js';
import { useTransformStore } from '../stores/transformStore.js';
import { usePointPickingStore } from '../stores/pointPickingStore.js';
import { useFloorPlaneStore } from '../stores/floorPlaneStore.js';

/**
 * Apply a transform preset to the scene.
 * Coordinates between transform store and reconstruction store.
 *
 * @param preset - The preset to apply: 'identity', 'centerAtOrigin', or 'normalizeScale'
 * @returns true if preset was applied, false if no reconstruction is loaded
 */
export function applyTransformPreset(preset: TransformPreset): boolean {
  const { reconstruction, wasmReconstruction } = useReconstructionStore.getState();
  if (!reconstruction) return false;

  const transformStore = useTransformStore.getState();
  const currentTransform = transformStore.transform;

  if (preset === 'identity') {
    transformStore.setTransform(createIdentityEuler());
    return true;
  }

  // Check if there's already a transform applied
  const hasCurrentTransform = !isIdentityEuler(currentTransform);

  if (hasCurrentTransform) {
    // Transform the reconstruction with the current transform first
    // so the preset is computed based on the current scene state
    const currentSim3d = createSim3dFromEuler(currentTransform);
    const transformedReconstruction = transformReconstruction(currentSim3d, reconstruction, wasmReconstruction);

    // Compute the preset based on the transformed state
    const presetSim3d = preset === 'centerAtOrigin'
      ? computeCenterAtOrigin(transformedReconstruction)
      : computeNormalizeScale(transformedReconstruction);

    // Compose: presetSim3d * currentSim3d (apply current first, then preset)
    const combinedSim3d = composeSim3d(presetSim3d, currentSim3d);
    transformStore.setTransform(sim3dToEuler(combinedSim3d));
  } else {
    // No current transform, just apply the preset directly
    const sim3d = preset === 'centerAtOrigin'
      ? computeCenterAtOrigin(reconstruction)
      : computeNormalizeScale(reconstruction);
    transformStore.setTransform(sim3dToEuler(sim3d));
  }

  return true;
}

/**
 * Apply the current transform to the reconstruction data permanently.
 * This modifies the underlying data and resets the visual transform.
 *
 * @returns true if transform was applied, false if no reconstruction is loaded
 */
export function applyTransformToData(): boolean {
  const reconstructionStore = useReconstructionStore.getState();
  const { reconstruction, wasmReconstruction } = reconstructionStore;
  if (!reconstruction) return false;

  const transformStore = useTransformStore.getState();
  const { transform } = transformStore;

  const sim3d = createSim3dFromEuler(transform);
  const transformed = transformReconstruction(sim3d, reconstruction, wasmReconstruction);

  // Realize 2D points from WASM into the JS image records before dropping the
  // wrapper. Points2D coordinates are image-plane, so the Sim3D transform
  // doesn't touch them — but without this the reconstruction becomes
  // self-inconsistent (points3D tracks reference image_id/point2D_idx while
  // images have empty points2D arrays), which later breaks export (pycolmap
  // throws IndexError on load).
  if (wasmReconstruction) {
    for (const [imageId, image] of transformed.images) {
      if (image.points2D.length === 0) {
        const points2D = wasmReconstruction.getImagePoints2DArray(imageId);
        if (points2D.length > 0) {
          transformed.images.set(imageId, { ...image, points2D });
        }
      }
    }
    reconstructionStore.setWasmReconstruction(null);
  }

  reconstructionStore.setReconstruction(transformed);
  transformStore.resetTransform();

  // Floor plane data (normal, offset, per-point distances) was computed in the
  // old coordinate frame and is now stale. Drop it; user re-runs detection if
  // needed.
  const floorStore = useFloorPlaneStore.getState();
  floorStore.setDetectedPlane(null);
  floorStore.setPointDistances(null);

  return true;
}

/**
 * Reset the transform with proper cleanup of related state.
 * Clears both the transform and any point picking state.
 */
export function resetTransformWithCleanup(): void {
  // Reset transform to identity
  useTransformStore.getState().resetTransform();

  // Clear point picking state (used for origin/scale/align operations)
  usePointPickingStore.getState().reset();
}

/**
 * Check if the current transform is non-identity (has changes).
 */
export function hasActiveTransform(): boolean {
  const transform = useTransformStore.getState().transform;
  return !isIdentityEuler(transform);
}

/**
 * Get the current transform for external use.
 */
export function getCurrentTransform(): ReturnType<typeof useTransformStore.getState>['transform'] {
  return useTransformStore.getState().transform;
}
