# Review-Findings Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every actionable finding from the 4-lane max-effort review of COLMAP 4.1 camera support, and bring the spherical-rendering branch to "ready for the user's visual check" — fixing the text-export corruption, the invisible-photosphere fly-to, the stale UI mirrors, the math guards, and the silent UX gaps.

**Architecture:** Two phases. **Phase 1** (`fix/review-findings`, branched off `main`@fdf7781): all main-side fixes (T1–T6), then merge to `main`. **Phase 2** (on `feature/spherical-camera-rendering`): merge updated `main` into the branch (T7), then branch-side fixes (T8–T11), final review + visual-check guide (T12). The spherical branch stays UNMERGED at the end — the user's panorama-orientation eyeball remains the gate.

**Tech Stack:** TypeScript + Vitest (jsdom), React Three Fiber / three.js, Zustand. No WASM rebuild needed (no C++ changes in scope).

## Global Constraints

- **Recompute every numeric constant in this plan independently before asserting it** (via `node -e` or `uv run python`). Twice in this project the plan's own worked values were wrong and the implementer's independent recomputation caught it. If your value differs from the plan's, trust your derivation, document the discrepancy in a comment, and use yours.
- **Independent oracles for math changes:** any new/changed distortion math (T2) gets expected values hand-derived from the formula, never read back from the implementation.
- **Registry is the single source of truth** (`src/utils/cameraModelRegistry.ts`): UI labels, param counts, families all derive from it. No new hardcoded model tables anywhere.
- **Do not weaken existing tests.** The parity/exhaustiveness contract (`undistortionParity.test.ts`), the oracles (`cameraModelOracles.test.ts`), and the WASM contract (`wasmParamParity.test.ts`) stay green and un-loosened.
- **Read before you write:** every task starts by reading the exact current code; function names/signatures in this plan are best-effort and MUST be confirmed against the file.
- Each task: TDD (failing test → fix → green), then run the touched test files, then commit. Suite/build/lint must be green at each phase boundary.
- Behavior-preserving for everything not named in a finding.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- The spherical feature branch is NOT merged to `main` in this plan (user visual-check gate).

---

## PHASE 1 — main-side fixes (branch `fix/review-findings` off main@fdf7781)

### Task 1: Fix `formatDouble` scientific-notation corruption + writer round-trip tests

**Files:**
- Modify: `src/parsers/colmapWriterUtils.ts` (line ~13)
- Test: extend the existing writer/util test files (find them: `colmapWriterUtils.test.ts` / `colmapTextWriters.test.ts`; create `src/parsers/colmapRoundTrip.test.ts` if no round-trip test exists)

**The bug (verified):** `value.toPrecision(17).replace(/\.?0+$/, '')` strips the trailing `0` of exponents: `5e-10` → `"5.0000000000000003e-1"` (reparses 0.5, ×10⁹ wrong); `1e20` → `"1.0000000000000000e+2"` (reparses 100). Camera params, quaternions, and point coords all flow through this in text export.

- [ ] **Step 1: Failing tests.** In the writer-utils test file:

```ts
// Exact round-trip: toPrecision(17) is lossless for float64, so equality is exact.
const CASES = [5e-10, 1.23e-10, 2.5e-9, 1e20, 2.5e20, -3.7e-10, 0.5, 50, -0.125, Math.PI, 1e-300, 0];
it.each(CASES)('formatDouble round-trips %s exactly', (v) => {
  expect(parseFloat(formatDouble(v))).toBe(v);
});
it('does not strip exponent digits', () => {
  expect(parseFloat(formatDouble(5e-10))).toBe(5e-10);   // was 0.5 before the fix
});
```
Run → the sci-notation cases FAIL on current code (verify at least `5e-10` and `1e20` fail).

- [ ] **Step 2: Fix.** Strip trailing zeros in the mantissa only:

```ts
export function formatDouble(value: number): string {
  const str = value.toPrecision(17);
  const [mantissa, exponent] = str.split(/e/i);
  const trimmed = mantissa.replace(/\.?0+$/, '');
  return exponent !== undefined ? `${trimmed}e${exponent}` : trimmed;
}
```
(Confirm the current function body first; preserve its exported name/signature and any doc comment, updating the comment to state the exponent-safety constraint.)

- [ ] **Step 3: Round-trip test for models 11–17.** parse→write→parse (BOTH text and binary writers) for a synthetic reconstruction containing one camera of each model id 11–17 with realistic params including a tiny coefficient (e.g. model 11 with `k6 = 5e-10`, `sx2 = -3.7e-10`) — assert re-parsed `params` arrays equal the originals element-for-element (`toBe` for binary; `toBe` after the fix for text too, since toPrecision(17) is lossless). Use the existing builders (`src/test/builders/colmapBuilders.ts`) and the real `parseCamerasText/Binary` + `writeCamerasText/Binary` (confirm exact names in `src/parsers/`).
- [ ] **Step 4: Run** the touched test files → PASS. Also run `npm run test:run -- src/parsers` to catch collateral.
- [ ] **Step 5: Commit** `fix(export): formatDouble no longer corrupts scientific-notation exponents`.

### Task 2: Domain guards — division-model inverse + EUCM NaN boundary (CPU + GLSL + transcriptions)

**Files:**
- Modify: `src/utils/cameraUndistortion.ts` (division inverse ~L384; EUCM inverse ~L421)
- Modify: `src/shaders/undistortion.ts` (division + EUCM inverse branches in the vertex `inverseDistort` GLSL, and the TS `glslInverseReference` transcription)
- Test: `src/utils/cameraUndistortion.test.ts`, `src/utils/cameraModelOracles.test.ts` (add boundary cases), `src/shaders/undistortionParity.test.ts` (keep parity green with the new guards)

**The bugs (verified by lane probe):** (a) division inverse `denom = 1 + kDiv·r²` returns Inf/sign-flipped coords with `valid:true` when `denom ≤ 0` — reachable inside the frame for strong barrel (e.g. `kDiv=-2.5` ⇒ horizon at `r_d = 1/√2.5 ≈ 0.632`); siblings EUCM/FOV return `valid:false` at their domain edges. (b) EUCM inverse at `alpha=1, beta=1, |m|=1`: radicand=0 passes the `<0` guard, `helperDen=0` ⇒ `helper=0/0=NaN`, and `helper <= 0` is false for NaN ⇒ returns `{NaN, valid:true}`.

- [ ] **Step 1: Read first.** Read both inverse strategies and the GLSL branches; note the exact invalid-return convention the EUCM/FOV strategies use (what x/y they return with `valid:false`) and mirror it.
- [ ] **Step 2: Failing tests (hand-derived).**

```ts
// DIVISION horizon: kDiv=-2.5 ⇒ denom = 1 - 2.5·r_d². At r_d=0.7 (x=0.7,y=0): denom = 1-1.225 = -0.225 → must be invalid.
// At r_d=0.6: denom = 1-0.9 = 0.1 → valid, u = 0.6/0.1 = 6.0 (finite, hand-check).
// At exact horizon r_d = 1/√2.5: denom = 0 → invalid (recompute 1/√2.5 ≈ 0.6324555 yourself).
// EUCM: alpha=1, beta=1, m=(1,0) → must return valid:false, no NaN.
```
Assert the pre-fix behavior fails (division: `valid===true` with non-finite/huge output; EUCM: `Number.isNaN(x)` with `valid===true`).

- [ ] **Step 3: Fix CPU.** Division inverse: `if (denom <= 0) return { …invalid-convention…, valid: false };`. EUCM: make the rejection NaN-safe — replace the `helper <= 0` guard with `!(helper > 0)` (rejects NaN, 0, and negatives) or guard `helperDen` near zero explicitly; match whichever reads cleaner against the existing code, with a comment stating the NaN case it closes.
- [ ] **Step 4: Fix GLSL + transcription.** Mirror both guards in the vertex-shader `inverseDistort` division/EUCM branches (set the shader's invalid flag exactly as the EUCM branch does today) and update `glslInverseReference` so parity stays exact. Run `undistortionParity.test.ts` → green.
- [ ] **Step 5: Run** all touched test files → PASS (including the untouched forward oracles).
- [ ] **Step 6: Commit** `fix(cameras): domain guards for division inverse horizon + EUCM NaN boundary`.

### Task 3: Registry-driven exhaustiveness test for `INTRINSIC_PARAM_SETTERS`

**Files:**
- Test: `src/utils/cameraIntrinsics.test.ts` (extend)
- Modify (only if the test exposes a real hole): `src/utils/cameraIntrinsics.ts`

**The gap:** the setters map is convention-keyed off registry `paramNames`; an unmatched name is silently skipped (`cameraIntrinsics.ts:69`) — the last silent TS extension edge.

- [ ] **Step 1: Read** `cameraIntrinsics.ts` to confirm which names are deliberately special-cased (`k` routes by projectionClass) or deliberately unused (`w`, `h` for spherical). That set is the documented exception list.
- [ ] **Step 2: Test.**

```ts
const SETTER_EXCEPTIONS = new Set(['k', 'w', 'h']);  // k: routed by projectionClass; w/h: spherical, unused
it('every registry param name has a setter or a documented exception', () => {
  for (const d of Object.values(CAMERA_MODEL_DESCRIPTORS)) {
    for (const name of d.paramNames) {
      if (SETTER_EXCEPTIONS.has(name)) continue;
      expect(INTRINSIC_PARAM_SETTERS[name], `missing setter for "${name}" (model ${d.colmapName})`).toBeDefined();
    }
  }
});
// Behavioral pin of the 'k' special case:
//   SIMPLE_RADIAL  k=0.1 → intrinsics.k1 === 0.1
//   SIMPLE_DIVISION k=0.1 → intrinsics.kDiv === 0.1 (and k1 === 0)
```
(Export `INTRINSIC_PARAM_SETTERS` for the test if not already exported — export-only change.) Run → expect PASS on current code (all 18 models are wired today); the test's value is trapping FUTURE additions. If it FAILS, a real hole exists — fix the setter and report it prominently.
- [ ] **Step 3: Commit** `test(cameras): registry-driven exhaustiveness for intrinsic param setters`.

### Task 4: Registry-driven param labels in the image-detail modal + Data-panel Focal guard

**Files:**
- Modify: `src/components/modals/imageDetailCameraPoseViewModel.ts` (delete `CAMERA_PARAM_NAMES`, lines 3–15)
- Modify: the data-panel view model (`dataPanelViewModel.ts:53` area — locate exactly)
- Test: `imageDetailCameraPoseViewModel.test.ts`, the data-panel view-model test file

**The bugs (verified):** (a) a hardcoded 0–10 param-name table shadows the registry — EUCM shows `p4/p5` instead of `alpha/beta`, models 11–17 all fall back to `p0…pN`; it also disagrees with the registry on `omega` vs `ω`. (b) The data panel renders `camera.params[0]` as "Focal" — for EQUIRECTANGULAR that's the panorama **width**.

- [ ] **Step 1: Failing tests.** (a) Model-16 (EUCM) display names are `['fx','fy','cx','cy','alpha','beta']`; model 11 gets its 16 real names; model 17 gets `['w','h']`; unknown model 99 keeps the `p0…` fallback. (b) Data-panel row for an EQUIRECTANGULAR camera shows a non-numeric placeholder (e.g. `'—'`) for focal; a PINHOLE row still shows `params[0].toFixed(2)`.
- [ ] **Step 2: Fix (a).** Replace the table with the registry:

```ts
import { CAMERA_MODEL_DESCRIPTORS, getCameraModelParamNames } from '../../utils/cameraModelRegistry';
const paramNames: readonly string[] =
  modelId in CAMERA_MODEL_DESCRIPTORS ? getCameraModelParamNames(modelId) : [];
// keep the existing `paramNames[index] || `p${index}`` fallback for unknown ids
```
(Adapt to the file's actual shape; keep its existing exported interface unchanged. NOTE for the Phase-2 merge: the spherical branch also edits this file — Phase 1 changes ONLY the label source, nothing else, to keep that merge small.)
- [ ] **Step 3: Fix (b).** Gate on the registry: `cameraModelHasPinholeIntrinsics(camera.modelId) ? camera.params[0]?.toFixed(2) : '—'` (confirm the field's type/consumers; if the view model returns numbers, return `null`/undefined and let the component render the dash — follow the file's conventions).
- [ ] **Step 4: Run** both test files → PASS. Grep for any other consumer of the deleted `CAMERA_PARAM_NAMES` (must be none).
- [ ] **Step 5: Commit** `fix(ui): registry-driven camera param labels + spherical-safe Focal column`.

### Task 5: Surface text-parser camera skips to the user

**Files:**
- Modify: `src/parsers/cameras.ts` (the `parseCamerasText` unknown-model `continue` at ~L81)
- Modify: the load workflow that calls it (locate via grep: `parseCamerasText` call sites — likely `fileDropzoneWorkflow` / a loader action) + `notificationStore` usage there
- Test: `src/parsers/cameras.test.ts` + the workflow/action test file

**The gap:** unknown model names in cameras.txt are skipped with only a console warn (`appLogger.warn(...); continue;`) — the camera and its images vanish silently, while the binary path hard-fails visibly. Chosen behavior: **keep the skip (partial loads stay useful) but notify.**

- [ ] **Step 1: Read** `parseCamerasText`'s signature and ALL call sites before choosing the plumbing. Prefer the least-ripple mechanism: if it already returns an object, add `skippedCameras: { line: number; modelName: string }[]`; if it returns a bare map, add an optional `onSkip` callback or a second return via an options object. Do not break existing callers.
- [ ] **Step 2: Failing tests.** Parser-level: a cameras.txt with one PINHOLE and one `FUTURE_MODEL_X` yields 1 camera + a skip record naming `FUTURE_MODEL_X`. Workflow-level: loading such a file produces a notification (assert via the notification store) whose message contains the model name and count; loading a fully-valid file produces none.
- [ ] **Step 3: Implement.** Thread the skip info to the workflow; emit ONE aggregate notification: `Skipped N camera(s) with unsupported model(s): FUTURE_MODEL_X` (match the store's existing severity/API — likely `warning`).
- [ ] **Step 4: Run** touched tests → PASS.
- [ ] **Step 5: Commit** `fix(loading): surface skipped unknown-model cameras as a notification`.

### Task 6: Hygiene sweep — stale WASM TS mirror, duplicate predicates, stale docs/comments

**Files:**
- Modify: `src/wasm/types.ts` (delete the stale `CameraModelId` const at ~L43–55; retype `getNumCameraParams` at ~L225), `src/wasm/index.ts` (barrel — verify), `src/wasm/wasmParamParity.test.ts` (drop the `as any` if the retype allows)
- Modify: `src/utils/cameraModelPolicy.ts` (re-export registry predicates instead of redefining `isSphericalCameraModel` ~L18 and `getCameraModelColmapName` ~L78)
- Modify: `README.md` (~L27, L109), `src/shaders/undistortion.ts` (~L7 comment)
- Test: existing suites must stay green; no new tests required beyond compilation

- [ ] **Step 1: WASM types.** Delete the stale 0–10 `CameraModelId` const (grep first: confirm zero value-imports; type-only usages get replaced). Retype `getNumCameraParams(modelId: unknown): number` — or a minimal `EmbindEnumValue` type — with a doc comment: *"Pass `module.CameraModelId.<NAME>` (the embind enum object). Raw integers are silently misinterpreted by embind."* Update `wasmParamParity.test.ts` to drop its `as any` if now type-clean. Run `npm run test:run -- src/wasm/wasmParamParity.test.ts` → 18/18.
- [ ] **Step 2: Policy dedupe.** In `cameraModelPolicy.ts`, replace the local `isSphericalCameraModel`/`getCameraModelColmapName` bodies with re-exports (or thin delegations) of the registry's — PRESERVING the policy version's observable behavior; if its `getCameraModelColmapName` has a different unknown-id fallback (`Unknown(${id})`), keep that behavior in the delegation and note it. Run the policy/registry test files.
- [ ] **Step 3: Docs.** README: "all 11" → all 18 COLMAP camera models (ids 0–17); add the 4.1 models to the list; caveat that EQUIRECTANGULAR renders as a photosphere (no planar undistortion) and the new distortion models (11–16) render image previews in cropped mode. `shaders/undistortion.ts:7`: update the "Implements all 11…" comment to the real count/coverage wording.
- [ ] **Step 4: Run** `npm run build && npm run lint` (type-level changes!) + the wasm/policy/registry test files → clean.
- [ ] **Step 5: Commit** `chore: remove stale WASM enum mirror, dedupe predicates, update model-count docs`.

### Phase-1 finish (controller)
- [ ] Full `npm run test:run` + `npm run build` + `npm run lint` green on `fix/review-findings`.
- [ ] Final review of the phase diff (opus) — Critical/Important findings fixed before merge.
- [ ] Merge `fix/review-findings` → `main` (ff or merge commit), re-run suite on main, delete the fix branch. (Local only; nothing pushed.)

---

## PHASE 2 — spherical-branch fixes (on `feature/spherical-camera-rendering`)

### Task 7 (controller): Merge updated `main` into the branch

- [ ] `git checkout feature/spherical-camera-rendering && git merge main`. Expected conflicts (small): `.gitignore` (union), `src/components/viewer3d/UndistortedImageMaterial.tsx` (keep both sides: hardening uniforms + branch guards), `src/components/modals/imageDetailCameraPoseViewModel.ts` (combine T4's registry-driven labels WITH the branch's spherical-omission guard — spherical cameras omit params entirely per the branch; other models use registry names).
- [ ] Full suite on the branch → green (expect ~2721+ tests: main's 2702 + the branch's own additions + Phase 1's new ones). Build + lint clean. Commit the merge.

### Task 8: Spherical-aware fly-to (outside-stop) + partition fallback guard

**Files:**
- Modify: `src/components/viewer3d/useTrackballFlyTo.ts` (the `getImageWorldPose`→target function ~L129–159) and/or its caller `useCameraFrustumNavigationHandlers.ts`; `src/components/viewer3d/cameraFrustumViewModel.ts` (`getAutoAdjustedFov` spherical branch ~L112) — reconcile, don't duplicate
- Modify: `src/components/viewer3d/cameraFamilyPartition.ts` (unknown-id guard)
- Test: extract a pure helper and test it (`useTrackballFlyTo`-adjacent test file or a new `sphericalFlyTo.test.ts`); `cameraFamilyPartition.test.ts`

**The bug (verified):** fly-to places the viewer AT the image's camera center (`position: transformedPosition`); the photosphere is `FrontSide` (outward faces, per the approved outside-view design) → from the center every face is back-face-culled → selecting a 360 camera shows grid lines only, never the panorama. The FOV-fit already assumes an outside viewpoint. **Chosen fix: outside-stop** (design-conformant; do NOT switch to DoubleSide — inside view is the deferred immersive mode and would show a mirrored image).

- [ ] **Step 1: Read first.** `useTrackballFlyTo.ts` (how the target is computed and consumed — position/quaternion/target/distance), `useCameraFrustumNavigationHandlers.ts` (`flyToImage` path and where modelId is reachable), and `cameraFrustumViewModel.ts` `getAutoAdjustedFov`'s spherical branch — write down exactly what viewing distance its fit assumes before choosing constants.
- [ ] **Step 2: Extract a pure helper** (new or in the flyTo module):

```ts
// Spherical cameras: stop OUTSIDE the sphere, looking at its center.
// dir = from sphere center toward the current viewer (fallback +Z when degenerate);
// distance = SPHERICAL_FLYTO_DISTANCE_FACTOR * radius (radius = cameraScale).
export function computeSphericalFlyToPose(
  center: THREE.Vector3, currentViewerPos: THREE.Vector3, radius: number
): { position: THREE.Vector3; lookAt: THREE.Vector3 }
```
Pick `SPHERICAL_FLYTO_DISTANCE_FACTOR` to agree with the FOV fit (e.g. if the fit frames the sphere at distance D with fov `2·asin(radius/D)·(1/fill)`, choose the same D; if the existing fit assumes an inconsistent distance, FIX THE FIT to use this D — one source of truth, constant shared between both). Sensible default if unconstrained: 2.5 × radius (sphere subtends ~2·asin(0.4) ≈ 47°, comfortably framed — recompute yourself).
- [ ] **Step 3: Failing tests** for the helper: (a) position is exactly `distanceFactor·radius` from center; (b) direction preserved: `position` lies on the ray center→currentViewer; (c) degenerate current-at-center falls back deterministically (+Z); (d) lookAt === center. Plus a partition test: modelId 99 lands in the pinhole bucket (no throw).
- [ ] **Step 4: Wire it.** In the fly-to path, branch on `isSphericalCameraModel(camera.modelId)` (camera resolved from the image's `cameraId` via the reconstruction — follow how the view model already does this). Pinhole path byte-identical (assert via existing fly-to tests if present; add a characterization if not). Horizon-lock handling: keep the existing horizon-lock post-processing applied to the new pose.
- [ ] **Step 5: Partition guard.** `cameraFamilyPartition.ts`: out-of-registry ids go to the pinhole bucket (mirror the modal's `modelId in CAMERA_MODEL_DESCRIPTORS` guard) instead of throwing through `getCameraModelFamily`.
- [ ] **Step 6: Run** touched test files → PASS. **Step 7: Commit** `fix(viewer): fly-to stops outside spherical cameras; partition tolerates unknown models`.

### Task 9: PSNR spherical-exclusion notifications

**Files:**
- Modify: the PSNR compute trigger (follow `getRequestedSplatPsnrImageIds` callers — `splatPsnrImageIds.ts:27` and the action/store that starts a compute), `notificationStore` wiring
- Test: `splatPsnrImageIds.test.ts` + the action-level test file

- [ ] **Step 1: Read** the compute entry points (compute-all and compute-selected) and the notification store API.
- [ ] **Step 2: Failing tests.** (a) Compute-all on a mixed dataset (2 pinhole + 3 spherical) → one notification containing "3" and "spherical", and the compute proceeds over the 2. (b) Compute with a spherical camera selected → a notification explaining PSNR is unavailable for spherical cameras, and NO compute starts (today: silent no-op). (c) All-pinhole → no notification.
- [ ] **Step 3: Implement.** Compute the excluded count where the id list is built (the helper already knows); emit once per compute action, not per frame. Match existing notification severity conventions (info for partial exclusion, warning for the selected-spherical no-op).
- [ ] **Step 4: Run + commit** `fix(psnr): notify when spherical cameras are excluded from PSNR`.

### Task 10: Batch/cheapen spherical hit-targets

**Files:**
- Modify: `src/components/viewer3d/SphericalCameraHitTargets.tsx`
- Reference (pattern to mirror): the pinhole `BatchedPlaneHitTargets` (locate it; read its batching + raycast-to-imageId mapping)
- Test: view-model-level where feasible (id-mapping logic); rendering changes verified by the existing integration test + suite

**The problem:** one `mesh`+`SphereGeometry(cameraScale,16,12)`+material per camera — O(N) raycast targets, and the size slider recreates ALL geometries every tick because `cameraScale` is baked into constructor `args`.

- [ ] **Step 1 (mandatory):** ONE shared unit-sphere geometry (`SphereGeometry(1, 16, 12)`, memoized once) reused by all targets; per-target sizing via `scale={[cameraScale, cameraScale, cameraScale]}` — slider changes no longer construct geometry.
- [ ] **Step 2 (follow the repo pattern):** if `BatchedPlaneHitTargets` uses instancing/merged raycast, mirror that for the spheres (`InstancedMesh` with instanceId→imageId mapping); if the pattern doesn't transfer cleanly, keep per-mesh with the shared geometry and say so in the report — do not invent a novel batching scheme the repo doesn't use.
- [ ] **Step 3:** Preserve behavior: hover/click still resolve the correct imageId (test the mapping function); hit targets remain invisible; raycast layer/order unchanged.
- [ ] **Step 4: Run + commit** `perf(viewer): shared/batched spherical hit-target geometry`.

### Task 11: Grid-sphere standby/unselected opacity parity

**Files:**
- Modify: `src/components/viewer3d/sphericalCameraGeometry.ts` (baseAlphas ~L94), `src/components/viewer3d/SphericalCameraLines.tsx` (recolor effect ~L47–61)
- Reference: `BatchedFrustumLines.tsx` ~L146–151, 255 (how per-state alpha is computed from `frustumStandbyOpacity` / `unselectedCameraOpacity`)
- Test: `sphericalCameraGeometry.test.ts` (alpha values per selection state)

- [ ] **Step 1: Read** how `BatchedFrustumLines` derives per-camera alpha (selected vs unselected vs standby) and where those opacity settings live.
- [ ] **Step 2: Failing test:** with a selection active, unselected spherical cameras' alpha attribute equals `unselectedCameraOpacity` (and standby state matches `frustumStandbyOpacity`), selected stays 1.0 — mirror the pinhole behavior exactly.
- [ ] **Step 3: Implement** via the existing alpha-attribute plumbing (`markFatLineAlphasNeedUpdate` — confirm name), updating alphas in the same effect that recolors.
- [ ] **Step 4: Run + commit** `fix(viewer): spherical grids honor standby/unselected opacity`.

### Task 12 (controller + reviewer): Finish Phase 2

- [ ] Write `docs/spherical-visual-check.md` — the user's eyeball checklist: fly-to lands OUTSIDE with the sphere visible and framed; panorama upright (poles correct); azimuth/forward-axis plausible vs the reconstruction; NOT mirror-flipped (text/signage in the panorama reads correctly); seam location; colors match the flat pinhole previews; non-2:1 images stretch (known); immersive inside view deferred (seam documented in `Photosphere.tsx`); PSNR-exclusion notification appears on mixed datasets.
- [ ] Full `npm run test:run` + build + lint on the branch → green.
- [ ] Final whole-branch review (opus) of everything since the T7 merge commit; fix Critical/Important.
- [ ] Update the SDD ledger. **Leave `feature/spherical-camera-rendering` UNMERGED** — report to the user that it's ready for the visual check.

---

## Explicitly out of scope (accepted/deferred by prior decisions)
- Conversion-table `'not-implemented'` vs `'incompatible'` distinction (accepted design).
- EUCM wide-FOV `rendersFullFrameSafely` capability flag (watch item; no dataset has shown the failure).
- Immersive inside-the-sphere mode (user-deferred; seam exists).
- The manual GPU distortion check and the panorama-orientation eyeball (user-owned; T12 delivers the checklist).
- WASM/C++ changes (none needed).

## Self-Review
- Coverage: review findings High 1→T1, 2→T8, 3→T4; Medium division→T2, setters→T3, PSNR→T9, hit-targets→T10, docs→T6; Lows: focal→T4, alphas→T11, partition→T8, text-skip→T5, EUCM NaN→T2, wasm mirror + predicates + comments→T6, round-trip/test holes→T1/T2/T3. All accounted for; deferrals listed above.
- Constants to recompute independently: 1/√2.5, division denom values, fly-to factor geometry. Marked in tasks.
- Interface consistency: `computeSphericalFlyToPose` named once (T8); exception set `{k,w,h}` (T3) matches T4's registry usage; no cross-task type drift found.
