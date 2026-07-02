import type { Camera, CameraIntrinsics } from '../types/colmap';
import { getCameraModelParamNames, cameraModelHasPinholeIntrinsics, getCameraModelProjectionClass } from './cameraModelRegistry';

/** Maps a COLMAP param name to the intrinsics field(s) it populates.
 * NOTE: 'k' is intentionally absent here — it is ambiguous (SIMPLE_RADIAL→k1,
 * DIVISION→kDiv) and is routed by projectionClass in getCameraIntrinsics.
 * Exported so a registry-driven exhaustiveness test can assert every registry
 * param name (except the documented 'k'/'w'/'h' cases) has a setter here —
 * an unmatched name is silently skipped by the loop below. */
export const INTRINSIC_PARAM_SETTERS: Record<string, (i: CameraIntrinsics, v: number) => void> = {
  f: (i, v) => { i.fx = v; i.fy = v; },
  fx: (i, v) => { i.fx = v; },
  fy: (i, v) => { i.fy = v; },
  cx: (i, v) => { i.cx = v; },
  cy: (i, v) => { i.cy = v; },
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
  sx2: (i, v) => { i.sx2 = v; },
  sy2: (i, v) => { i.sy2 = v; },
  alpha: (i, v) => { i.alpha = v; },
  beta: (i, v) => { i.beta = v; },
};

/**
 * Extract pinhole intrinsics from a COLMAP camera by mapping the model's
 * declared parameter names onto the intrinsics struct. All recognized parameter
 * names (including EUCM alpha/beta and prism sx1/sy1/sx2/sy2) are extracted
 * through `INTRINSIC_PARAM_SETTERS`; the bare 'k' parameter routes to `kDiv`
 * for division models and `k1` for all others.
 * Models without pinhole intrinsics (spherical) return the unit defaults —
 * callers MUST gate on `cameraModelHasPinholeIntrinsics` before using these.
 */
export function getCameraIntrinsics(camera: Camera): CameraIntrinsics {
  const intrinsics: CameraIntrinsics = {
    fx: 1, fy: 1, cx: 0, cy: 0,
    k1: 0, k2: 0, k3: 0, k4: 0, k5: 0, k6: 0,
    p1: 0, p2: 0, omega: 0, sx1: 0, sy1: 0, sx2: 0, sy2: 0,
    alpha: 0, beta: 0, kDiv: 0,
  };

  if (!cameraModelHasPinholeIntrinsics(camera.modelId)) {
    return intrinsics;
  }

  const projClass = getCameraModelProjectionClass(camera.modelId);
  const isDivision = projClass === 'division';

  const paramNames = getCameraModelParamNames(camera.modelId);
  for (let i = 0; i < paramNames.length; i++) {
    const name = paramNames[i];
    const value = camera.params[i] ?? 0;

    // 'k' is ambiguous: DIVISION models use it for kDiv; all others use k1.
    if (name === 'k') {
      if (isDivision) {
        intrinsics.kDiv = value;
      } else {
        intrinsics.k1 = value;
      }
      continue;
    }

    const setter = INTRINSIC_PARAM_SETTERS[name];
    if (setter !== undefined) {
      setter(intrinsics, value);
    }
  }

  return intrinsics;
}
