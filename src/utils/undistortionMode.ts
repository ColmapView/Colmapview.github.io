import type { UndistortionMode } from '../store/types';
import type { CameraModelId } from '../types/colmap';
import { isFisheyeCameraModel } from './cameraModelPolicy';

/**
 * Resolve the effective undistortion mode for a specific camera model.
 *
 * Fisheye cameras frequently capture a field of view at or beyond 180°
 * (half-angle θ ≥ 90°). Such rays cannot be represented on a single flat
 * perspective plane: the fisheye→pinhole scale `tan(θ)/θ` diverges at θ = 90°
 * and flips sign beyond it. In `fullFrame` mode that folds the tessellated
 * image plane back through its own centre, producing the garbage ("nonsense")
 * users see on fisheye cameras.
 *
 * `cropped` mode is the mathematically safe path: its forward map uses
 * `atan(r)`, which self-limits to θ < 90°, and anything outside the captured
 * frame is rendered transparent rather than folded. We therefore downgrade
 * fisheye cameras from `fullFrame` to `cropped`. Perspective models are
 * unaffected, and an explicit `cropped` choice is always preserved.
 */
export function resolveUndistortionMode(
  mode: UndistortionMode,
  modelId: CameraModelId
): UndistortionMode {
  if (mode === 'fullFrame' && isFisheyeCameraModel(modelId)) {
    return 'cropped';
  }
  return mode;
}
