import { describe, it, expect } from 'vitest';
import { getCameraIntrinsics, INTRINSIC_PARAM_SETTERS } from './cameraIntrinsics';
import { CAMERA_MODEL_DESCRIPTORS } from './cameraModelRegistry';
import { buildCamera } from '../test/builders/colmapBuilders';
import { CameraModelId } from '../types/colmap';
import type { CameraIntrinsics } from '../types/colmap';

describe('getCameraIntrinsics parity (existing models 0-10)', () => {
  const parityCases: Array<{ name: string; modelId: number; params: number[]; expected: Partial<CameraIntrinsics> }> = [
    { name: 'SIMPLE_PINHOLE', modelId: CameraModelId.SIMPLE_PINHOLE, params: [100, 50, 60], expected: { fx: 100, fy: 100, cx: 50, cy: 60 } },
    { name: 'PINHOLE', modelId: CameraModelId.PINHOLE, params: [100, 110, 50, 60], expected: { fx: 100, fy: 110, cx: 50, cy: 60 } },
    { name: 'SIMPLE_RADIAL', modelId: CameraModelId.SIMPLE_RADIAL, params: [100, 50, 60, 0.1], expected: { fx: 100, fy: 100, cx: 50, cy: 60, k1: 0.1 } },
    { name: 'RADIAL', modelId: CameraModelId.RADIAL, params: [100, 50, 60, 0.1, 0.2], expected: { fx: 100, fy: 100, cx: 50, cy: 60, k1: 0.1, k2: 0.2 } },
    { name: 'OPENCV', modelId: CameraModelId.OPENCV, params: [100, 110, 50, 60, 0.1, 0.2, 0.3, 0.4], expected: { fx: 100, fy: 110, cx: 50, cy: 60, k1: 0.1, k2: 0.2, p1: 0.3, p2: 0.4 } },
    { name: 'OPENCV_FISHEYE', modelId: CameraModelId.OPENCV_FISHEYE, params: [100, 110, 50, 60, 0.1, 0.2, 0.3, 0.4], expected: { fx: 100, fy: 110, cx: 50, cy: 60, k1: 0.1, k2: 0.2, k3: 0.3, k4: 0.4 } },
    { name: 'FULL_OPENCV', modelId: CameraModelId.FULL_OPENCV, params: [100, 110, 50, 60, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], expected: { fx: 100, fy: 110, cx: 50, cy: 60, k1: 0.1, k2: 0.2, p1: 0.3, p2: 0.4, k3: 0.5, k4: 0.6, k5: 0.7, k6: 0.8 } },
    { name: 'FOV', modelId: CameraModelId.FOV, params: [100, 110, 50, 60, 0.9], expected: { fx: 100, fy: 110, cx: 50, cy: 60, omega: 0.9 } },
    { name: 'SIMPLE_RADIAL_FISHEYE', modelId: CameraModelId.SIMPLE_RADIAL_FISHEYE, params: [100, 50, 60, 0.1], expected: { fx: 100, fy: 100, cx: 50, cy: 60, k1: 0.1 } },
    { name: 'RADIAL_FISHEYE', modelId: CameraModelId.RADIAL_FISHEYE, params: [100, 50, 60, 0.1, 0.2], expected: { fx: 100, fy: 100, cx: 50, cy: 60, k1: 0.1, k2: 0.2 } },
    { name: 'THIN_PRISM_FISHEYE', modelId: CameraModelId.THIN_PRISM_FISHEYE, params: [100, 110, 50, 60, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], expected: { fx: 100, fy: 110, cx: 50, cy: 60, k1: 0.1, k2: 0.2, p1: 0.3, p2: 0.4, k3: 0.5, k4: 0.6, sx1: 0.7, sy1: 0.8 } },
  ];
  parityCases.forEach(({ name, modelId, params, expected }) => {
    it(`extracts intrinsics for ${name}`, () => {
      expect(getCameraIntrinsics(buildCamera({ modelId, params, width: 640, height: 480 }))).toMatchObject(expected);
    });
  });
});

describe('getCameraIntrinsics (EUCM/DIVISION new fields)', () => {
  it('EUCM: alpha and beta are extracted into alpha/beta fields', () => {
    const cam = buildCamera({ modelId: CameraModelId.EUCM, params: [900, 900, 640, 360, 0.6, 1.1] });
    const intr = getCameraIntrinsics(cam);
    expect(intr.alpha).toBe(0.6);
    expect(intr.beta).toBe(1.1);
  });

  it('DIVISION: k goes to kDiv, NOT k1', () => {
    const cam = buildCamera({ modelId: CameraModelId.DIVISION, params: [800, 810, 320, 240, -0.05] });
    const intr = getCameraIntrinsics(cam);
    expect(intr.kDiv).toBe(-0.05);
    expect(intr.k1).toBe(0);
  });

  it('SIMPLE_RADIAL: k still goes to k1 (unchanged behaviour)', () => {
    const cam = buildCamera({ modelId: CameraModelId.SIMPLE_RADIAL, params: [100, 50, 60, 0.1] });
    const intr = getCameraIntrinsics(cam);
    expect(intr.k1).toBe(0.1);
    expect(intr.kDiv).toBe(0);
  });
});

describe('getCameraIntrinsics (registry-driven)', () => {
  it('extracts fx/fy/cx/cy for the newly-wired DIVISION model', () => {
    const cam = buildCamera({ modelId: CameraModelId.DIVISION, params: [800, 810, 320, 240, -0.05] });
    const intr = getCameraIntrinsics(cam);
    expect(intr.fx).toBe(800);
    expect(intr.fy).toBe(810);
    expect(intr.cx).toBe(320);
    expect(intr.cy).toBe(240);
  });

  it('extracts fx/fy for EUCM and ignores alpha/beta', () => {
    const cam = buildCamera({ modelId: CameraModelId.EUCM, params: [900, 900, 640, 360, 0.6, 1.1] });
    const intr = getCameraIntrinsics(cam);
    expect(intr.fx).toBe(900);
    expect(intr.fy).toBe(900);
    expect(intr.cx).toBe(640);
    expect(intr.cy).toBe(360);
  });

  it('finishes RAD_TAN_THIN_PRISM_FISHEYE (id 11) instead of returning fx=1', () => {
    const params = [700, 705, 320, 240, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const intr = getCameraIntrinsics(buildCamera({ modelId: CameraModelId.RAD_TAN_THIN_PRISM_FISHEYE, params }));
    expect(intr.fx).toBe(700);
    expect(intr.fy).toBe(705);
  });

  it('returns safe defaults for spherical (no pinhole intrinsics)', () => {
    const intr = getCameraIntrinsics(buildCamera({ modelId: CameraModelId.EQUIRECTANGULAR, params: [4096, 2048] }));
    expect(intr.fx).toBe(1);
    expect(intr.fy).toBe(1);
    expect(intr.cx).toBe(0);
    expect(intr.cy).toBe(0);
  });
});

/**
 * Registry-driven exhaustiveness for INTRINSIC_PARAM_SETTERS.
 *
 * `cameraModelRegistry.ts` is the single source of truth: each model's
 * `paramNames` double as dispatch keys into INTRINSIC_PARAM_SETTERS. The dispatch
 * loop in getCameraIntrinsics *silently skips* any name with no setter
 * (`if (setter !== undefined)`), so adding a model with a brand-new param name and
 * forgetting its setter would leave that intrinsic silently at its 0/1 default —
 * the last silent extension edge in the TS layer. These tests turn that silent
 * failure into a red test.
 *
 * Exception set — verified against the actual code in cameraIntrinsics.ts, a WHY
 * per entry:
 *   'k'      → ambiguous radial coefficient. getCameraIntrinsics special-cases it
 *              BEFORE the setter loop (routes to `kDiv` for `division`
 *              projectionClass, `k1` otherwise), so it is intentionally NOT a
 *              setter-map key.
 *   'w','h'  → appear only on EQUIRECTANGULAR (family 'spherical').
 *              getCameraIntrinsics early-returns for spherical models
 *              (`!cameraModelHasPinholeIntrinsics(...)`) BEFORE the setter loop,
 *              so these names never dispatch through the map at all.
 */
describe('INTRINSIC_PARAM_SETTERS registry-driven exhaustiveness', () => {
  const SETTER_EXCEPTIONS = new Set(['k', 'w', 'h']);

  // TEETH (verified during development): the assertion below is a *runtime* check —
  // TS's index signature hides `undefined`, but at runtime a missing key IS
  // undefined, so `.toBeDefined()` genuinely fails. Proven by temporarily
  // commenting out the real `beta` setter in cameraIntrinsics.ts and watching this
  // test go red with `missing setter for "beta" (model EUCM)`; setter restored.
  // The "exactly" test below re-proves those teeth permanently (any drift between
  // the setter map and the exception set fails it) without touching source.
  it('every registry param name has a setter or a documented exception', () => {
    for (const d of Object.values(CAMERA_MODEL_DESCRIPTORS)) {
      for (const name of d.paramNames) {
        if (SETTER_EXCEPTIONS.has(name)) continue;
        expect(
          INTRINSIC_PARAM_SETTERS[name],
          `missing setter for "${name}" (model ${d.colmapName})`,
        ).toBeDefined();
      }
    }
  });

  it('the exception set is exactly the registry names lacking a setter (no drift, no over-listing)', () => {
    const uncovered = new Set<string>();
    for (const d of Object.values(CAMERA_MODEL_DESCRIPTORS)) {
      for (const name of d.paramNames) {
        if (INTRINSIC_PARAM_SETTERS[name] === undefined) uncovered.add(name);
      }
    }
    expect([...uncovered].sort()).toEqual([...SETTER_EXCEPTIONS].sort());
  });
});

/**
 * Behavioral pins for the two names that are NOT plain setter-map keys: the
 * projectionClass-routed 'k', and the non-ASCII 'ω'. These drive the real public
 * path (getCameraIntrinsics on a built Camera) rather than poking the map, so they
 * pin observable behavior, not implementation shape.
 */
describe('getCameraIntrinsics special-case param routing (behavioral pins)', () => {
  it("SIMPLE_RADIAL: 'k' routes to k1 (kDiv stays 0)", () => {
    // params = [f, cx, cy, k]
    const intr = getCameraIntrinsics(buildCamera({ modelId: CameraModelId.SIMPLE_RADIAL, params: [100, 50, 60, 0.1] }));
    expect(intr.k1).toBe(0.1);
    expect(intr.kDiv).toBe(0);
  });

  it("SIMPLE_DIVISION: 'k' routes to kDiv (k1 stays 0)", () => {
    // params = [f, cx, cy, k]; SIMPLE_DIVISION (id 12) has projectionClass 'division'.
    const intr = getCameraIntrinsics(buildCamera({ modelId: CameraModelId.SIMPLE_DIVISION, params: [100, 50, 60, 0.1] }));
    expect(intr.kDiv).toBe(0.1);
    expect(intr.k1).toBe(0);
  });

  it("FOV: 'ω' (U+03C9) has a map setter and lands in the omega field", () => {
    // Guard the exact codepoint so an ASCII 'w' typo can't masquerade as the key.
    expect('ω'.codePointAt(0)).toBe(0x03c9);
    expect(INTRINSIC_PARAM_SETTERS['ω']).toBeDefined();
    // params = [fx, fy, cx, cy, ω]
    const intr = getCameraIntrinsics(buildCamera({ modelId: CameraModelId.FOV, params: [100, 110, 50, 60, 0.9] }));
    expect(intr.omega).toBe(0.9);
  });
});
