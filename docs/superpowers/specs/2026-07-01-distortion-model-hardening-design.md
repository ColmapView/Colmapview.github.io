# Distortion-Model Hardening + EUCM/DIVISION — Design Spec

**Date:** 2026-07-01
**Status:** approved (brainstorm), pending spec review
**Motivation:** an independent 3-lane extensibility audit (design / code / anti-pattern) of the camera-model subsystem found the metadata layer is genuinely extensible (the Plan-1 registry) but the per-model **distortion math** is not — it is hand-written across ~5 parallel implementations with an overloaded classification axis, no cross-implementation contract, and it has already failed silently (a live model-11 bug). Adding a model with new distortion (EUCM/DIVISION) on the current structure is ~11 edits across 3 languages with no test/type catching a missed one.

## Purpose

Make the distortion-math layer safely extensible — so adding a camera model is a single-point, test-guarded addition — and, on that new structure, wire the missing distortion for **RAD_TAN_THIN_PRISM_FISHEYE (11, fixing a live bug)**, **EUCM (16)**, and **DIVISION / SIMPLE_DIVISION (12/13)** (folded-in "Plan 3"). New-in-4.x pure fisheye **SIMPLE_FISHEYE/FISHEYE (14/15)** come nearly free (equidistant fisheye with zero polynomial coeffs).

## Audit findings this addresses (evidence-cited)

- **5 parallel distortion ladders** enumerating the model set independently: `cameraUndistortion.ts` (canonical CPU), `shaders/undistortion.ts` (GLSL forward @:484 + inverse @:90), `splatPsnrMetric.ts:550`, `cameraModelProjection.ts:189/258`. 3 are *accidental* within-TS; 2 are *forced* cross-language (GLSL).
- **"MUST stay in parity" has zero enforcement** — `cameraUndistortion.ts:7` claims to be the tested source of truth for the GLSL, but `undistortion.test.ts` only checks a threshold constant; no numerical CPU↔GLSL comparison exists.
- **`family` overloaded** — `family:'pinhole'` conflates "has fx/fy/cx/cy layout" with "perspective-radial distortion"; EUCM has the layout but a non-radial projection, so it lands in perspective conversions *and* is skipped by every math dispatcher → silent identity.
- **Model 11 is a live bug** — registered + classified `fisheye`, but absent from `isFisheye()` (`cameraUndistortion.ts:53`) + both GLSL shaders + `cameraModelProjection.ts`; `splatPsnrMetric.ts` has it but drops k5/k6. A real RAD_TAN reconstruction renders undistorted + wrong PSNR today.
- **No machine-checkable contract** binding the TS registry ↔ GLSL constants ↔ C++ enum; `CameraIntrinsics` declared twice; EUCM `alpha/beta` have no type-level home / no `INTRINSIC_PARAM_SETTERS` entry.

## Scope

**In:**
1. A **`projectionClass`** field on `CameraModelDescriptor`, orthogonal to `family`, driving distortion-math dispatch.
2. A per-`projectionClass` **distortion strategy** (`{ forward, inverse }`) with `cameraUndistortion.ts` as the single canonical TS source.
3. **Collapse the accidental TS copies** — `splatPsnrMetric.applyDistortion` and `cameraModelProjection.ts`'s per-model math **delegate** to the canonical strategy (5 ladders → 2: canonical TS + GLSL).
4. **Consolidate `CameraIntrinsics`** to one declaration; add `alpha`, `beta`, `kDiv` fields (default 0) + `INTRINSIC_PARAM_SETTERS` entries so EUCM/DIVISION params flow through.
5. **Contract tests** (the reviewers' minimum precondition): a **structural exhaustiveness** test (every `CameraModelId` has a matching GLSL constant + a non-`default` branch in each ladder) and a **numerical CPU↔GLSL parity** test.
6. **Wire the math**, ported verbatim from COLMAP `src/colmap/sensor/models.h`, into the canonical TS + GLSL: fix **model 11** (RAD_TAN_THIN_PRISM_FISHEYE, 16 params), add **EUCM**, **DIVISION/SIMPLE_DIVISION**, and classify **SIMPLE_FISHEYE/FISHEYE** into the fisheye strategy.

**Out (separate follow-ups):**
- **Plan 4 — WASM C++** (add models 11–17 to the C++ enum + `GetNumParams`, raise the `model_id > 10` bound, rebuild via the repo's bundled emsdk, + a TS↔WASM `getNumCameraParams` param-count parity test). ~3 edits + rebuild; the recon confirmed the toolchain is committed and works. EUCM/DIVISION already function via the JS parser fallback without this.
- **GLSL codegen** (generate the shader from a single spec) — not chosen; "Tests + collapse" was selected.
- **Re-basing conversion compatibility on `projectionClass`** — a smaller cleanup; EUCM already returns `incompatible` via empty conversion tables, so it is latent, not broken.

## Design

### `projectionClass` taxonomy

New `CameraModelDescriptor.projectionClass`, orthogonal to `family`. `family` retains its meaning (intrinsics layout / spherical → drives rendering geometry + `cameraModelHasPinholeIntrinsics`); `projectionClass` selects the distortion formula:

| projectionClass | models | formula |
|---|---|---|
| `none` | SIMPLE_PINHOLE, PINHOLE | identity |
| `perspective-radial` | SIMPLE_RADIAL, RADIAL, OPENCV, FULL_OPENCV | polynomial radial + tangential + prism (params default 0) |
| `fov` | FOV | ω / atan model |
| `fisheye` | SIMPLE_RADIAL_FISHEYE, RADIAL_FISHEYE, OPENCV_FISHEYE, THIN_PRISM_FISHEYE, **RAD_TAN_THIN_PRISM_FISHEYE**, **SIMPLE_FISHEYE**, **FISHEYE** | equidistant fisheye + polynomial |
| `division` | **SIMPLE_DIVISION**, **DIVISION** | division model |
| `eucm` | **EUCM** | enhanced unified (alpha, beta) |
| `spherical` | EQUIRECTANGULAR | none (full-sphere; no plane-undistort) |

`projectionClass` is a required field on the exhaustive `Record<CameraModelId, CameraModelDescriptor>`, so a new enum member won't compile until it's classified. Existing predicates (`isPerspectiveCameraModel`/`isFisheyeCameraModel`) may be re-derived from `projectionClass` where equivalent, but re-basing the conversion tables is out of scope (see above).

### Canonical distortion strategy

A single TS module owns the math, one strategy per `projectionClass`:
```ts
interface DistortionStrategy {
  // normalized (undistorted) → normalized (distorted)
  forward(u: Vec2, intr: CameraIntrinsics): Vec2;
  // normalized (distorted) → normalized (undistorted); iterative where needed
  inverse(d: Vec2, intr: CameraIntrinsics): { value: Vec2; valid: boolean };
}
const DISTORTION_STRATEGIES: Record<ProjectionClass, DistortionStrategy>;
```
`cameraUndistortion.ts`'s existing `distortNormalized`/`undistortNormalized` become thin dispatchers that look up the strategy by `projectionClass` (from the registry). All params come from `CameraIntrinsics` (unused coeffs default 0), so one `perspective-radial` strategy covers SIMPLE_RADIAL…FULL_OPENCV, and one `fisheye` strategy covers the whole fisheye set.

### Collapse the accidental copies

- `splatPsnrMetric.applyDistortion` → delete; call the canonical `distortNormalized`.
- `cameraModelProjection.ts` `projectPoint`/`unprojectPoint` per-model math → delegate to the canonical strategy (removing the silent p1/p2/sx1/sy1 drop for thin-prism).

### `CameraIntrinsics` consolidation

One declaration in `types/colmap.ts` (delete the duplicate in `shaders/undistortion.ts` — import type-only). Add `alpha`, `beta`, `kDiv` (default 0); add setters to `INTRINSIC_PARAM_SETTERS` so `getCameraIntrinsics` populates them for EUCM/DIVISION.

### GLSL (the one forced parallel path)

`shaders/undistortion.ts` gains: a GLSL constant per `projectionClass` (or keeps model-id constants but branches by class), and forward/inverse branches for `division`, `eucm`, and the corrected fisheye set — implementing the **same** formulas as the canonical strategy. New GLSL uniforms `alpha`, `beta`, `kDiv` wired in `UndistortedImageMaterial.tsx`.

### Contract tests (the seams)

- **Structural exhaustiveness** (cheap, catches the model-11 silent-drop): a Vitest test iterating `Object.values(CameraModelId)` that asserts (a) each model's `projectionClass` is set; (b) each model's projectionClass constant appears in the GLSL string; (c) the canonical strategy table has an entry for every projectionClass; (d) no ladder relies on a `default` for a real model. Fails immediately if a model is added without wiring.
- **Numerical CPU↔GLSL parity**: for a grid of normalized points × each projectionClass, assert the GLSL forward/inverse matches the canonical within a tolerance (e.g. `< 1e-4`). **Execution mechanism to resolve in planning:** prefer running the actual GLSL via a headless-GL/WebGL harness if the repo's vitest env supports it (it already has GPU-adjacent tests); otherwise fall back to a single adjacent TS transcription of the GLSL evaluated in-test, kept honest by the structural test + review. (Even the fallback plus collapse is a strict improvement over today's zero parity coverage.)

### The math (ported verbatim, not derived)

Forward/inverse for RAD_TAN_THIN_PRISM_FISHEYE, EUCM, and DIVISION/SIMPLE_DIVISION are ported directly from COLMAP `src/colmap/sensor/models.h` (`ImgFromCam`/`CamFromImg`/`Distortion`) during planning, so correctness is a transcription + parity-test problem, not a derivation problem.

## Testing strategy

Per the repo's convention (pure-function tests; the GLSL/canvas isn't directly unit-tested today):
- Characterization/parity tests for the **existing** models 0–10 through the refactored canonical strategy (behavior-preserving — this is a refactor of tested code).
- New per-class round-trip tests (forward→inverse ≈ identity) for `fisheye`(model 11), `division`, `eucm`.
- The two contract tests above.
- Delegation tests: `splatPsnrMetric`/`cameraModelProjection` outputs match the canonical.

## Risks

- **GLSL restructure** is the riskiest change (visual, hard to unit-test). Mitigation: the numerical parity + structural tests, plus a manual before/after check on a distorted (e.g. OPENCV) dataset.
- **Parity-test execution mechanism** (headless-GL vs TS-transcription) is unresolved until we check the vitest env — a planning-time spike.
- **Math correctness** for EUCM/DIVISION — mitigated by verbatim COLMAP port + round-trip tests.
- **Scope size** — this is the largest effort so far (~12–16 tasks); the plan will sequence it as behavior-preserving refactor first (green throughout), then additive model wiring.
- **Branch independence** — this branches off `main`; the unmerged Plan-2 branch also edits `cameraModelRegistry.ts` (adds an `Object.freeze`). Merging both later may need a trivial additive conflict resolution in that file.
