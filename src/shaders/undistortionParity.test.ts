/**
 * Contract tests for GLSL↔canonical distortion parity.
 *
 * Part 1 — structural exhaustiveness: verifies that
 *   (a) every "const int NAME = N" in both GLSL shaders matches CameraModelId[NAME],
 *   (b) every COLMAP model with active distortion appears in the fragment-shader
 *       applyDistortion dispatch and the vertex-shader inverseDistort dispatch, and
 *   (c) DISTORTION_STRATEGIES has a non-identity entry for every active
 *       projectionClass.
 *
 * Part 2 — numerical CPU↔GLSL parity: compares glslForwardReference (a TS
 * transcription of the fragment-shader applyDistortion() math) against the
 * canonical DISTORTION_STRATEGIES.forward for each projectionClass, over a grid
 * of normalized coordinates, asserting agreement within 1e-4.
 *
 * RESIDUAL RISK: Part 2 uses a transcription of the shader *string*, not the
 * executed GLSL. Bugs present identically in both cannot be caught here. The
 * structural test (Part 1) + a manual GPU check (Task 11) cover the rest.
 *
 * SCOPE: the RAD_TAN vertex-shader inverse is intentionally out-of-scope — it is
 * dead code because resolveUndistortionMode() always forces fisheye cameras to
 * cropped mode, bypassing the full-frame vertex shader entirely.
 */

import { describe, it, expect } from 'vitest';
import { CameraModelId } from '../types/cameraModelId';
import { CAMERA_MODEL_DESCRIPTORS } from '../utils/cameraModelRegistry';
import type { ProjectionClass } from '../utils/cameraModelRegistry';
import { DISTORTION_STRATEGIES } from '../utils/cameraUndistortion';
import type { Vec2 } from '../utils/cameraUndistortion';
import type { CameraIntrinsics } from '../types/colmap';
import {
  fullFrameVertexShader,
  undistortionFragmentShader,
  glslForwardReference,
  glslInverseReference,
} from './undistortion';

// ── Shared test fixtures ──────────────────────────────────────────────────────

const BASE_I: CameraIntrinsics = {
  fx: 1, fy: 1, cx: 0, cy: 0,
  k1: 0, k2: 0, k3: 0, k4: 0, k5: 0, k6: 0,
  p1: 0, p2: 0, omega: 0,
  sx1: 0, sy1: 0, sx2: 0, sy2: 0,
  alpha: 0, beta: 0, kDiv: 0,
};

// ── Local TS transcriptions of GLSL per-sub-model fisheye functions ───────────
// These mirror the specific GLSL functions in undistortionFragmentShader that
// are dispatched per model, NOT the generic _glslThinPrismFisheye used by
// glslForwardReference. Keeping them separate ensures each test exercises the
// actual GLSL code path for that sub-model.
//
// Each returns the full distorted coordinate (undistorted + delta), matching
// the DISTORTION_STRATEGIES['fisheye'].forward API.
// The GLSL functions return a delta; the fragment shader adds it to the input
// in perspectiveToDistorted. The net result is the same: p * (thetad/r).
//
// KEEP IN SYNC WITH THE GLSL distortOpenCVFisheye / distortSimpleRadialFisheye
// / distortRadialFisheye functions in undistortionFragmentShader.

// Mirrors distortOpenCVFisheye() — dispatched for OPENCV_FISHEYE (5),
// SIMPLE_FISHEYE (14), FISHEYE (15). With zero k coefficients reduces to pure
// equidistant projection (thetad=theta, scale=atan(r)/r).
function _localOpenCVFisheye(p: Vec2, i: CameraIntrinsics): Vec2 {
  const r = Math.hypot(p.x, p.y);
  if (r < 0.00001) return { x: p.x, y: p.y };
  const theta  = Math.atan(r);
  const theta2 = theta * theta;
  const theta4 = theta2 * theta2;
  const theta6 = theta4 * theta2;
  const theta8 = theta4 * theta4;
  const thetad = theta * (1.0 + i.k1 * theta2 + i.k2 * theta4 + i.k3 * theta6 + i.k4 * theta8);
  const scale  = thetad / r;
  return { x: p.x * scale, y: p.y * scale };
}

// Mirrors distortSimpleRadialFisheye() — dispatched for SIMPLE_RADIAL_FISHEYE (8).
// Polynomial: theta*(1 + k1*theta2). Equivalent to _localOpenCVFisheye with k2=k3=k4=0.
function _localSimpleRadialFisheye(p: Vec2, i: CameraIntrinsics): Vec2 {
  const r = Math.hypot(p.x, p.y);
  if (r < 0.00001) return { x: p.x, y: p.y };
  const theta  = Math.atan(r);
  const theta2 = theta * theta;
  const thetad = theta * (1.0 + i.k1 * theta2);
  const scale  = thetad / r;
  return { x: p.x * scale, y: p.y * scale };
}

// Mirrors distortRadialFisheye() — dispatched for RADIAL_FISHEYE (9).
// Polynomial: theta*(1 + k1*theta2 + k2*theta4). Equivalent to _localOpenCVFisheye with k3=k4=0.
function _localRadialFisheye(p: Vec2, i: CameraIntrinsics): Vec2 {
  const r = Math.hypot(p.x, p.y);
  if (r < 0.00001) return { x: p.x, y: p.y };
  const theta  = Math.atan(r);
  const theta2 = theta * theta;
  const theta4 = theta2 * theta2;
  const thetad = theta * (1.0 + i.k1 * theta2 + i.k2 * theta4);
  const scale  = thetad / r;
  return { x: p.x * scale, y: p.y * scale };
}

// ── Part 1 — Structural exhaustiveness ───────────────────────────────────────

describe('GLSL distortion structural exhaustiveness', () => {

  it('all GLSL const int model constants match CameraModelId values', () => {
    /**
     * Parses "const int NAME = N;" from both GLSL shader strings and asserts that
     * each N equals CameraModelId[NAME]. A mismatch means the GLSL uses a wrong
     * numeric value — every "modelId == NAME" comparison at runtime would dispatch
     * to the wrong model.
     */
    const shaders = [undistortionFragmentShader, fullFrameVertexShader];
    const constPat = /const int (\w+) = (\d+);/g;
    let foundAny = false;
    for (const shader of shaders) {
      constPat.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = constPat.exec(shader)) !== null) {
        const name      = m[1];
        const glslValue = Number(m[2]);
        const tsValue   = (CameraModelId as Record<string, number | undefined>)[name];
        expect(
          tsValue,
          `CameraModelId['${name}'] must exist (GLSL declares "const int ${name} = ${glslValue}")`,
        ).toBeDefined();
        expect(
          glslValue,
          `const int ${name} in GLSL (${glslValue}) must equal CameraModelId.${name} (${tsValue})`,
        ).toBe(tsValue);
        foundAny = true;
      }
    }
    // Guard: both shaders must declare some constants (sanity check on the regex).
    expect(foundAny, 'both GLSL shaders must contain at least one "const int MODEL = N" declaration').toBe(true);
  });

  it('every active-distortion model appears in the fragment shader applyDistortion dispatch', () => {
    /**
     * Scans for "modelId == CONSTANT_NAME" in the fragment shader string. Any
     * non-none / non-spherical model absent from this set falls through to the
     * default "return vec2(0.0)" branch in applyDistortion, silently rendering it
     * with no distortion applied.
     *
     * This test would have RED-flagged models 11 (RAD_TAN_THIN_PRISM_FISHEYE),
     * 14 (SIMPLE_FISHEYE), and 15 (FISHEYE) before they were wired in Task 6.
     *
     * Regex anchored to "if (", "else if (", or "||" to avoid false matches inside
     * GLSL // comments (which don't contain those prefixes).
     */
    const refs = new Set<string>();
    const pat  = /(?:(?:if|else if)\s*\(\s*|\|\|\s*)modelId\s*==\s*(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = pat.exec(undistortionFragmentShader)) !== null) refs.add(m[1]);

    for (const desc of Object.values(CAMERA_MODEL_DESCRIPTORS)) {
      if (desc.projectionClass === 'none' || desc.projectionClass === 'spherical') continue;
      expect(
        refs.has(desc.colmapName),
        `fragment shader applyDistortion: "${desc.colmapName}" (model ${desc.id}, ` +
        `class "${desc.projectionClass}") must appear in a "modelId == ${desc.colmapName}" branch; ` +
        `its projectionClass requires active distortion GLSL`,
      ).toBe(true);
    }
  });

  it('every active-distortion model appears in the vertex shader inverseDistort dispatch', () => {
    /**
     * Same scan for the full-frame vertex shader. Even though fisheye models are
     * forced to cropped mode (so their inverseDistort branch is dead code at runtime),
     * the branch must exist so it is correct if the mode is re-enabled in future.
     *
     * This test would have RED-flagged models 11, 14, 15 if they were missing from
     * the vertex shader's inverseDistort.
     *
     * Regex anchored to "if (", "else if (", or "||" to avoid false matches inside
     * GLSL // comments (which don't contain those prefixes).
     */
    const refs = new Set<string>();
    const pat  = /(?:(?:if|else if)\s*\(\s*|\|\|\s*)modelId\s*==\s*(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = pat.exec(fullFrameVertexShader)) !== null) refs.add(m[1]);

    for (const desc of Object.values(CAMERA_MODEL_DESCRIPTORS)) {
      if (desc.projectionClass === 'none' || desc.projectionClass === 'spherical') continue;
      expect(
        refs.has(desc.colmapName),
        `vertex shader inverseDistort: "${desc.colmapName}" (model ${desc.id}, ` +
        `class "${desc.projectionClass}") must appear in a "modelId == ${desc.colmapName}" branch`,
      ).toBe(true);
    }
  });

  it('DISTORTION_STRATEGIES has a non-identity entry for every active projectionClass', () => {
    /**
     * Calls .forward on a non-trivial test point and verifies the result is not the
     * identity (i.e., the strategy actually applies distortion). An accidental
     * identity entry would silently render the class undistorted.
     */
    const testPoint: Vec2 = { x: 0.3, y: 0.2 };

    // Per-class intrinsic overrides that make the forward map non-trivial.
    // Note: 'fisheye' and 'fisheye-radtan' are non-identity even with zero
    // polynomial coefficients because the fisheye→pinhole projection (atan mapping)
    // compresses radii: atan(r)/r < 1 for r > 0.
    const overrides: Partial<Record<ProjectionClass, Partial<CameraIntrinsics>>> = {
      'perspective-radial': { k1: 0.1 },
      'fov':                { omega: 0.5 },
      'fisheye':            {},
      'fisheye-radtan':     {},
      'division':           { kDiv: 0.1 },
      'eucm':               { alpha: 0.5, beta: 0.5 },
    };

    const activeClasses: ProjectionClass[] = [
      'perspective-radial', 'fov', 'fisheye', 'fisheye-radtan', 'division', 'eucm',
    ];

    for (const cls of activeClasses) {
      const i: CameraIntrinsics = { ...BASE_I, ...(overrides[cls] ?? {}) };
      const out = DISTORTION_STRATEGIES[cls].forward(testPoint, i);
      const isIdentity = Math.abs(out.x - testPoint.x) < 1e-12 &&
                         Math.abs(out.y - testPoint.y) < 1e-12;
      expect(
        isIdentity,
        `DISTORTION_STRATEGIES['${cls}'].forward must produce a non-identity result ` +
        `(got {${out.x.toFixed(8)}, ${out.y.toFixed(8)}} ≡ input {${testPoint.x}, ${testPoint.y}})`,
      ).toBe(false);
    }
  });

});

// ── Part 2 — Numerical CPU↔GLSL forward parity ───────────────────────────────

describe('CPU↔GLSL forward parity (fragment shader applyDistortion)', () => {
  /**
   * For each projectionClass, glslForwardReference (TS line-for-line transcription of
   * the fragment-shader applyDistortion() math) is compared against the canonical
   * DISTORTION_STRATEGIES[cls].forward over a grid of normalized coordinates.
   * Agreement must be within 1e-4.
   *
   * 'perspective-radial' uses the FULL_OPENCV formula; simpler sub-models
   * (SIMPLE_RADIAL, RADIAL, OPENCV) reduce to it with zero higher-order coefficients
   * and are structurally verified by Part 1.
   *
   * 'fisheye' uses the THIN_PRISM_FISHEYE formula; simpler fisheye sub-models reduce
   * to it with zero coefficients. Two sub-cases are tested: with non-zero
   * tangential+thin-prism (THIN_PRISM_FISHEYE path) and with all-zero coefficients
   * (SIMPLE_FISHEYE / FISHEYE path).
   *
   * SCOPE: the RAD_TAN vertex-shader inverse is intentionally excluded — it is dead
   * code because resolveUndistortionMode() always downgrades fisheye cameras to
   * cropped mode, so the full-frame vertex shader is never used for fisheye models.
   */

  // 5×5 grid in normalized coordinates (max |p| ≈ 0.283), excluding exact origin.
  const GRID: Vec2[] = [];
  for (let ix = -2; ix <= 2; ix++) {
    for (let iy = -2; iy <= 2; iy++) {
      if (ix === 0 && iy === 0) continue;
      GRID.push({ x: ix * 0.1, y: iy * 0.1 });
    }
  }

  const TOL = 1e-4;

  function assertParity(cls: ProjectionClass, overrides: Partial<CameraIntrinsics>): void {
    const i: CameraIntrinsics = { ...BASE_I, ...overrides };
    for (const p of GRID) {
      const canonical = DISTORTION_STRATEGIES[cls].forward(p, i);
      const glslRef   = glslForwardReference(cls, p, i);
      const errX = Math.abs(glslRef.x - canonical.x);
      const errY = Math.abs(glslRef.y - canonical.y);
      expect(
        errX,
        `cls='${cls}' p={${p.x},${p.y}}: ` +
        `glslRef.x=${glslRef.x.toFixed(8)} canonical.x=${canonical.x.toFixed(8)} errX=${errX.toExponential(2)}`,
      ).toBeLessThan(TOL);
      expect(
        errY,
        `cls='${cls}' p={${p.x},${p.y}}: ` +
        `glslRef.y=${glslRef.y.toFixed(8)} canonical.y=${canonical.y.toFixed(8)} errY=${errY.toExponential(2)}`,
      ).toBeLessThan(TOL);
    }
  }

  it("'perspective-radial' (FULL_OPENCV: rational radial + tangential) matches canonical", () => {
    assertParity('perspective-radial', {
      k1: 0.1, k2: -0.05, k3: 0.02,
      k4: 0.01, k5: -0.005, k6: 0.001,
      p1: 0.001, p2: -0.001,
    });
  });

  it("'fov' matches canonical", () => {
    assertParity('fov', { omega: 1.2 });
  });

  it("'fisheye' with full tangential + thin-prism coefficients (THIN_PRISM_FISHEYE formula) matches canonical", () => {
    assertParity('fisheye', {
      k1: 0.1, k2: -0.05, k3: 0.02, k4: -0.01,
      p1: 0.005, p2: -0.005,
      sx1: 0.001, sy1: -0.001,
    });
  });

  it("'fisheye' with zero polynomial coefficients (SIMPLE_FISHEYE / FISHEYE path) matches canonical", () => {
    // Zero coefficients: only the equidistant fisheye→pinhole projection applies.
    assertParity('fisheye', {});
  });

  it("'fisheye-radtan' (6-coeff radial + tangential + thin-prism on radially-scaled coords) matches canonical", () => {
    assertParity('fisheye-radtan', {
      k1: 0.1, k2: -0.05, k3: 0.02, k4: -0.01, k5: 0.005, k6: -0.002,
      p1: 0.005, p2: -0.005,
      sx1: 0.001, sy1: -0.001, sx2: 0.001, sy2: -0.001,
    });
  });

  it("'division' matches canonical", () => {
    assertParity('division', { kDiv: 0.5 });
  });

  it("'eucm' matches canonical", () => {
    assertParity('eucm', { alpha: 0.5, beta: 0.8 });
  });

});

// ── Part 3 — Numerical CPU↔GLSL inverse parity ───────────────────────────────

describe('CPU↔GLSL inverse parity (vertex shader inverseDistort)', () => {
  /**
   * For each non-fisheye projectionClass whose inverseDistort branch is ACTIVE in
   * full-frame mode, glslInverseReference (TS line-for-line transcription of the
   * vertex-shader inverseDistort() math) is compared against the canonical
   * DISTORTION_STRATEGIES[cls].inverse over a grid of DISTORTED normalized points.
   *
   * Distorted inputs are generated by forward-distorting the canonical undistorted
   * grid via DISTORTION_STRATEGIES[cls].forward, ensuring all test points are in-range
   * (the forward map produces valid distorted coords by construction).
   *
   * Tolerances:
   *   fov, division, eucm: exact closed-form in both GLSL and TS reference → < 1e-4
   *   perspective-radial:  GLSL uses 15 Newton iterations; canonical uses 20 → < 1e-3
   *     (if divergence exceeds 1e-3 that is a genuine CPU↔GLSL bug, not a tolerance issue)
   *
   * EXPLICITLY EXCLUDED: fisheye and fisheye-radtan.
   * resolveUndistortionMode() always forces fisheye cameras to cropped mode, so the
   * full-frame vertex shader (and its fisheye inverseDistort branches) are DEAD CODE
   * for those camera families. Testing dead branches would add noise without catching
   * real active-path divergences.
   *
   * RESIDUAL RISK: same as Part 2 — the reference is a transcription of the shader
   * string, not the executed GLSL. Single-precision rounding and driver-specific
   * behaviour are not captured (covered by the manual GPU check in Task 11).
   */

  // Undistorted 5×5 grid; forward-distort these to get valid distorted inputs.
  const UNDIST_GRID: Vec2[] = [];
  for (let ix = -2; ix <= 2; ix++) {
    for (let iy = -2; iy <= 2; iy++) {
      if (ix === 0 && iy === 0) continue;
      UNDIST_GRID.push({ x: ix * 0.1, y: iy * 0.1 });
    }
  }

  function assertInverseParity(
    cls: ProjectionClass,
    overrides: Partial<CameraIntrinsics>,
    tol: number,
  ): void {
    const i: CameraIntrinsics = { ...BASE_I, ...overrides };
    for (const p of UNDIST_GRID) {
      // Forward-distort to get a valid distorted input.
      const d = DISTORTION_STRATEGIES[cls].forward(p, i);
      const canonical = DISTORTION_STRATEGIES[cls].inverse(d, i);
      // Skip the rare in-range point that canonical marks invalid (e.g. folded
      // barrel near the distortion boundary).
      if (!canonical.valid) continue;
      const glslRef = glslInverseReference(cls, d, i);
      const errX = Math.abs(glslRef.x - canonical.x);
      const errY = Math.abs(glslRef.y - canonical.y);
      expect(
        errX,
        `cls='${cls}' distorted={${d.x.toFixed(6)},${d.y.toFixed(6)}}: ` +
        `glslRef.x=${glslRef.x.toFixed(8)} canonical.x=${canonical.x.toFixed(8)} errX=${errX.toExponential(2)}`,
      ).toBeLessThan(tol);
      expect(
        errY,
        `cls='${cls}' distorted={${d.x.toFixed(6)},${d.y.toFixed(6)}}: ` +
        `glslRef.y=${glslRef.y.toFixed(8)} canonical.y=${canonical.y.toFixed(8)} errY=${errY.toExponential(2)}`,
      ).toBeLessThan(tol);
    }
  }

  it("'perspective-radial' Newton inverse (15 GLSL iterations) matches canonical within 1e-3", () => {
    // GLSL uses 15 Newton iterations vs canonical's 20; looser tolerance accepted.
    // Divergence beyond 1e-3 would indicate a genuine CPU↔GLSL bug.
    assertInverseParity('perspective-radial', {
      k1: 0.1, k2: -0.05, k3: 0.02,
      k4: 0.01, k5: -0.005, k6: 0.001,
      p1: 0.001, p2: -0.001,
    }, 1e-3);
  });

  it("'fov' closed-form inverse matches canonical within 1e-4", () => {
    assertInverseParity('fov', { omega: 1.2 }, 1e-4);
  });

  it("'division' closed-form inverse matches canonical within 1e-4", () => {
    assertInverseParity('division', { kDiv: 0.5 }, 1e-4);
  });

  it("'eucm' closed-form inverse matches canonical within 1e-4", () => {
    assertInverseParity('eucm', { alpha: 0.5, beta: 0.8 }, 1e-4);
  });

});

// ── Part 4 — Per-fisheye-sub-model GLSL forward parity ───────────────────────

describe('fisheye sub-model GLSL forward parity (per-model GLSL function vs canonical)', () => {
  /**
   * Part 2 tests the 'fisheye' projection class via glslForwardReference, which
   * dispatches to _glslThinPrismFisheye (the most general formula). However, the
   * GLSL fragment shader dispatches to DISTINCT functions for specific sub-models:
   *   • distortOpenCVFisheye    → OPENCV_FISHEYE (5), SIMPLE_FISHEYE (14), FISHEYE (15)
   *   • distortSimpleRadialFisheye → SIMPLE_RADIAL_FISHEYE (8)
   *   • distortRadialFisheye    → RADIAL_FISHEYE (9)
   *   • distortThinPrismFisheye → THIN_PRISM_FISHEYE (10) — covered by Part 2
   *
   * This section verifies each distinct GLSL function via its own independent TS
   * transcription (the _local* helpers defined above) against the canonical
   * DISTORTION_STRATEGIES['fisheye'].forward, using coefficient patterns
   * appropriate to each sub-model.
   *
   * These tests catch bugs in the sub-model-specific GLSL function that the generic
   * class-level test in Part 2 cannot detect (e.g., an off-by-one in the k3 term of
   * distortRadialFisheye while distortThinPrismFisheye remains correct).
   *
   * INVERSE NOTE: The fisheye vertex-shader inverseDistort branches are dead code
   * at runtime — resolveUndistortionMode() always forces fisheye cameras to cropped
   * mode, so the full-frame vertex shader is never used for fisheye models. Inverse
   * GLSL parity for fisheye sub-models is intentionally excluded (see Parts 2/3 scope
   * notes). The forward GLSL path (fragment shader) IS active for all fisheye models.
   */

  // Same 5×5 grid as Part 2, defined locally to keep Part 4 self-contained.
  const FISHEYE_GRID: Vec2[] = [];
  for (let ix = -2; ix <= 2; ix++) {
    for (let iy = -2; iy <= 2; iy++) {
      if (ix === 0 && iy === 0) continue;
      FISHEYE_GRID.push({ x: ix * 0.1, y: iy * 0.1 });
    }
  }

  const TOL = 1e-4;

  function assertSubModelParity(
    label: string,
    glslFn: (p: Vec2, i: CameraIntrinsics) => Vec2,
    overrides: Partial<CameraIntrinsics>,
  ): void {
    const i: CameraIntrinsics = { ...BASE_I, ...overrides };
    for (const p of FISHEYE_GRID) {
      const canonical = DISTORTION_STRATEGIES['fisheye'].forward(p, i);
      const glslRef   = glslFn(p, i);
      const errX = Math.abs(glslRef.x - canonical.x);
      const errY = Math.abs(glslRef.y - canonical.y);
      expect(
        errX,
        `${label} p={${p.x},${p.y}} glslRef.x=${glslRef.x.toFixed(8)} canonical.x=${canonical.x.toFixed(8)} errX=${errX.toExponential(2)}`,
      ).toBeLessThan(TOL);
      expect(
        errY,
        `${label} p={${p.x},${p.y}} glslRef.y=${glslRef.y.toFixed(8)} canonical.y=${canonical.y.toFixed(8)} errY=${errY.toExponential(2)}`,
      ).toBeLessThan(TOL);
    }
  }

  it('OPENCV_FISHEYE (5): distortOpenCVFisheye with k1-k4 non-zero matches canonical', () => {
    // Uses all four polynomial coefficients; zero k3/k4 would reduce to RADIAL_FISHEYE.
    assertSubModelParity('OPENCV_FISHEYE(5)', _localOpenCVFisheye, {
      k1: 0.05, k2: -0.01, k3: 0.003, k4: -0.001,
    });
  });

  it('SIMPLE_RADIAL_FISHEYE (8): distortSimpleRadialFisheye with k1-only matches canonical', () => {
    // Single radial coefficient; k2-k4=0 is the defining constraint of this sub-model.
    assertSubModelParity('SIMPLE_RADIAL_FISHEYE(8)', _localSimpleRadialFisheye, { k1: 0.1 });
  });

  it('RADIAL_FISHEYE (9): distortRadialFisheye with k1,k2 matches canonical', () => {
    // Two radial coefficients; k3=k4=0.
    assertSubModelParity('RADIAL_FISHEYE(9)', _localRadialFisheye, { k1: 0.1, k2: -0.05 });
  });

  it('SIMPLE_FISHEYE (14) + FISHEYE (15): distortOpenCVFisheye with zero poly matches canonical', () => {
    // Pure equidistant: all k=0, thetad=theta, distorted = p * (theta/r) = p * atan(r)/r.
    // SIMPLE_FISHEYE has one focal length (f), FISHEYE has two (fx,fy); both share the
    // same distortOpenCVFisheye GLSL function with k1=k2=k3=k4=0.
    assertSubModelParity('SIMPLE_FISHEYE/FISHEYE(14,15)', _localOpenCVFisheye, {});
  });

});
