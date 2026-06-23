import type { CameraIntrinsics } from '../types/colmap';
import { CameraModelId } from '../types/colmap';

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
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface UndistortResult extends Vec2 {
  valid: boolean;
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

function isPerspectiveRadial(modelId: CameraModelId): boolean {
  return (
    modelId === CameraModelId.SIMPLE_RADIAL ||
    modelId === CameraModelId.RADIAL ||
    modelId === CameraModelId.OPENCV ||
    modelId === CameraModelId.FULL_OPENCV
  );
}

function isFisheye(modelId: CameraModelId): boolean {
  return (
    modelId === CameraModelId.SIMPLE_RADIAL_FISHEYE ||
    modelId === CameraModelId.RADIAL_FISHEYE ||
    modelId === CameraModelId.OPENCV_FISHEYE ||
    modelId === CameraModelId.THIN_PRISM_FISHEYE
  );
}

function hasTangential(modelId: CameraModelId): boolean {
  return modelId === CameraModelId.OPENCV || modelId === CameraModelId.FULL_OPENCV;
}

// ---- Perspective radial factor R(r2) and its derivative dR/d(r2) ----
// Radial delta = u * R.

function perspectiveRadialFactor(r2: number, i: CameraIntrinsics, modelId: CameraModelId): number {
  switch (modelId) {
    case CameraModelId.SIMPLE_RADIAL:
      return i.k1 * r2;
    case CameraModelId.RADIAL:
    case CameraModelId.OPENCV:
      return i.k1 * r2 + i.k2 * r2 * r2;
    case CameraModelId.FULL_OPENCV: {
      const r4 = r2 * r2;
      const r6 = r4 * r2;
      const num = 1 + i.k1 * r2 + i.k2 * r4 + i.k3 * r6;
      const den = 1 + i.k4 * r2 + i.k5 * r4 + i.k6 * r6;
      return num / den - 1;
    }
    default:
      return 0;
  }
}

function perspectiveRadialDeriv(r2: number, i: CameraIntrinsics, modelId: CameraModelId): number {
  switch (modelId) {
    case CameraModelId.SIMPLE_RADIAL:
      return i.k1;
    case CameraModelId.RADIAL:
    case CameraModelId.OPENCV:
      return i.k1 + 2 * i.k2 * r2;
    case CameraModelId.FULL_OPENCV: {
      const r4 = r2 * r2;
      const r6 = r4 * r2;
      const num = 1 + i.k1 * r2 + i.k2 * r4 + i.k3 * r6;
      const den = 1 + i.k4 * r2 + i.k5 * r4 + i.k6 * r6;
      const numP = i.k1 + 2 * i.k2 * r2 + 3 * i.k3 * r4;
      const denP = i.k4 + 2 * i.k5 * r2 + 3 * i.k6 * r4;
      return (numP * den - num * denP) / (den * den);
    }
    default:
      return 0;
  }
}

function perspectiveDelta(p: Vec2, i: CameraIntrinsics, modelId: CameraModelId): Vec2 {
  const { x, y } = p;
  const r2 = x * x + y * y;
  const R = perspectiveRadialFactor(r2, i, modelId);
  let dx = x * R;
  let dy = y * R;
  if (hasTangential(modelId)) {
    dx += 2 * i.p1 * x * y + i.p2 * (r2 + 2 * x * x);
    dy += i.p1 * (r2 + 2 * y * y) + 2 * i.p2 * x * y;
  }
  return { x: dx, y: dy };
}

// ---- Fisheye distortion in angle (theta) space ----

function fisheyeRadialFactor(theta2: number, i: CameraIntrinsics, modelId: CameraModelId): number {
  switch (modelId) {
    case CameraModelId.SIMPLE_RADIAL_FISHEYE:
      return i.k1 * theta2;
    case CameraModelId.RADIAL_FISHEYE:
      return i.k1 * theta2 + i.k2 * theta2 * theta2;
    case CameraModelId.OPENCV_FISHEYE:
    case CameraModelId.THIN_PRISM_FISHEYE: {
      const t4 = theta2 * theta2;
      const t6 = t4 * theta2;
      const t8 = t4 * t4;
      return i.k1 * theta2 + i.k2 * t4 + i.k3 * t6 + i.k4 * t8;
    }
    default:
      return 0;
  }
}

/**
 * Apply the COLMAP fisheye `Distortion` in angle space: given angle-space coords
 * `uu` (radius == theta), return uu + delta. For THIN_PRISM_FISHEYE the
 * tangential + thin-prism terms are (correctly) evaluated in this same angle
 * space, matching `ThinPrismFisheyeCameraModel::Distortion`.
 */
function applyFisheyeDistortion(uu: Vec2, i: CameraIntrinsics, modelId: CameraModelId): Vec2 {
  const r2 = uu.x * uu.x + uu.y * uu.y;
  const radial = fisheyeRadialFactor(r2, i, modelId);
  let dx = uu.x * radial;
  let dy = uu.y * radial;
  if (modelId === CameraModelId.THIN_PRISM_FISHEYE) {
    dx += 2 * i.p1 * uu.x * uu.y + i.p2 * (r2 + 2 * uu.x * uu.x) + i.sx1 * r2;
    dy += i.p1 * (r2 + 2 * uu.y * uu.y) + 2 * i.p2 * uu.x * uu.y + i.sy1 * r2;
  }
  return { x: uu.x + dx, y: uu.y + dy };
}

function fisheyeForward(p: Vec2, i: CameraIntrinsics, modelId: CameraModelId): Vec2 {
  const r = Math.hypot(p.x, p.y);
  if (r < EPS) return { x: p.x, y: p.y };
  const theta = Math.atan(r); // FisheyeFromNormal: radius r -> angle theta
  const s = theta / r;
  return applyFisheyeDistortion({ x: p.x * s, y: p.y * s }, i, modelId);
}

// ---- Public forward map ----

export function distortNormalized(p: Vec2, i: CameraIntrinsics, modelId: CameraModelId): Vec2 {
  if (isFisheye(modelId)) {
    return fisheyeForward(p, i, modelId);
  }
  if (modelId === CameraModelId.FOV) {
    const r = Math.hypot(p.x, p.y);
    // omega -> 0 is the no-distortion limit; guard the 0/0 division.
    if (r < EPS || Math.abs(i.omega) < EPS) return { x: p.x, y: p.y };
    const rd = Math.atan(r * 2 * Math.tan(i.omega / 2)) / i.omega;
    const f = rd / r;
    return { x: p.x * f, y: p.y * f };
  }
  if (isPerspectiveRadial(modelId)) {
    const d = perspectiveDelta(p, i, modelId);
    return { x: p.x + d.x, y: p.y + d.y };
  }
  // SIMPLE_PINHOLE / PINHOLE / unknown: no distortion.
  return { x: p.x, y: p.y };
}

// ---- Inverse maps ----

/** Newton inverse for perspective radial/tangential models (distorted -> undistorted). */
function perspectiveInverse(p: Vec2, i: CameraIntrinsics, modelId: CameraModelId): UndistortResult {
  let x = p.x;
  let y = p.y;
  for (let iter = 0; iter < 20; iter++) {
    const r2 = x * x + y * y;
    const R = perspectiveRadialFactor(r2, i, modelId);
    const Rp = perspectiveRadialDeriv(r2, i, modelId);

    let dx = x * R;
    let dy = y * R;
    // Jacobian of (u + delta(u)) w.r.t. u.
    let j11 = 1 + R + 2 * x * x * Rp;
    let j12 = 2 * x * y * Rp;
    let j21 = 2 * x * y * Rp;
    let j22 = 1 + R + 2 * y * y * Rp;
    if (hasTangential(modelId)) {
      dx += 2 * i.p1 * x * y + i.p2 * (r2 + 2 * x * x);
      dy += i.p1 * (r2 + 2 * y * y) + 2 * i.p2 * x * y;
      j11 += 2 * i.p1 * y + 6 * i.p2 * x;
      j12 += 2 * i.p1 * x + 2 * i.p2 * y;
      j21 += 2 * i.p1 * x + 2 * i.p2 * y;
      j22 += 6 * i.p1 * y + 2 * i.p2 * x;
    }

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
  // Reject a non-physical root (forward map folds under strong barrel distortion):
  // if re-distorting the result doesn't return near the input, blank the ray.
  const check = distortNormalized({ x, y }, i, modelId);
  const valid = Math.hypot(check.x - p.x, check.y - p.y) < PERSPECTIVE_INVERSE_RESIDUAL_TOL;
  return { x, y, valid };
}

function fovInverse(p: Vec2, i: CameraIntrinsics): UndistortResult {
  const rd = Math.hypot(p.x, p.y);
  // omega -> 0 is the no-distortion limit; guard the 0/0 division.
  if (rd < EPS || Math.abs(i.omega) < EPS) return { x: p.x, y: p.y, valid: true };
  const arg = rd * i.omega;
  if (arg >= Math.PI / 2 - 1e-6) {
    return { x: p.x, y: p.y, valid: false }; // past the tan() singularity
  }
  const factor = Math.tan(arg) / (rd * 2 * Math.tan(i.omega / 2));
  return { x: p.x * factor, y: p.y * factor, valid: true };
}

/** Solve applyFisheyeDistortion(uu) = p for uu (2D Newton, numeric Jacobian). */
function fisheyeRemoveDistortion2D(p: Vec2, i: CameraIntrinsics, modelId: CameraModelId): Vec2 {
  let x = p.x;
  let y = p.y;
  const h = 1e-7;
  for (let iter = 0; iter < 30; iter++) {
    const f = applyFisheyeDistortion({ x, y }, i, modelId);
    const gx = f.x - p.x;
    const gy = f.y - p.y;
    const fx = applyFisheyeDistortion({ x: x + h, y }, i, modelId);
    const fy = applyFisheyeDistortion({ x, y: y + h }, i, modelId);
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

function fisheyeInverse(p: Vec2, i: CameraIntrinsics, modelId: CameraModelId): UndistortResult {
  const thetaD = Math.hypot(p.x, p.y);
  if (thetaD < EPS) return { x: p.x, y: p.y, valid: true };

  // Step 1: remove the polynomial (+ tangential/thin-prism) distortion in angle
  // space, recovering uu whose radius is the true angle theta.
  let uu: Vec2;
  if (modelId === CameraModelId.THIN_PRISM_FISHEYE) {
    uu = fisheyeRemoveDistortion2D(p, i, modelId);
  } else {
    // Pure radial: solve scalar theta*(1 + R(theta^2)) = thetaD via Newton.
    let theta = thetaD;
    for (let iter = 0; iter < 20; iter++) {
      const t2 = theta * theta;
      const radial = fisheyeRadialFactor(t2, i, modelId);
      // d/dtheta [ theta*(1 + R(theta^2)) ] = (1 + R) + theta * R'(theta^2) * 2*theta
      let dRadial: number;
      switch (modelId) {
        case CameraModelId.SIMPLE_RADIAL_FISHEYE:
          dRadial = i.k1;
          break;
        case CameraModelId.RADIAL_FISHEYE:
          dRadial = i.k1 + 2 * i.k2 * t2;
          break;
        default: // OPENCV_FISHEYE
          dRadial = i.k1 + 2 * i.k2 * t2 + 3 * i.k3 * t2 * t2 + 4 * i.k4 * t2 * t2 * t2;
          break;
      }
      const f = theta * (1 + radial) - thetaD;
      const fp = 1 + radial + theta * dRadial * 2 * theta;
      if (Math.abs(fp) < 1e-15) break;
      const step = f / fp;
      theta -= step;
      if (step * step < 1e-22) break;
    }
    const s = theta / thetaD;
    uu = { x: p.x * s, y: p.y * s };
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
}

// ---- Public inverse map ----

export function undistortNormalized(p: Vec2, i: CameraIntrinsics, modelId: CameraModelId): UndistortResult {
  if (isFisheye(modelId)) {
    return fisheyeInverse(p, i, modelId);
  }
  if (modelId === CameraModelId.FOV) {
    return fovInverse(p, i);
  }
  if (isPerspectiveRadial(modelId)) {
    return perspectiveInverse(p, i, modelId);
  }
  return { x: p.x, y: p.y, valid: true };
}
