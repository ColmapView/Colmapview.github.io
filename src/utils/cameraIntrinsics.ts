import type { Camera, CameraIntrinsics } from '../types/colmap';
import { getCameraModelParamNames, cameraModelHasPinholeIntrinsics } from './cameraModelRegistry';

/** Maps a COLMAP param name to the intrinsics field(s) it populates. */
const INTRINSIC_PARAM_SETTERS: Record<string, (i: CameraIntrinsics, v: number) => void> = {
  f: (i, v) => { i.fx = v; i.fy = v; },
  fx: (i, v) => { i.fx = v; },
  fy: (i, v) => { i.fy = v; },
  cx: (i, v) => { i.cx = v; },
  cy: (i, v) => { i.cy = v; },
  k: (i, v) => { i.k1 = v; },
  k1: (i, v) => { i.k1 = v; },
  k2: (i, v) => { i.k2 = v; },
  k3: (i, v) => { i.k3 = v; },
  k4: (i, v) => { i.k4 = v; },
  k5: (i, v) => { i.k5 = v; },
  k6: (i, v) => { i.k6 = v; },
  p1: (i, v) => { i.p1 = v; },
  p2: (i, v) => { i.p2 = v; },
  'ω': (i, v) => { i.omega = v; },
  sx1: (i, v) => { i.sx1 = v; },
  sy1: (i, v) => { i.sy1 = v; },
};

/**
 * Extract pinhole intrinsics from a COLMAP camera by mapping the model's
 * declared parameter names onto the intrinsics struct. Params with no pinhole
 * meaning (EUCM alpha/beta, division k beyond k1, prism sx2/sy2) are ignored.
 * Models without pinhole intrinsics (spherical) return the unit defaults —
 * callers MUST gate on `cameraModelHasPinholeIntrinsics` before using these.
 */
export function getCameraIntrinsics(camera: Camera): CameraIntrinsics {
  const intrinsics: CameraIntrinsics = {
    fx: 1, fy: 1, cx: 0, cy: 0,
    k1: 0, k2: 0, k3: 0, k4: 0, k5: 0, k6: 0,
    p1: 0, p2: 0, omega: 0, sx1: 0, sy1: 0,
  };

  if (!cameraModelHasPinholeIntrinsics(camera.modelId)) {
    return intrinsics;
  }

  const paramNames = getCameraModelParamNames(camera.modelId);
  for (let i = 0; i < paramNames.length; i++) {
    const setter = INTRINSIC_PARAM_SETTERS[paramNames[i]];
    if (setter !== undefined) {
      setter(intrinsics, camera.params[i] ?? 0);
    }
  }

  return intrinsics;
}
