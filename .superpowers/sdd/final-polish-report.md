# Final Polish Report — Spherical Intrinsics-Consumer Guards

## Fix 1 — Guard `src/splat/webgpu/cameraFrames.ts`

`assertPinholeCamera` in `psnrSplatSession.ts` is **not exported** (local function, no `export` keyword), so the predicate approach was used.

Added import of `cameraModelHasPinholeIntrinsics` from `../../utils/cameraModelRegistry` and inserted the guard at the top of `createColmapMetricThreeCamera` before `getCameraIntrinsics`:

```ts
if (!cameraModelHasPinholeIntrinsics(camera.modelId)) {
  throw new Error(`createColmapMetricThreeCamera requires a pinhole camera (got model ${camera.modelId})`);
}
```

**Decision: used `cameraModelHasPinholeIntrinsics` predicate** (assertPinholeCamera not cleanly importable).

## Fix 2 — Document Routing Invariant in `src/components/viewer3d/UndistortedImageMaterial.tsx`

Added the specified comment block immediately before the `// Extract camera intrinsics` comment and `getCameraIntrinsics` call (~line 57), explaining that only pinhole-family cameras reach this material and how to guard a future path that might route spherical cameras here. No behavior change.

## Fix 3 — Fix Inverted `side` JSDoc in `src/components/viewer3d/Photosphere.tsx`

The original comment incorrectly stated:
- `THREE.FrontSide` = visible from inside (immersive mode)
- `THREE.BackSide` = outside-in viewing

Corrected to:
- `THREE.FrontSide` = outward faces, visible from OUTSIDE (current object view, default/correct)
- `THREE.BackSide` = inner faces, visible from INSIDE (future immersive "enter the sphere" mode)

No code or defaults changed.

## Fix 4 — Gate Spherical-Layer Mount in `src/components/viewer3d/CameraFrustums.tsx`

Changed `sphericalLayer` from an unconditional JSX fragment to a conditional:

```ts
const sphericalLayer = sphericalFrustums.length > 0 ? (
  <>
    <SphericalCameraLines ... />
    <SphericalCameraHitTargets ... />
  </>
) : null;
```

The variable is still referenced in all three display modes (arrow, imageplane, frustum), so all modes skip the spherical geometry when there are no spherical cameras. Comment updated to document intent.

## Fix 5 — Value-Level Pose Assertion in `src/components/modals/imageDetailCameraPoseViewModel.test.ts`

The spherical fixture uses `qvec=[0.5, 0.5, 0.5, 0.5]`, `tvec=[1.0, -2.0, 3.0]`.

`buildCameraPoseDisplayModel` maps rotation as `[qvec[1], qvec[2], qvec[3], qvec[0]]` formatted to 3dp, and translation as `tvec` formatted to 2dp.

Replaced the two length-only assertions (`toHaveLength`) with full `toEqual` assertions:

- `rotation`: four entries, all `{ className: 'text-ds-primary', value: '0.500', isNegative: false }`
- `translation`: `1.00` (primary), `-2.00` (error/negative), `3.00` (primary)

## Test + Build + Lint Results

- **Tests**: 2626 passed, 5 skipped, 0 failed (438 test files)
- **Build**: Clean, `✓ built in 6.56s`
- **Lint**: Clean (no output, exit 0)

## Commit SHA

See git log for the commit created after this report.
