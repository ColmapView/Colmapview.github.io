/**
 * cameraModelOracles.test.ts
 *
 * Independent COLMAP-derived oracles for EUCM (id=16) and DIVISION (id=13/12)
 * distortion models.
 *
 * ALL expected values are hand-computed from the COLMAP algebraic formula
 * transcribed in the comments below — NOT produced by calling our implementation.
 * A self-referential oracle (using impl output as the expected value) cannot catch
 * a wrong formula; this blind spot allowed the RAD_TAN Critical to survive a
 * green test suite. These tests would have caught it.
 *
 * Formula source: COLMAP sensor/models.h, ImgFromCam / CamFromImg for each model.
 * The transcription here is independent of cameraUndistortion.ts.
 *
 * Function signature note (verified by reading cameraUndistortion.ts):
 *   distortNormalized(p: Vec2, i: CameraIntrinsics, modelId: CameraModelId): Vec2
 *   undistortNormalized(p: Vec2, i: CameraIntrinsics, modelId: CameraModelId): UndistortResult
 * Argument order is (point, intrinsics, modelId) — intrinsics carries alpha/beta/kDiv.
 */

import { describe, it, expect } from 'vitest';
import { distortNormalized, undistortNormalized } from './cameraUndistortion';
import { CameraModelId, type CameraIntrinsics } from '../types/colmap';

/**
 * Convenience builder — zeroes every unused coefficient so callers name only
 * the fields relevant to their model (mirrors the helper in cameraUndistortion.test.ts).
 */
function intr(partial: Partial<CameraIntrinsics>): CameraIntrinsics {
  return {
    fx: 1, fy: 1, cx: 0, cy: 0,
    k1: 0, k2: 0, k3: 0, k4: 0, k5: 0, k6: 0,
    p1: 0, p2: 0, omega: 0,
    sx1: 0, sy1: 0, sx2: 0, sy2: 0,
    alpha: 0, beta: 0, kDiv: 0,
    ...partial,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// EUCM oracle
//
// Model: COLMAP id=16, params (fx, fy, cx, cy, alpha, beta).
//
// Forward (ImgFromCam, w=1) — COLMAP models.h:
//   r²  = x² + y²
//   den = α·√(β·r² + 1) + (1 − α)
//   distorted = (x/den, y/den)
//
// Inverse (CamFromImg, w=1) — COLMAP models.h:
//   r²       = m.x² + m.y²
//   γ        = 1 − α
//   radicand = 1 − (2α−1)·β·r²
//   helperDen = α·√radicand + γ
//   helper   = (1 − α²·β·r²) / helperDen
//   undistorted = (m.x/helper, m.y/helper)   [requires radicand≥0 and helper>0]
//
// ── Hand-computation for p = (0.3, −0.2), α=0.6, β=1.2 ──────────────────────
//
//   r²       = 0.3² + (−0.2)² = 0.09 + 0.04 = 0.13
//   β·r²+1  = 1.2·0.13 + 1   = 0.156 + 1    = 1.156
//   √1.156   = 17/(5√10) = 17/15.81138830...  ≈ 1.07517440
//              [Newton verify: 1.075174² = 1.155999; correction +4e-7 → 1.07517442]
//   den      = 0.6·1.07517442 + 0.4 = 0.64510465 + 0.4 = 1.04510465
//   u        = 0.3  / 1.04510465  ≈ 0.28705263
//              [long-division check: 1.04510465·0.287 = 0.299945; remainder 5.5e-5;
//               5.5e-5/1.04510465 ≈ 5.263e-5; u ≈ 0.287 + 5.263e-5 = 0.28705263]
//   v        = −0.2 / 1.04510465  = −(2/3)·u ≈ −0.19136842
//
// ── Non-tautological proof (oracle has teeth) ─────────────────────────────────
//   If α and β were swapped (α=1.2, β=0.6 — a plausible transcription bug):
//     den' = 1.2·√(0.6·0.13+1) + (1−1.2) = 1.2·√1.078 − 0.2 ≈ 1.2·1.03827 − 0.2 ≈ 1.04592
//     u'   = 0.3/1.04592 ≈ 0.28682
//     Δ    ≈ 0.28705263 − 0.28682 = 2.3e−4   >>>  5e−6 tolerance  → test would FAIL
// ──────────────────────────────────────────────────────────────────────────────

describe('EUCM oracle (independent COLMAP-derived, model id=16)', () => {
  const EUCM_INTR = intr({ alpha: 0.6, beta: 1.2 });

  // Undistorted point (a, b) and its independently-computed distorted image (u, v).
  const a = 0.3, b = -0.2;
  // Oracle values from hand-computation above (accurate to 8 decimal places).
  const u_expected = 0.28705263;
  const v_expected = -0.19136842;
  // Tolerance: 5e-6 (toBeCloseTo digit=5).  Δ from wrong formula ≈ 2.3e-4 → 46× headroom.
  const TOL = 5;

  it('forward distortNormalized: undistorted → distorted matches COLMAP ImgFromCam formula', () => {
    const d = distortNormalized({ x: a, y: b }, EUCM_INTR, CameraModelId.EUCM);
    expect(d.x).toBeCloseTo(u_expected, TOL);
    expect(d.y).toBeCloseTo(v_expected, TOL);
  });

  it('inverse undistortNormalized: hand-computed distorted point → recovers original undistorted', () => {
    const ud = undistortNormalized({ x: u_expected, y: v_expected }, EUCM_INTR, CameraModelId.EUCM);
    expect(ud.valid).toBe(true);
    expect(ud.x).toBeCloseTo(a, TOL);
    expect(ud.y).toBeCloseTo(b, TOL);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DIVISION oracle
//
// Model: COLMAP id=13 (DIVISION) and id=12 (SIMPLE_DIVISION, shares the strategy).
// Params: DIVISION has (f, cx, cy, k); SIMPLE_DIVISION has (f, cx, cy, k) with fx=fy=f.
// The distortion coefficient is carried as CameraIntrinsics.kDiv.
//
// Inverse (CamFromImg — the clean closed form) — COLMAP models.h:
//   denom       = 1 + k·(dx² + dy²)
//   undistorted = (dx/denom, dy/denom)
//
// Forward (ImgFromCam — quadratic solve) — COLMAP models.h:
//   ρ²   = ux² + uy²
//   disc = 1 − 4·k·ρ²
//   r    = 2/(1 + √disc)
//   distorted = r·(ux, uy)
//
// ── Hand-computation for distorted (dx,dy) = (0.4, 0.3), k = 0.1 ─────────────
//
//   dx²+dy²   = 0.16 + 0.09 = 0.25
//   denom     = 1 + 0.1·0.25 = 1.025
//   ux        = 0.4/1.025 = 16/41  ≈ 0.39024390...
//   uy        = 0.3/1.025 = 12/41  ≈ 0.29268293...
//
// Verify forward direction (exact integer arithmetic — no floating-point error):
//   ρ²   = (16/41)²+(12/41)² = (256+144)/1681 = 400/1681
//   disc = 1 − 4·0.1·(400/1681) = 1 − 160/1681 = 1521/1681
//   √disc = √(1521/1681) = 39/41  [39²=1521, 41²=1681, exact]
//   r    = 2/(1+39/41) = 2·41/80 = 82/80 = 41/40 = 1.025
//   distorted.x = 1.025·(16/41) = (41/40)·(16/41) = 16/40 = 0.4  ✓ (exact)
//   distorted.y = 1.025·(12/41) = (41/40)·(12/41) = 12/40 = 0.3  ✓ (exact)
//
// ── Non-tautological proof ────────────────────────────────────────────────────
//   If the inverse used (1 − k·r²) instead of (1 + k·r²) — wrong sign:
//     denom' = 1 − 0.025 = 0.975
//     ux'    = 0.4/0.975 ≈ 0.41026
//     Δ      ≈ 0.41026 − 0.39024 = 0.02002  >>>  5e−6 tolerance  → test would FAIL
// ──────────────────────────────────────────────────────────────────────────────

describe('DIVISION oracle (independent COLMAP-derived, model id=13)', () => {
  const DIV_INTR = intr({ kDiv: 0.1 });

  const dx = 0.4, dy = 0.3;
  // Exact rational values: 16/41 and 12/41 (see computation above).
  const ux = 16 / 41;   // 0.39024390243902...
  const uy = 12 / 41;   // 0.29268292682926...
  const TOL = 5;        // |Δ| < 5e-6; Δ from wrong-sign bug ≈ 0.02 → 4000× headroom

  it('inverse undistortNormalized: distorted → undistorted matches COLMAP CamFromImg formula', () => {
    const ud = undistortNormalized({ x: dx, y: dy }, DIV_INTR, CameraModelId.DIVISION);
    expect(ud.valid).toBe(true);
    expect(ud.x).toBeCloseTo(ux, TOL);
    expect(ud.y).toBeCloseTo(uy, TOL);
  });

  it('forward distortNormalized: hand-computed undistorted → recovers original distorted', () => {
    const d = distortNormalized({ x: ux, y: uy }, DIV_INTR, CameraModelId.DIVISION);
    expect(d.x).toBeCloseTo(dx, TOL);
    expect(d.y).toBeCloseTo(dy, TOL);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SIMPLE_DIVISION oracle
//
// Same formula and coefficient (kDiv) as DIVISION; the only difference in the
// full model is fx=fy=f (one focal length instead of two). Both ids dispatch
// through the same 'division' ProjectionClass strategy in DISTORTION_STRATEGIES.
// This test confirms the strategy is wired for both model ids.
// ──────────────────────────────────────────────────────────────────────────────

describe('SIMPLE_DIVISION oracle (independent, same formula as DIVISION, model id=12)', () => {
  const SDIV_INTR = intr({ kDiv: 0.1 });

  const dx = 0.4, dy = 0.3;
  const ux = 16 / 41;
  const uy = 12 / 41;
  const TOL = 5;

  it('inverse undistortNormalized: distorted → undistorted (confirms SIMPLE_DIVISION uses division strategy)', () => {
    const ud = undistortNormalized({ x: dx, y: dy }, SDIV_INTR, CameraModelId.SIMPLE_DIVISION);
    expect(ud.valid).toBe(true);
    expect(ud.x).toBeCloseTo(ux, TOL);
    expect(ud.y).toBeCloseTo(uy, TOL);
  });

  it('forward distortNormalized: undistorted → recovers distorted', () => {
    const d = distortNormalized({ x: ux, y: uy }, SDIV_INTR, CameraModelId.SIMPLE_DIVISION);
    expect(d.x).toBeCloseTo(dx, TOL);
    expect(d.y).toBeCloseTo(dy, TOL);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// OPENCV_FISHEYE equidistant-fisheye oracle
//
// Model: COLMAP id=5, params (fx, fy, cx, cy, k1, k2, k3, k4).
//
// Forward (ImgFromCam) — COLMAP sensor/models.h (OpenCVFisheyeCameraModel):
//   r   = sqrt(x² + y²)                    [perspective/pinhole radius]
//   θ   = atan(r)                           [half-angle of the incoming ray]
//   θd  = θ · (1 + k1·θ² + k2·θ⁴ + k3·θ⁶ + k4·θ⁸)
//   distorted = (x, y) · (θd / r)
//
// Inverse (CamFromImg) — solved by scalar Newton on θ·(1+Rf(θ²)) = θd.
// The canonical undistortNormalized handles this numerically; we verify the
// round-trip back to the original undistorted point.
//
// ── Hand-computation for a=0.5, b=0.2, k1=0.05, k2=−0.01, k3=k4=0 ──────────
//
//   r       = sqrt(0.5² + 0.2²) = sqrt(0.29)
//                                          ≈ 0.53851648071345
//   θ       = atan(r)                     ≈ 0.49398396078939
//             [Independently verified: Python math.atan(math.sqrt(0.29))]
//             [NOTE: plan document erroneously stated θ=0.4941053 (delta 1.2e-4)]
//   θ²      = θ²                          ≈ 0.24402015351718
//   θ⁴      = (θ²)²                       ≈ 0.05954583532255
//   k1·θ²   = 0.05 · 0.24402015          ≈  0.01220100767586
//   k2·θ⁴   = −0.01 · 0.05954583         ≈ −0.00059545835323
//   poly    = 1 + 0.01220101 − 0.00059546 ≈ 1.01160554932263
//   θd      = θ · poly                    ≈ 0.49971691601092
//   scale   = θd / r                      ≈ 0.92795101711442
//   out.x   = 0.5 · scale                 ≈ 0.46397550855721  → oracle: 0.46397551
//   out.y   = 0.2 · scale                 ≈ 0.18559020342288  → oracle: 0.18559020
//
// ── Non-tautological proof (oracle has teeth) ──────────────────────────────────
//   If k2 term were dropped (plausible omission — maps to SIMPLE_RADIAL_FISHEYE
//   if the k2 branch were accidentally dead):
//     θd' = θ*(1 + k1*θ²) ≈ 0.4939839*(1 + 0.01220101) ≈ 0.49998780
//     out.x' = 0.5*(0.49998780/0.53851648) ≈ 0.46424864
//     Δ    ≈ 0.46424864 − 0.46397551 = 2.73e−4   >>>  5e−6 tolerance → test would FAIL
// ──────────────────────────────────────────────────────────────────────────────

describe('OPENCV_FISHEYE oracle (independent COLMAP-derived, equidistant fisheye, model id=5)', () => {
  // k3=k4=0 keeps the arithmetic tractable while exercising both k1 and k2.
  const FE_INTR = intr({ k1: 0.05, k2: -0.01 });

  const a = 0.5, b = 0.2;
  // Oracle values from independently-computed Python arithmetic above (8 decimal places).
  const x_expected = 0.46397551;  // 0.5 * (thetad/r)
  const y_expected = 0.18559020;  // 0.2 * (thetad/r)
  // Tolerance: 5e-6 (toBeCloseTo digit=5). Δ from dropping k2 ≈ 2.73e-4 → 55× headroom.
  const TOL = 5;

  it('forward distortNormalized: undistorted → distorted matches COLMAP equidistant-fisheye formula', () => {
    const d = distortNormalized({ x: a, y: b }, FE_INTR, CameraModelId.OPENCV_FISHEYE);
    expect(d.x).toBeCloseTo(x_expected, TOL);
    expect(d.y).toBeCloseTo(y_expected, TOL);
  });

  it('inverse undistortNormalized: hand-computed distorted point → recovers original undistorted', () => {
    const ud = undistortNormalized({ x: x_expected, y: y_expected }, FE_INTR, CameraModelId.OPENCV_FISHEYE);
    expect(ud.valid).toBe(true);
    expect(ud.x).toBeCloseTo(a, TOL);
    expect(ud.y).toBeCloseTo(b, TOL);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// DIVISION inverse horizon oracle (barrel kDiv < 0, model id=13/12)
//
// Inverse (CamFromImg): undistorted = d / (1 + k·|d|²).
// For barrel distortion (k < 0) the denominator 1 + k·r_d² vanishes at the
// horizon radius r_d = 1/√|k| and turns negative beyond it, so distorted points
// at/past the horizon have NO real flat-plane pre-image (the inverse would give
// Inf / sign-flipped coords). The inverse must report valid:false there, matching
// the domain-edge behavior of EUCM (radicand<0) and FOV (tan singularity).
//
// ── Hand-computation, k = −2.5 (horizon r_d = 1/√2.5 = √0.4 ≈ 0.63245553) ──
//   Inside  d=(0.6, 0):    r_d² = 0.36;  denom = 1 + (−2.5)(0.36) = 1 − 0.9   = 0.1
//                          u = 0.6 / 0.1 = 6.0                         → valid
//   Horizon d=(√0.4, 0):   r_d² = 0.4;   denom = 1 + (−2.5)(0.4)  = 1 − 1.0   = 0.0
//                          u = 0.6324.../0 = Inf                       → invalid
//   Beyond  d=(0.7, 0):    r_d² = 0.49;  denom = 1 + (−2.5)(0.49) = 1 − 1.225 = −0.225
//                          u = 0.7/(−0.225) = −3.111 (sign-flipped)    → invalid
//
// ── Non-tautological proof (oracle has teeth) ─────────────────────────────────
//   The valid-side value 6.0 is derived from denom=0.1 alone; an off-by sign in
//   the denom (1 − k·r² instead of 1 + k·r²) would give denom = 1 + 0.9 = 1.9,
//   u = 0.6/1.9 ≈ 0.3158 — Δ ≈ 5.7 ≫ 5e-6 tolerance → forward test would FAIL.
// ──────────────────────────────────────────────────────────────────────────────

describe('DIVISION horizon oracle (independent COLMAP-derived, barrel kDiv<0, model id=13/12)', () => {
  const DIV_BARREL = intr({ kDiv: -2.5 });
  const TOL = 6;

  it('inside the horizon: distorted (0.6,0) → undistorted (6.0, 0), valid', () => {
    const ud = undistortNormalized({ x: 0.6, y: 0 }, DIV_BARREL, CameraModelId.DIVISION);
    expect(ud.valid).toBe(true);
    expect(ud.x).toBeCloseTo(6.0, TOL);
    expect(ud.y).toBeCloseTo(0, 12);
  });

  it('at the exact horizon (denom=0): valid:false, output finite (no Infinity)', () => {
    const rd = 1 / Math.sqrt(2.5); // 0.6324555320336759
    const ud = undistortNormalized({ x: rd, y: 0 }, DIV_BARREL, CameraModelId.DIVISION);
    expect(ud.valid).toBe(false);
    expect(Number.isFinite(ud.x)).toBe(true);
  });

  it('past the horizon (denom<0): valid:false (no sign-flipped output)', () => {
    const ud = undistortNormalized({ x: 0.7, y: 0 }, DIV_BARREL, CameraModelId.SIMPLE_DIVISION);
    expect(ud.valid).toBe(false);
  });
});
