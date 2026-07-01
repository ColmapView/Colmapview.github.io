import type { CameraIntrinsics, CameraModelId } from '../types/colmap';
import { getCameraModelProjectionClass, type ProjectionClass } from './cameraModelRegistry';

/**
 * CPU reference implementation of COLMAP image (un)distortion in normalized
 * camera coordinates. This is the tested source of truth for the GLSL shaders
 * in `src/shaders/undistortion.ts` — the two MUST stay in parity.
 *
 * Conventions (matching COLMAP `models.h`):
 * - "normalized" perspective/pinhole coords are (X/Z, Y/Z) = ((px-cx)/fx, (py-cy)/fy)
 *   for a pinhole camera.
 * - For fisheye models the distorted normalized coordinate has radius == the
 *   distorted half-angle theta_d (in radians).
 * - Forward (`distortNormalized`): undistorted pinhole coords -> distorted coords.
 * - Inverse (`undistortNormalized`): distorted coords -> undistorted pinhole coords.
 *   Returns `valid: false` when the ray cannot be represented on a flat pinhole
 *   plane (fisheye half-angle theta >= ~90deg, or FOV past its tan singularity).
 *
 * Dispatch is by `ProjectionClass` (from `getCameraModelProjectionClass`) via
 * `DISTORTION_STRATEGIES`. Each strategy is independent of the specific model ID
 * and relies on zero coefficients in `CameraIntrinsics` reducing the formula
 * exactly to the simpler model.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface UndistortResult extends Vec2 {
  valid: boolean;
}

interface DistortionStrategy {
  forward(p: Vec2, i: CameraIntrinsics): Vec2;            // undistorted → distorted
  inverse(d: Vec2, i: CameraIntrinsics): UndistortResult; // distorted → undistorted
}

const EPS = 1e-9;
// Max residual (in normalized coords) for a perspective Newton inverse to be
// accepted. Strong barrel distortion can fold the forward map; Newton may then
// converge to a non-physical root. If forward-distorting the result doesn't land
// back near the input, the ray is treated as invalid (blanked) rather than
// rendered at a wrong position.
const PERSPECTIVE_INVERSE_RESIDUAL_TOL = 1e-3;
// theta below which the fisheye->pinhole scale is ~1 (near the optical axis).
const FISHEYE_CENTER_EPS = 1e-5;
// cos(theta) at/below this means theta >= ~89.94deg. Such rays cannot be placed
// on a flat pinhole plane: tan(theta) explodes at 90deg and flips sign beyond it.
// This is the representable-domain guard that COLMAP encodes as
// `theta*cos(theta) > epsilon` in `NormalFromFisheye`.
const FISHEYE_COS_GUARD = 1e-3;

// ── 'perspective-radial' strategy ────────────────────────────────────────────
// Unified FULL_OPENCV rational radial form:
//   R(r²) = (1 + k1·r² + k2·r⁴ + k3·r⁶) / (1 + k4·r² + k5·r⁴ + k6·r⁶) − 1
// With zero higher-order coefficients this reduces EXACTLY (IEEE 754) to:
//   SIMPLE_RADIAL  k2=k3=k4=k5=k6=p1=p2=0  →  R = k1·r²
//   RADIAL/OPENCV  k3=k4=k5=k6=0             →  R = k1·r² + k2·r⁴
//   FULL_OPENCV    all coefficients           →  full rational form + tangential
// Tangential terms with p1=p2=0 contribute nothing (IEEE 754 exact).

function _prFactor(r2: number, i: CameraIntrinsics): number {
  const r4 = r2 * r2;
  const r6 = r4 * r2;
  const num = 1 + i.k1 * r2 + i.k2 * r4 + i.k3 * r6;
  const den = 1 + i.k4 * r2 + i.k5 * r4 + i.k6 * r6;
  return num / den - 1;
}

function _prDeriv(r2: number, i: CameraIntrinsics): number {
  const r4 = r2 * r2;
  const r6 = r4 * r2;
  const num = 1 + i.k1 * r2 + i.k2 * r4 + i.k3 * r6;
  const den = 1 + i.k4 * r2 + i.k5 * r4 + i.k6 * r6;
  const numP = i.k1 + 2 * i.k2 * r2 + 3 * i.k3 * r4;
  const denP = i.k4 + 2 * i.k5 * r2 + 3 * i.k6 * r4;
  return (numP * den - num * denP) / (den * den);
}

const perspectiveRadialStrategy: DistortionStrategy = {
  forward(p: Vec2, i: CameraIntrinsics): Vec2 {
    const { x, y } = p;
    const r2 = x * x + y * y;
    const R = _prFactor(r2, i);
    // Tangential terms vanish exactly when p1=p2=0 (SIMPLE_RADIAL, RADIAL).
    const dx = x * R + 2 * i.p1 * x * y + i.p2 * (r2 + 2 * x * x);
    const dy = y * R + i.p1 * (r2 + 2 * y * y) + 2 * i.p2 * x * y;
    return { x: x + dx, y: y + dy };
  },

  inverse(p: Vec2, i: CameraIntrinsics): UndistortResult {
    let x = p.x;
    let y = p.y;
    for (let iter = 0; iter < 20; iter++) {
      const r2 = x * x + y * y;
      const R = _prFactor(r2, i);
      const Rp = _prDeriv(r2, i);

      const dx = x * R + 2 * i.p1 * x * y + i.p2 * (r2 + 2 * x * x);
      const dy = y * R + i.p1 * (r2 + 2 * y * y) + 2 * i.p2 * x * y;

      // Jacobian of (u + delta(u)) w.r.t. u.
      // Tangential Jacobian terms vanish exactly when p1=p2=0.
      const j11 = 1 + R + 2 * x * x * Rp + 2 * i.p1 * y + 6 * i.p2 * x;
      const j12 = 2 * x * y * Rp + 2 * i.p1 * x + 2 * i.p2 * y;
      const j21 = 2 * x * y * Rp + 2 * i.p1 * x + 2 * i.p2 * y;
      const j22 = 1 + R + 2 * y * y * Rp + 6 * i.p1 * y + 2 * i.p2 * x;

      const gx = x + dx - p.x;
      const gy = y + dy - p.y;
      const det = j11 * j22 - j12 * j21;
      if (Math.abs(det) < 1e-15) break;
      const stepX = (j22 * gx - j12 * gy) / det;
      const stepY = (j11 * gy - j21 * gx) / det;
      x -= stepX;
      y -= stepY;
      if (stepX * stepX + stepY * stepY < 1e-20) break;
    }
    // Reject non-physical roots: if re-distorting the Newton result doesn't land
    // back near the input, the ray has no valid pre-image (folded barrel map).
    const check = perspectiveRadialStrategy.forward({ x, y }, i);
    const valid = Math.hypot(check.x - p.x, check.y - p.y) < PERSPECTIVE_INVERSE_RESIDUAL_TOL;
    return { x, y, valid };
  },
};

// ── 'fov' strategy ────────────────────────────────────────────────────────────

const fovStrategy: DistortionStrategy = {
  forward(p: Vec2, i: CameraIntrinsics): Vec2 {
    const r = Math.hypot(p.x, p.y);
    // omega -> 0 is the no-distortion limit; guard the 0/0 division.
    if (r < EPS || Math.abs(i.omega) < EPS) return { x: p.x, y: p.y };
    const rd = Math.atan(r * 2 * Math.tan(i.omega / 2)) / i.omega;
    const f = rd / r;
    return { x: p.x * f, y: p.y * f };
  },

  inverse(p: Vec2, i: CameraIntrinsics): UndistortResult {
    const rd = Math.hypot(p.x, p.y);
    // omega -> 0 is the no-distortion limit; guard the 0/0 division.
    if (rd < EPS || Math.abs(i.omega) < EPS) return { x: p.x, y: p.y, valid: true };
    const arg = rd * i.omega;
    if (arg >= Math.PI / 2 - 1e-6) {
      return { x: p.x, y: p.y, valid: false }; // past the tan() singularity
    }
    const factor = Math.tan(arg) / (rd * 2 * Math.tan(i.omega / 2));
    return { x: p.x * factor, y: p.y * factor, valid: true };
  },
};

// ── 'fisheye' strategy ────────────────────────────────────────────────────────
// Unified 4-coefficient polynomial + tangential/thin-prism in angle space:
//   radial(θ²) = k1·θ² + k2·θ⁴ + k3·θ⁶ + k4·θ⁸
// With zero higher-order coefficients this reduces EXACTLY (IEEE 754) to:
//   SIMPLE_RADIAL_FISHEYE  k2=k3=k4=p1=p2=sx1=sy1=0  →  k1·θ²
//   RADIAL_FISHEYE         k3=k4=p1=p2=sx1=sy1=0      →  k1·θ² + k2·θ⁴
//   OPENCV_FISHEYE         p1=p2=sx1=sy1=0             →  k1-k4 polynomial
//   THIN_PRISM_FISHEYE     all coefficients             →  k1-k4 + tangential + thin-prism
// Inverse branches on whether tangential/thin-prism terms are present:
//   pure-radial (p1=p2=sx1=sy1=0): scalar analytic Newton on the 1D equation
//     theta*(1 + Rf(theta²)) = thetaD, converges to machine precision.
//   tangential/prism: 2D Newton (numeric Jacobian).

function _fisheyeApplyDistortion(uu: Vec2, i: CameraIntrinsics): Vec2 {
  const r2 = uu.x * uu.x + uu.y * uu.y;
  const t4 = r2 * r2;
  const t6 = t4 * r2;
  const t8 = t4 * t4;
  const radial = i.k1 * r2 + i.k2 * t4 + i.k3 * t6 + i.k4 * t8;
  // Tangential + thin-prism terms vanish exactly when p1=p2=sx1=sy1=0.
  const dx = uu.x * radial + 2 * i.p1 * uu.x * uu.y + i.p2 * (r2 + 2 * uu.x * uu.x) + i.sx1 * r2;
  const dy = uu.y * radial + i.p1 * (r2 + 2 * uu.y * uu.y) + 2 * i.p2 * uu.x * uu.y + i.sy1 * r2;
  return { x: uu.x + dx, y: uu.y + dy };
}

/** 2D Newton to solve `_fisheyeApplyDistortion(uu) = p` for `uu` (numeric Jacobian). */
function _fisheyeRemoveDistortion2D(p: Vec2, i: CameraIntrinsics): Vec2 {
  let x = p.x;
  let y = p.y;
  const h = 1e-7;
  for (let iter = 0; iter < 30; iter++) {
    const f = _fisheyeApplyDistortion({ x, y }, i);
    const gx = f.x - p.x;
    const gy = f.y - p.y;
    const fx = _fisheyeApplyDistortion({ x: x + h, y }, i);
    const fy = _fisheyeApplyDistortion({ x, y: y + h }, i);
    const j11 = (fx.x - f.x) / h;
    const j21 = (fx.y - f.y) / h;
    const j12 = (fy.x - f.x) / h;
    const j22 = (fy.y - f.y) / h;
    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-15) break;
    const stepX = (j22 * gx - j12 * gy) / det;
    const stepY = (j11 * gy - j21 * gx) / det;
    x -= stepX;
    y -= stepY;
    if (stepX * stepX + stepY * stepY < 1e-22) break;
  }
  return { x, y };
}

const fisheyeStrategy: DistortionStrategy = {
  forward(p: Vec2, i: CameraIntrinsics): Vec2 {
    const r = Math.hypot(p.x, p.y);
    if (r < EPS) return { x: p.x, y: p.y };
    const theta = Math.atan(r); // FisheyeFromNormal: radius r -> angle theta
    const s = theta / r;
    return _fisheyeApplyDistortion({ x: p.x * s, y: p.y * s }, i);
  },

  inverse(p: Vec2, i: CameraIntrinsics): UndistortResult {
    const thetaD = Math.hypot(p.x, p.y);
    if (thetaD < EPS) return { x: p.x, y: p.y, valid: true };

    // Step 1: remove polynomial (+ tangential/thin-prism) distortion in angle
    // space, recovering uu whose radius is the true angle theta.
    let uu: Vec2;
    if (i.p1 === 0 && i.p2 === 0 && i.sx1 === 0 && i.sy1 === 0) {
      // Pure-radial fisheye: solve theta*(1 + Rf(theta²)) = thetaD via scalar
      // analytic Newton (converges to machine precision, vs ~1e-7 for 2D numeric).
      // Rf(t²) = k1·t² + k2·t⁴ + k3·t⁶ + k4·t⁸ + k5·t¹⁰ + k6·t¹²
      // Rf'(t²) (deriv wrt t²) = k1 + 2k2·t² + 3k3·t⁴ + 4k4·t⁶ + 5k5·t⁸ + 6k6·t¹⁰
      let theta = thetaD;
      for (let iter = 0; iter < 20; iter++) {
        const t2 = theta * theta;
        const t4 = t2 * t2;
        const t6 = t4 * t2;
        const t8 = t4 * t4;
        const t10 = t8 * t2;
        const Rf = i.k1 * t2 + i.k2 * t4 + i.k3 * t6 + i.k4 * t8 + i.k5 * t10 + i.k6 * t10 * t2;
        const RfP = i.k1 + 2 * i.k2 * t2 + 3 * i.k3 * t4 + 4 * i.k4 * t6 + 5 * i.k5 * t8 + 6 * i.k6 * t10;
        const f = theta * (1 + Rf) - thetaD;
        const fp = 1 + Rf + theta * RfP * 2 * theta;
        if (Math.abs(fp) < 1e-15) break;
        const step = f / fp;
        theta -= step;
        if (step * step < 1e-22) break;
      }
      uu = { x: p.x * (theta / thetaD), y: p.y * (theta / thetaD) };
    } else {
      // Tangential/thin-prism present: 2D Newton with numeric Jacobian.
      uu = _fisheyeRemoveDistortion2D(p, i);
    }

    // Step 2: NormalFromFisheye (fisheye angle -> pinhole), guarding the domain.
    const theta = Math.hypot(uu.x, uu.y);
    if (theta < FISHEYE_CENTER_EPS) {
      return { x: uu.x, y: uu.y, valid: true }; // scale ~ 1 near the optical axis
    }
    if (Math.cos(theta) <= FISHEYE_COS_GUARD) {
      return { x: uu.x, y: uu.y, valid: false }; // theta >= ~90deg: unrepresentable on a plane
    }
    const scale = Math.tan(theta) / theta;
    return { x: uu.x * scale, y: uu.y * scale, valid: true };
  },
};

// ── 'fisheye-radtan' strategy ─────────────────────────────────────────────────
// RAD_TAN_THIN_PRISM_FISHEYE (model 11) — COLMAP's Distortion() for this model
// applies distortion in angle space in two stages:
//   1. 6-coefficient radial scale of uu → (x, y)
//   2. Tangential + thin-prism applied on the radially-scaled (x, y) — NOT on uu
// Thin-prism splits into x-direction (sx1, sy1) and y-direction (sx2, sy2):
//   dx_tp = sx1·r² + sy1·r⁴,  dy_tp = sx2·r² + sy2·r⁴
// This differs structurally from THIN_PRISM_FISHEYE (k1–k4 only; prism on uu).

function _radTanApplyDistortion(uu: Vec2, i: CameraIntrinsics): Vec2 {
  const theta2 = uu.x * uu.x + uu.y * uu.y;
  const theta4 = theta2 * theta2;
  const theta6 = theta4 * theta2;
  const theta8 = theta4 * theta4;
  const theta10 = theta8 * theta2;
  const theta12 = theta10 * theta2;
  // 6-coeff radial scale
  const thRadial = 1 + i.k1 * theta2 + i.k2 * theta4 + i.k3 * theta6
                     + i.k4 * theta8 + i.k5 * theta10 + i.k6 * theta12;
  const x = thRadial * uu.x;
  const y = thRadial * uu.y;
  const x2 = x * x;
  const y2 = y * y;
  const xy = x * y;
  const r2 = x2 + y2;
  const r4 = r2 * r2;
  // Tangential on (x, y)
  const dxTang = 2 * i.p1 * xy + i.p2 * (r2 + 2 * x2);
  const dyTang = i.p1 * (r2 + 2 * y2) + 2 * i.p2 * xy;
  // Thin-prism: x-direction uses sx1,sy1; y-direction uses sx2,sy2
  const dxTp = i.sx1 * r2 + i.sy1 * r4;
  const dyTp = i.sx2 * r2 + i.sy2 * r4;
  return { x: x + dxTang + dxTp, y: y + dyTang + dyTp };
}

/** 2D Newton to solve `_radTanApplyDistortion(uu) = p` for `uu` (numeric Jacobian). */
function _radTanRemoveDistortion2D(p: Vec2, i: CameraIntrinsics): Vec2 {
  let x = p.x;
  let y = p.y;
  const h = 1e-7;
  for (let iter = 0; iter < 30; iter++) {
    const f  = _radTanApplyDistortion({ x, y }, i);
    const gx = f.x - p.x;
    const gy = f.y - p.y;
    const fx = _radTanApplyDistortion({ x: x + h, y }, i);
    const fy = _radTanApplyDistortion({ x, y: y + h }, i);
    const j11 = (fx.x - f.x) / h;
    const j21 = (fx.y - f.y) / h;
    const j12 = (fy.x - f.x) / h;
    const j22 = (fy.y - f.y) / h;
    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-15) break;
    const stepX = (j22 * gx - j12 * gy) / det;
    const stepY = (j11 * gy - j21 * gx) / det;
    x -= stepX;
    y -= stepY;
    if (stepX * stepX + stepY * stepY < 1e-22) break;
  }
  return { x, y };
}

const fisheyeRadTanStrategy: DistortionStrategy = {
  forward(p: Vec2, i: CameraIntrinsics): Vec2 {
    const r = Math.hypot(p.x, p.y);
    if (r < EPS) return { x: p.x, y: p.y };
    const theta = Math.atan(r); // FisheyeFromNormal: r → theta
    const s = theta / r;
    return _radTanApplyDistortion({ x: p.x * s, y: p.y * s }, i);
  },

  inverse(p: Vec2, i: CameraIntrinsics): UndistortResult {
    const thetaD = Math.hypot(p.x, p.y);
    if (thetaD < EPS) return { x: p.x, y: p.y, valid: true };

    // Remove RAD_TAN distortion in angle space via 2D Newton.
    const uu = _radTanRemoveDistortion2D(p, i);

    // NormalFromFisheye (fisheye angle → pinhole), guarding the domain.
    const theta = Math.hypot(uu.x, uu.y);
    if (theta < FISHEYE_CENTER_EPS) {
      return { x: uu.x, y: uu.y, valid: true };
    }
    if (Math.cos(theta) <= FISHEYE_COS_GUARD) {
      return { x: uu.x, y: uu.y, valid: false };
    }
    const scale = Math.tan(theta) / theta;
    return { x: uu.x * scale, y: uu.y * scale, valid: true };
  },
};

// ── identity strategy (used for 'none', stubs, and 'spherical') ───────────────

const identityStrategy: DistortionStrategy = {
  forward(p: Vec2): Vec2 { return { x: p.x, y: p.y }; },
  inverse(d: Vec2): UndistortResult { return { x: d.x, y: d.y, valid: true }; },
};

// ── strategy table ────────────────────────────────────────────────────────────

export const DISTORTION_STRATEGIES: Record<ProjectionClass, DistortionStrategy> = {
  'none': identityStrategy,
  'perspective-radial': perspectiveRadialStrategy,
  'fov': fovStrategy,
  'fisheye': fisheyeStrategy,
  'fisheye-radtan': fisheyeRadTanStrategy,
  // TODO(T7): implement division-model (un)distortion.
  'division': identityStrategy,
  // TODO(T8): implement EUCM (un)distortion.
  'eucm': identityStrategy,
  // Spherical (equirectangular) has no flat-plane undistortion step.
  'spherical': identityStrategy,
};

// ── public API ────────────────────────────────────────────────────────────────

export function distortNormalized(p: Vec2, i: CameraIntrinsics, modelId: CameraModelId): Vec2 {
  return DISTORTION_STRATEGIES[getCameraModelProjectionClass(modelId)].forward(p, i);
}

export function undistortNormalized(p: Vec2, i: CameraIntrinsics, modelId: CameraModelId): UndistortResult {
  return DISTORTION_STRATEGIES[getCameraModelProjectionClass(modelId)].inverse(p, i);
}
