# Spherical Camera Rendering — Design Spec

**Date:** 2026-07-01
**Status:** approved (brainstorm), pending spec review
**Predecessor:** the extensible camera-model registry (2026-06-30 plan) landed spherical `EQUIRECTANGULAR` (id 17) support at the data/parse/classify/intrinsics layer; spherical cameras currently render as a zero-size placeholder.

## Purpose

Give spherical (equirectangular / 360) cameras a real 3D representation in the viewer, and stop the pinhole-specific display paths from misfiring on them. Every spherical camera renders as a **lat/long grid sphere**; the **selected** spherical camera additionally shows its **photosphere** (the panorama textured onto the sphere, viewed from outside). This replaces the placeholder and closes the "ungated `getCameraIntrinsics` consumers" gap the Plan-1 final review flagged.

## Scope

**In:**
- Grid-sphere rendering for every spherical camera (batched, pose-placed, radius = existing `cameraScale`).
- Photosphere (equirect image on the sphere's outer surface) for the **selected** spherical camera only, shown **automatically on selection** (reusing the existing "selected camera shows its image" behavior).
- **Mixed datasets:** reconstructions with both pinhole and spherical cameras. Each camera renders per its family; selection routes per family. Both render paths coexist in one scene.
- Gate off pinhole-only paths for spherical: the flat textured plane, the "Scroll: FOV" / "(U) undistort" hover hints, and the pinhole fly-to fit.
- Correctness cleanup: exclude spherical cameras from the PSNR metric; guard the remaining `getCameraIntrinsics` consumers so they never compute with the dummy `fx=1`.
- Tests: grid-sphere geometry builder, spherical/pinhole routing policy, gating, and an end-to-end EQUIRECTANGULAR load test.

**Out (future / built as a seam):**
- Immersive "enter the sphere" 360 view (viewport at sphere center, texture on `BackSide`). The `Photosphere` component is parameterized by `side`/pose/radius so this is additive later — no rework.
- Photosphere for *unselected* spherical cameras (deliberately selected-only, for performance).
- EUCM/DIVISION in-shader undistortion (Plan 3) and the C++/WASM recompile (Plan 4).

## Design

### Camera-family routing (mixed datasets)

Cameras are partitioned by the Plan-1 registry helpers (`isSphericalCameraModel` / `getCameraModelFamily`):
- **pinhole & fisheye** → existing frustum wireframe + (when selected) flat textured image plane. Unchanged.
- **spherical** → new grid sphere + (when selected) photosphere.

Both sets render simultaneously. The frustum item builder **excludes** spherical cameras (today they fall through to `invalidPlaneSize` = zero-size; instead they are routed to the sphere builder), and the sphere builder **includes only** spherical cameras. The selected-camera layer branches on family to pick the flat plane or the photosphere.

### 1. Grid sphere — all spherical cameras

New module `src/components/viewer3d/sphericalCameraGeometry.ts`, a sibling of `cameraFrustumGeometry.ts` and mirroring its contract:

- `buildSphereLineGeometryData(items, cameraScale, opts)` returns one batched `{ positions: Float32Array, baseColors: Float32Array, baseAlphas: Float32Array }` covering **all** spherical cameras — same batched approach as `buildFrustumLineGeometryData` (one geometry, not one object per camera), so perf scales like the frustums.
- Each sphere = `MERIDIANS` longitude circles + `PARALLELS` latitude circles as line segments; radius = `cameraScale`; centered at the camera's world position (`getImageWorldPose`) and oriented by its world quaternion so the poles + seam convey the camera's facing. `MERIDIANS`/`PARALLELS` are fixed tunable constants (start: 8 / 5).
- Rendered by a new `SphericalCameras.tsx` R3F component (parallel to the frustum-lines component), reusing the existing color/selection logic (`getFrustumBaseColor`, selection highlight).

### 2. Photosphere — selected spherical camera only

New component `src/components/viewer3d/Photosphere.tsx`, props `{ position, quaternion, radius, texture, side }`:
- Renders a `THREE.SphereGeometry` with `meshBasicMaterial({ map: texture, side })`. Default sphere UVs are longitude/latitude, so an equirectangular image maps directly; the sphere is oriented to the camera pose (accounting for COLMAP's equirect convention so "forward" is correct — to be verified during implementation).
- `side = FrontSide` for the from-outside object view.
- The photosphere is a **separate overlay** for the selected camera (like the pinhole selected-plane), so the grid-sphere batch is **not** rebuilt on selection. It renders just **inside** the grid radius (≈0.99×) so the grid reads as an outer orientation cage around the panorama and the two surfaces don't z-fight.
- Wired into the selected-camera layer alongside `CameraFrustumPlaneLayer`: if the selected camera is spherical and its image is available → render `Photosphere`; otherwise the existing flat-plane path. Automatic on selection; unselected spherical cameras stay grid spheres.
- **Immersive seam:** the component holds no selection/camera-control logic — only pose/radius/texture/side. A future immersive mode flips `side → BackSide` and moves the viewport to the sphere center; nothing here changes.

### 3. Gate pinhole-only paths for spherical

- **Flat texture:** skip for spherical at `FrustumPlaneSurface.tsx:60` / `useFrustumPlaneDisplayTexture.ts:39`.
- **Hover hints:** suppress the FOV/undistort affordances for spherical in `FrustumPlaneHoverCard.tsx:70,84` (pass a family flag alongside the existing `cameraProjection` prop).
- **Fly-to:** `getAutoAdjustedFov` (`cameraFrustumViewModel.ts`) fits to the sphere's radius for spherical instead of the pinhole plane width.

### 4. Correctness cleanup (Plan-1 final-review gap)

- **PSNR:** `psnrSplatSession` / `splatPsnrMetric` exclude spherical cameras from the metric — they can't be rendered by the pinhole splat pipeline. Mirror the existing `assertPinholeCamera` gate.
- **Ungated intrinsics consumers:** `UndistortedImageMaterial`, `cameraFrames`, `imageDetailCameraPoseViewModel` guard on `cameraModelHasPinholeIntrinsics` so they never use the dummy `fx=1` (short-circuit / show "N/A" for spherical).

### Data flow

Reconstruction → cameras partitioned by family in the item builders → **two** batched line geometries (frustums, spheres) + per-family selected-camera overlay → R3F components. Existing selection store → selected-camera layer branches on family → flat plane or photosphere.

## New / changed units

- **New** `sphericalCameraGeometry.ts` — `buildSphereLineGeometryData(...)` (+ a spherical-item filter over the reconstruction, reusing `CameraFrustumItem`).
- **New** `SphericalCameras.tsx` — batched grid-sphere lines component.
- **New** `Photosphere.tsx` — textured sphere, parameterized for the immersive seam.
- **Edit** the frustum item builder (exclude spherical), the frustum-lines mount point (add `SphericalCameras`), the selected-camera layer (photosphere branch), the texture/hover/fly-to gates, and the PSNR + intrinsics-consumer guards.

## Testing strategy

R3F canvas components aren't unit-tested in this repo; tests target the pure geometry/policy functions (matching the existing `cameraFrustumGeometry.test.ts` pattern):
- `sphericalCameraGeometry.test.ts`: line-segment counts derive from `MERIDIANS`/`PARALLELS`; radius scales with `cameraScale`; a known pose maps a known point to the expected transformed vertex; empty/degenerate inputs yield empty geometry.
- Routing policy: given a mixed camera set, the frustum builder yields only non-spherical and the sphere builder only spherical; the selected-camera layer picks photosphere vs flat plane by family.
- Gating: spherical → no textured plane, no FOV/undistort hint, excluded from PSNR, ungated consumers short-circuit.
- End-to-end: a `cameras.txt` with one EQUIRECTANGULAR + one pinhole camera + images loads; both render (sphere + frustum); selecting the spherical camera yields a photosphere.

## Risks / open items

- **Equirect orientation:** aligning the sphere texture + grid to COLMAP's equirectangular convention (which axis is "forward"/"up", seam location) must be verified against a real dataset during implementation; wrong orientation rotates the panorama. Isolated to the sphere-orientation math.
- **Texture reuse:** the photosphere should reuse the existing image-loading/texture path (as `FrustumPlaneSurface`/`UndistortedImageMaterial` do) rather than a second loader.
