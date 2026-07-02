# Distortion-Model Hardening + EUCM/DIVISION Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make per-model distortion math registry-driven and test-guarded (one canonical TS strategy + a GLSL parity contract), fix the live model-11 bug, and add EUCM + DIVISION (+ free SIMPLE_FISHEYE/FISHEYE) distortion.

**Architecture:** Add a `projectionClass` axis to the camera-model descriptor (orthogonal to `family`). `cameraUndistortion.ts` becomes the single canonical distortion source, dispatching by `projectionClass` through a `DISTORTION_STRATEGIES` table. `splatPsnrMetric` and `cameraModelProjection` delegate to it (5 ladders → 2). Two contract tests (structural exhaustiveness + numerical CPU↔GLSL parity via a paired TS reference of the GLSL) prevent silent drift. New math is ported verbatim from COLMAP `models.h`.

**Tech Stack:** TypeScript, Vitest (jsdom — no real WebGL), GLSL-as-TS-string shaders.

## Global Constraints

- Run from `colmap-webview/`. Tests `npm run test:run`; build `npm run build`; lint `npm run lint`.
- **Behavior-preserving first:** Phase A is a refactor of already-working models 0–10 — the full suite must stay green at every task; add characterization round-trip tests to prove parity.
- **Port, don't derive:** the EUCM/DIVISION/RAD_TAN formulas below are from COLMAP `src/colmap/sensor/models.h`; transcribe them; round-trip tests are the correctness guard.
- **Normalized convention** (from `cameraUndistortion.ts:9-17`): `forward`/`distortNormalized` = undistorted pinhole coords `(X/Z,Y/Z)` → distorted normalized coords; `inverse`/`undistortNormalized` = distorted → undistorted, returning `valid:false` when the ray can't lie on a flat plane.
- End every commit message with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

### projectionClass mapping (the source of truth for dispatch)

| projectionClass | models |
|---|---|
| `none` | SIMPLE_PINHOLE, PINHOLE |
| `perspective-radial` | SIMPLE_RADIAL, RADIAL, OPENCV, FULL_OPENCV |
| `fov` | FOV |
| `fisheye` | SIMPLE_RADIAL_FISHEYE, RADIAL_FISHEYE, OPENCV_FISHEYE, THIN_PRISM_FISHEYE, RAD_TAN_THIN_PRISM_FISHEYE, SIMPLE_FISHEYE, FISHEYE |
| `division` | SIMPLE_DIVISION, DIVISION |
| `eucm` | EUCM |
| `spherical` | EQUIRECTANGULAR |

### COLMAP math (our normalized convention, w=1), to port in Phase B

**EUCM** (closed form both ways). `forward(p)`: `den = alpha*sqrt(beta*(p.x²+p.y²)+1) + (1-alpha); return {x:p.x/den, y:p.y/den}`. `inverse(m)`: `r2=m.x²+m.y²; g=1-alpha; radicand = 1 - (2*alpha-1)*beta*r2; if (radicand < 0) return {…, valid:false}; hden = alpha*sqrt(radicand)+g; helper = (1 - alpha*alpha*beta*r2)/hden; return {x:m.x/helper, y:m.y/helper, valid: helper>0}`.

**DIVISION / SIMPLE_DIVISION** (closed form; `kDiv` = the `k` param; SIMPLE uses fx=fy=f). `forward(p)`: `rho2=p.x²+p.y²; disc2 = 1 - 4*rho2*kDiv; if (disc2 < 0) return {…, invalid or clamp}; r = 2/(1+sqrt(disc2)); return {x:r*p.x, y:r*p.y}`. `inverse(m)`: `r2=m.x²+m.y²; denom = 1 + kDiv*r2; return {x:m.x/denom, y:m.y/denom, valid:true}`.

**RAD_TAN_THIN_PRISM_FISHEYE** (model 11; fisheye-angle-space `Distortion`, applied like the existing THIN_PRISM path but with 6 radial + tangential-on-radially-distorted + 4 prism). COLMAP param order maps to our `CameraIntrinsics`: `radial_coeffs[0..5]→k1..k6`, COLMAP `p0→p1`, `p1→p2`, `s0→sx1, s1→sy1, s2→sx2, s3→sy2`. Given angle-space `uu=(u,v)`:
```
theta2 = u*u+v*v; th_radial = 1 + k1*theta2 + k2*theta2² + … + k6*theta2⁶;
x = th_radial*u; y = th_radial*v; x2=x*x; y2=y*y; xy=x*y; r2=x2+y2; r4=r2*r2;
dx_tang = 2*p1*xy + p2*(r2+2*x2);   dy_tang = 2*p2*xy + p1*(r2+2*y2);   // NOTE p0/p1 COLMAP → p1/p2 ours
dx_tp = sx1*r2 + sy1*r4;            dy_tp = sx2*r2 + sy2*r4;
distorted = (x + dx_tang + dx_tp, y + dy_tang + dy_tp)   // NOT uu+delta — tangential is on the radially-distorted x,y
```
Inverse: reuse the existing 2D-Newton `fisheyeRemoveDistortion2D` then `NormalFromFisheye`. **Verify the p1/p2 mapping with the round-trip test** — this is the transcription-risky one.

---

## Task 1: Add `projectionClass` to the descriptor + classify all models

**Files:** Modify `src/utils/cameraModelRegistry.ts`; Test `src/utils/cameraModelRegistry.test.ts`.
**Interfaces:** Produces `type ProjectionClass`; `CameraModelDescriptor.projectionClass`; `getCameraModelProjectionClass(id): ProjectionClass`.

- [ ] Step 1 — failing test: assert `getCameraModelProjectionClass(id)` returns the mapping-table value for a spot set (PINHOLE→'none', OPENCV→'perspective-radial', FOV→'fov', OPENCV_FISHEYE→'fisheye', RAD_TAN_THIN_PRISM_FISHEYE→'fisheye', SIMPLE_DIVISION→'division', DIVISION→'division', EUCM→'eucm', EQUIRECTANGULAR→'spherical'), and that EVERY `CameraModelId` has a defined projectionClass.
- [ ] Step 2 — run, see it fail.
- [ ] Step 3 — add `projectionClass` to the `CameraModelDescriptor` interface and to every entry in `CAMERA_MODEL_DESCRIPTORS` (the exhaustive `Record` forces completeness), per the mapping table. Export `type ProjectionClass` and `getCameraModelProjectionClass`.
- [ ] Step 4 — green. Step 5 — `npm run build` + lint. Step 6 — commit `feat(cameras): add projectionClass axis to the camera-model registry`.

---

## Task 2: Consolidate `CameraIntrinsics` + add EUCM/DIVISION fields

**Files:** Modify `src/types/colmap.ts` (`CameraIntrinsics`), `src/utils/cameraIntrinsics.ts` (`INTRINSIC_PARAM_SETTERS`), `src/shaders/undistortion.ts` (delete its duplicate `CameraIntrinsics` decl, import type-only). Test `src/utils/cameraIntrinsics.test.ts`.

- [ ] Step 1 — failing test: `getCameraIntrinsics` on an EUCM camera `params:[fx,fy,cx,cy,0.6,1.1]` yields `alpha===0.6, beta===1.1`; on a DIVISION camera `params:[fx,fy,cx,cy,-0.05]` yields `kDiv===-0.05`; existing models still yield their fields (unchanged).
- [ ] Step 2 — run, see it fail. Step 3 — add `alpha`, `beta`, `kDiv` (all `number`, default 0) to the single `CameraIntrinsics` in `types/colmap.ts`; delete the duplicate declaration in `shaders/undistortion.ts` and `import type { CameraIntrinsics }` from `../types/colmap`; add setters to `INTRINSIC_PARAM_SETTERS`: `alpha→alpha`, `beta→beta`, and map the DIVISION param name `k`→`kDiv` (verify the registry paramNames for DIVISION/SIMPLE_DIVISION are `['…','k']`, and that `k` isn't already mapped to `k1` — if the generic extractor maps bare `k`→k1 for SIMPLE_RADIAL, keep that; DIVISION's `k` must go to `kDiv`. If one name can't map to two fields, disambiguate by giving DIVISION's registry paramName a distinct token like `k` handled via projectionClass, OR add a dedicated setter path — resolve and note it).
- [ ] Step 4 — green (existing intrinsics tests unaffected). Step 5 — build + lint. Step 6 — commit `refactor(cameras): single CameraIntrinsics decl + alpha/beta/kDiv fields`.

> Note on `k`→field ambiguity: SIMPLE_RADIAL/etc. use paramName `k`→k1; DIVISION uses paramName `k`→kDiv. Since the generic name→field map can't route one token two ways, route by projectionClass in `getCameraIntrinsics` (division models → their `k` sets `kDiv`), or rename DIVISION's descriptor paramName. Pick the cleaner one and keep existing-model behavior identical (characterization tests must stay green).

---

## Task 3: Refactor `cameraUndistortion.ts` to a projectionClass strategy table (behavior-preserving)

**Files:** Modify `src/utils/cameraUndistortion.ts`; Test `src/utils/cameraUndistortion.test.ts`.
**Interfaces:** Produces `interface DistortionStrategy { forward(p,i): Vec2; inverse(d,i): UndistortResult }`; `DISTORTION_STRATEGIES: Record<ProjectionClass, DistortionStrategy>`. `distortNormalized`/`undistortNormalized` keep their signatures but dispatch by `getCameraModelProjectionClass(modelId)`.

- [ ] Step 1 — **characterization tests first**: for models 0–10, forward+inverse round-trip (`undistort(distort(p))≈p`) at several points, and spot-checks of `distortNormalized` outputs, asserting the CURRENT numeric behavior. Run GREEN against the current implementation (this is the parity net for the refactor). If any fails, STOP — the expectations disagree with current behavior.
- [ ] Step 2 — refactor: introduce `DISTORTION_STRATEGIES` keyed by ProjectionClass. `none`→identity; `perspective-radial`→the existing perspective delta/Newton (unify the 4 models into the FULL_OPENCV rational radial + tangential form — with zero coeffs it reduces exactly to SIMPLE_RADIAL/RADIAL/OPENCV, so this is behavior-preserving); `fov`→existing FOV; `fisheye`→existing fisheye forward/inverse (still covering the current 4 fisheye models). `distortNormalized`/`undistortNormalized` become `DISTORTION_STRATEGIES[getCameraModelProjectionClass(modelId)].forward/inverse(p,i)`. Remove `isPerspectiveRadial`/`isFisheye`/model-id switches (superseded by projectionClass).
- [ ] Step 3 — run the characterization tests + full suite GREEN (parity preserved). Step 4 — build + lint. Step 5 — commit `refactor(cameras): dispatch distortion by projectionClass strategy table`.

---

## Task 4: Collapse `splatPsnrMetric` distortion → delegate to canonical

**Files:** Modify `src/components/viewer3d/splatPsnrMetric.ts`; Test alongside.

- [ ] Step 1 — failing/char test: export the pixel-mapping (or test via the public entry) and assert the distortion path equals `distortNormalized` from `cameraUndistortion.ts` for a spot set incl. OPENCV (with k1,k2,p1,p2) — currently its private `applyDistortion:550` is a separate copy.
- [ ] Step 2 — delete `splatPsnrMetric.applyDistortion`; call `distortNormalized(...)` from `cameraUndistortion.ts` (convert to/from pixel space as it already does). Preserve pinhole behavior.
- [ ] Step 3 — full suite green (existing PSNR tests unaffected). Step 4 — build+lint. Step 5 — commit `refactor(psnr): delegate distortion to the canonical cameraUndistortion`.

---

## Task 5: Collapse `cameraModelProjection.ts` → delegate to canonical

**Files:** Modify `src/utils/cameraModelProjection.ts`; Test `src/utils/cameraModelProjection.test.ts` (or its callers' tests).

- [ ] Step 1 — failing test: a THIN_PRISM_FISHEYE (or OPENCV with p1,p2) round-trip through `projectPoint`/`unprojectPoint` currently drops p1/p2/sx1/sy1 → shows ~0 error even with `p1=5e-3`; assert the corrected behavior (measurable pre-fix, `<1e-6` post-fix) by delegating to the canonical.
- [ ] Step 2 — replace the local per-model distortion math in `projectPoint`/`unprojectPoint` with calls to the canonical `distortNormalized`/`undistortNormalized`; keep the projection scaffolding.
- [ ] Step 3 — green; the conversion-validation utility now uses correct math. Step 4 — build+lint. Step 5 — commit `refactor(cameras): conversion projection delegates to canonical distortion`.

---

## Task 6: Fix the model-11 live bug (RAD_TAN_THIN_PRISM_FISHEYE)

**Files:** Modify `src/utils/cameraUndistortion.ts` (fisheye strategy) + `src/shaders/undistortion.ts` (GLSL). Test `cameraUndistortion.test.ts`.

- [ ] Step 1 — failing round-trip test: RAD_TAN_THIN_PRISM_FISHEYE with representative 16 params, `undistort(distort(p))≈p` within tol, and `distort` ≠ identity (currently it IS identity → RED).
- [ ] Step 2 — extend the `fisheye` strategy's angle-space distortion to handle RAD_TAN per the COLMAP formula above (6 radial coeffs; tangential on the radially-distorted x,y with the p1/p2 mapping; 4 prism terms sx1,sy1,sx2,sy2). Reuse `fisheyeRemoveDistortion2D` for the inverse. Then add the model to the GLSL: **read `shaders/undistortion.ts`**, add its constant + the same distortion branch in the fragment `applyDistortion` and the vertex `inverseDistort`.
- [ ] Step 3 — green (TS round-trip). Step 4 — full suite + build + lint. Step 5 — commit `fix(cameras): implement RAD_TAN_THIN_PRISM_FISHEYE distortion (CPU + GLSL)`.

---

## Task 7: Add DIVISION / SIMPLE_DIVISION distortion

**Files:** `src/utils/cameraUndistortion.ts` (new `division` strategy) + `src/shaders/undistortion.ts`. Test `cameraUndistortion.test.ts`.

- [ ] Step 1 — failing round-trip test: DIVISION `kDiv=-0.05` and SIMPLE_DIVISION, `undistort(distort(p))≈p`, and `undistort(m)=m/(1+kDiv·|m|²)` at a known point.
- [ ] Step 2 — add the `division` strategy (closed-form forward/inverse from the formulas above; guard `disc2<0`). Add the GLSL constant + `division` branch (forward + inverse) in both shaders, using the `kDiv` uniform (add it — Task 8 also adds alpha/beta uniforms; coordinate).
- [ ] Step 3 — green. Step 4 — build+lint. Step 5 — commit `feat(cameras): DIVISION/SIMPLE_DIVISION distortion (CPU + GLSL)`.

---

## Task 8: Add EUCM distortion

**Files:** `src/utils/cameraUndistortion.ts` (`eucm` strategy) + `src/shaders/undistortion.ts` + `src/components/viewer3d/UndistortedImageMaterial.tsx` (alpha/beta/kDiv uniforms). Test `cameraUndistortion.test.ts`.

- [ ] Step 1 — failing round-trip test: EUCM `alpha=0.6, beta=1.1`, `undistort(distort(p))≈p`; `inverse` returns `valid:false` past the model FOV (radicand<0).
- [ ] Step 2 — add the `eucm` strategy (closed form from the formulas above). Add GLSL constant + `eucm` branch (both shaders) using `alpha`/`beta` uniforms; wire `alpha`,`beta`,`kDiv` uniforms in `UndistortedImageMaterial.tsx` (they push every intrinsic field — add these three).
- [ ] Step 3 — green. Step 4 — build+lint. Step 5 — commit `feat(cameras): EUCM distortion (CPU + GLSL)`.

---

## Task 9: Classify SIMPLE_FISHEYE / FISHEYE + verify (near-free)

**Files:** Test only (they're already `projectionClass:'fisheye'` from Task 1); `cameraUndistortion.test.ts`.

- [ ] Step 1 — round-trip test: SIMPLE_FISHEYE (`f,cx,cy`) and FISHEYE (`fx,fy,cx,cy`) — pure equidistant fisheye (zero poly coeffs), `undistort(distort(p))≈p`. Confirm the existing fisheye strategy handles them with zero coeffs (should pass without new math). If a GLSL constant is missing for 14/15, add it (they use the same fisheye branch).
- [ ] Step 2 — green. Step 3 — build+lint. Step 4 — commit `test(cameras): verify SIMPLE_FISHEYE/FISHEYE via the fisheye strategy`.

---

## Task 10: Contract tests — structural exhaustiveness + numerical CPU↔GLSL parity

**Files:** Create `src/shaders/undistortionParity.test.ts` (+ small exported `glslForwardReference`/`glslInverseReference` TS transcriptions in `shaders/undistortion.ts`, paired with the GLSL and commented "edit together").

- [ ] Step 1 — **structural exhaustiveness** test: parse the GLSL strings for `const int <NAME> = <N>` and assert each equals `CameraModelId[NAME]`; assert every `CameraModelId` whose `projectionClass` is not `none`/`spherical` appears in a non-`default` branch of the fragment `applyDistortion` and vertex `inverseDistort` (regex/marker scan); assert `DISTORTION_STRATEGIES` has an entry for every `ProjectionClass`. This would have caught model-11 (now green after Task 6).
- [ ] Step 2 — **numerical parity** test: for each projectionClass, over a grid of normalized points, assert `glslForwardReference`/`glslInverseReference` (the paired TS transcription of the GLSL math) match the canonical `DISTORTION_STRATEGIES` within `<1e-4`. (jsdom can't run real WebGL; the paired reference + the structural test + a manual GPU check is the pragmatic contract — document the residual risk that the reference is a transcription of the shader string.)
- [ ] Step 3 — both green. Step 4 — build + lint. Step 5 — commit `test(cameras): distortion exhaustiveness + CPU↔GLSL parity contract`.

---

## Task 11: Final verification + manual-check note

- [ ] Step 1 — `npm run test:run && npm run build && npm run lint` — all green.
- [ ] Step 2 — write a short `docs/` note (or PR description) listing the **manual GPU visual check** required: load reconstructions with (a) an OPENCV camera (regression — undistortion unchanged), (b) a EUCM and a DIVISION camera (new — undistorted image looks correct), (c) confirm the parity reference matches on screen. Commit `docs(cameras): distortion hardening manual-check checklist`.

---

## Self-Review

- **Spec coverage:** projectionClass (T1); CameraIntrinsics consolidation + alpha/beta/kDiv (T2); canonical strategy + 5→2 collapse (T3/T4/T5); model-11 fix (T6); DIVISION (T7); EUCM (T8); SIMPLE_FISHEYE/FISHEYE (T9); contract tests (T10); final (T11). ✔
- **Behavior preservation:** T3/T4/T5 are refactors gated by characterization round-trip tests written first. ✔
- **Placeholder scan:** the `k`→field ambiguity (T2) and the RAD_TAN p1/p2 mapping (T6) are called out explicitly with resolution guidance + a test guard, not left vague. GLSL edits reference the exact files/functions to read. ✔
- **Out of scope (separate):** WASM C++ (Plan 4); GLSL codegen; conversion-table re-basing on projectionClass.

## Notes for execution
- Sequence matters: T1→T2→T3 (foundation), then T4/T5 (collapses), then T6–T9 (math, each RED→GREEN), then T10 (locks the contract, green because all models wired), T11.
- Model tiers: T1/T2/T9/T11 cheap (transcription/tests); T3/T6/T7/T8/T10 standard (math + GLSL judgment); T4/T5 standard (delegation with parity care).
