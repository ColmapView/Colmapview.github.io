# WebGPU Splat Renderer And Full-GPU PSNR Plan

This plan is based on the current repo, local source evidence, local test
coverage, product constraints, and WebGPU hardware gates observed on
2026-06-05.

## Verdict

The WebGPU splat plan is compatible with the current Three.js/R3F
implementation.

Three.js remains authoritative for controls, camera interaction, points,
frustums, match lines, rig lines, image planes, floor overlays, picking,
screenshots, recordings orchestration, and DOM UI. WebGPU splats should remain a
separate base canvas behind the transparent Three canvas. Spark remains the
visible fallback renderer when WebGPU is unsupported or the user selects Spark.

The main compatibility risk is resolved: WebGPU splats can stay behind the
current Three.js viewer. For this patch, release readiness should be based on a
functional browser WebGPU path, clear unsupported states, and targeted coverage;
perfect offline-oracle calibration is useful follow-up work, not a release
blocker.

1. The deterministic browser WebGPU lane now covers full render-to-texture,
   texture comparison, camera projection, rasterization, and scalar readback.
   The bicycle path now also passes on installed Chrome with hardware WebGPU.
2. In-flight PSNR work is now cancelled deterministically on dataset, splat,
   and metric-device changes. After metric device loss, the evaluator cancels
   the active job, re-probes WebGPU PSNR from the unavailable state, and accepts
   later requests once readiness is restored.
3. Bicycle dataset validation now proves selected-image smoke behavior and
   offscreen isolation on installed Chrome. Offline numerical comparison remains
   calibration work, not a blocker for the functional feature.
4. Large `.ply/.spz` files must request WebGPU device limits from decoded cloud
   requirements. The bicycle `splat_30000.ply` requires buffers larger than the
   default portable limits, so loading must use `requiredLimits` when the
   adapter advertises enough capacity.

## Hard Constraints

- Do not remove Spark.
- Do not replace the current Three.js viewer, controls, overlays, picking, or
  UI.
- Do not rely on `C:\Users\HEQ\Projects\gsplat` in release builds.
- Do not use CPU fallback for PSNR rendering, undistortion, or reduction.
- Do not downscale PSNR for speed. Tile only for texture-limit overflow.
- Do not share mutable renderer state between visible splats and metric jobs.
- If WebGPU metric support fails, PSNR should be unavailable with a clear
  message. It should not silently fall back to Spark or CPU.
- Pinhole cameras do not need undistortion just because `fx != fy`.
- Distorted cameras require an undistorted ground-truth target. Until a WebGPU
  undistort pass exists, distorted-camera PSNR should fail clearly.
- PSNR work must be asynchronous/background and must not render into, resize, or
  blink the visible viewer.
- The current viewer camera transform is the source of truth for alignment.
- Splat selection fallback is largest `.spz`, then largest `.ply`.
- WebGPU device creation must request only the limits required by the decoded
  cloud and must fail clearly if the adapter cannot satisfy those limits.

## Current Implementation State

Landed or mostly landed:

- App-owned WebGPU renderer in `src/splat/webgpu/gaussianRenderer.ts`.
- Ref-counted WebGPU Gaussian scene resources in
  `src/splat/webgpu/gaussianSceneResourceManager.ts`.
- Visible WebGPU adapter in
  `src/splat/webgpu/visibleSplatRendererAdapter.ts`.
- Visible layer lazy import in
  `src/components/viewer3d/WebGpuSplatCanvasLayer.tsx`.
- Spark fallback remains intact.
- Backend policy separates visible renderer selection from metric capability.
- WebGPU buffer-limit policy exists in `src/splat/webgpu/webGpuSplatLimits.ts`.
  It computes `maxBufferSize` and `maxStorageBufferBindingSize` from Gaussian
  count and SH degree instead of relying on default portable limits.
- Visible WebGPU `.ply/.spz` loading decodes the cloud before `requestDevice()`.
  The loaded-renderer factory owns the decoded cloud shape, computes the exact
  required limits, requests the visible device, and uploads that same cloud as a
  single operation. This keeps large-cloud loading from accidentally creating a
  default-limit device.
- Visible and metric device creation verify that the returned `GPUDevice.limits`
  actually satisfy requested elevated splat limits before large buffers are
  allocated.
- Visible and metric device creation request a high-performance WebGPU adapter
  first, then fall back to the default adapter request if that adapter is
  unavailable. Elevated `requiredLimits` are still computed from the decoded
  cloud and verified against the returned device before allocation.
- Scene resource upload and renderer scratch-buffer allocation re-check the
  current `GPUDevice` limits before WebGPU buffer allocation. The low-level
  upload helper also preflights the decoded cloud shape before packing, so an
  under-limited device fails with a deterministic limit message instead of
  producing invalid `GPUBuffer` objects.
- The PSNR runtime can replace a cached low-limit metric `GPUDevice` when a
  later large cloud requires elevated limits.
- Intentional cached metric-device replacement is suppressed from device-loss
  listeners, so upgrading from a probe/default-limit device to a large-cloud
  device no longer cancels the active PSNR request as a false GPU failure.
- The PSNR runtime accepts an injectable WebGPU metric device provider and
  releases the cached metric device when that provider changes.
- WebGPU texture compare/reduce helper exists in
  `src/splat/webgpu/psnrTextureCompute.ts`.
- WebGPU ground-truth texture upload/resize helper exists in
  `src/splat/webgpu/psnrGroundTruthTexture.ts`.
- Metric camera frame helper exists in `src/splat/webgpu/cameraFrames.ts`.
- Isolated metric session exists in `src/splat/webgpu/psnrSplatSession.ts`.
- The metric session checks `maxTextureDimension2D` for both the requested
  target texture and decoded source bitmap before creating/uploading textures.
- The metric session treats `PINHOLE` cameras with unequal `fx`/`fy` as valid
  undistorted inputs; anisotropic focal lengths do not trigger undistortion.
- Metric camera-frame tests keep anisotropic focal-length behavior separate
  from off-center principal-point behavior. Principal-point offsets are proven
  through the WebGPU projection matrix passed to the shader, not through
  separate scalar uniforms.
- Metric camera-frame tests also compare arbitrary qvec/tvec COLMAP pinhole
  projections against an analytic non-browser oracle, including viewer Sim3D
  transforms and tile origins. This narrows the remaining bicycle PSNR
  uncertainty to raster/color/background/offline-render parity rather than
  camera pose, focal length, principal point, Sim3D, or tile-origin math.
- Optional independent-render validation harness exists in
  `scripts/validate-bicycle-gsrender-gl.py`. It parses the bicycle COLMAP
  binary cameras/images, confirms full-resolution PINHOLE intrinsics, reads the
  PLY vertex count without loading the 1.24 GB file in dry-run mode, can
  partially memory-map binary little-endian PLY files for limited smoke tests,
  reports tile-boundary seam diagnostics, marks whether a run is a trusted
  comparison, and can call a local `gsrender_gl` checkout for offline PSNR
  comparison when a practical renderer backend is available.
- The metric session rejects every non-pinhole and unknown camera model before
  image decode or GPU texture allocation until a WebGPU undistort path exists.
- The metric session creates renderer sessions without a `canvasContext`, uses
  `renderToTexture()`, and never calls the renderer's canvas path.
- Visible and metric WebGPU render sessions use a shared, unit-tested opaque
  black background policy in `src/splat/webgpu/splatRenderBackground.ts`.
- Published PSNR metrics carry the render-background assumption as data:
  `renderBackground: { label: "opaque-black", rgba: [0, 0, 0, 1] }`.
  The E2E probe exposes this field so hardware validation can prove which
  compositing assumption produced a score.
- Suspicious low-PSNR metrics also run a GPU-only alternate-background
  diagnostic before metric textures are released. The isolated metric renderer
  re-renders the same camera to an offscreen opaque-white texture, compares it
  against the same ground-truth texture with the WebGPU reducer, restores the
  renderer to opaque black, and publishes baseline/alternate/best background
  candidates with PSNR, MSE, valid-pixel count, and improvement dB.
- When source and target metric sizes match, the metric session tiles
  full-resolution overflow images, renders each tile with shifted full-image
  intrinsics, uploads matching ground-truth bitmap regions, and accumulates
  scalar tile reductions before computing PSNR.
- Ground-truth external-image uploads create `rgba8unorm` textures with the
  required `COPY_DST | TEXTURE_BINDING | RENDER_ATTACHMENT` usage before
  `copyExternalImageToTexture()`.
- Resized ground-truth metric textures and rendered metric targets are also
  explicitly created as `rgba8unorm`.
- Runtime `createImageBitmap` is invoked through the global receiver, avoiding
  illegal-invocation failures in real browsers.
- `SplatPsnrEvaluator` lazy imports the metric session and no longer renders
  PSNR through Spark/WebGL.
- Evaluator-facing WebGPU PSNR runtime helpers are split into
  `src/components/viewer3d/splatPsnrRuntime.ts`.
- Static import guards prevent evaluator-facing PSNR runtime files from eagerly
  importing the CPU diagnostic/reference module, `three`, or heavy renderer
  modules.
- Static source guards prevent evaluator-facing PSNR runtime files from
  reintroducing full-frame readback APIs such as `getImageData`, `readPixels`,
  DOM canvas creation, `OffscreenCanvas`, or `THREE.WebGLRenderer`.
- Runtime PSNR no longer performs full rendered-image CPU readback.
- The WebGPU texture reducer now exposes `{ sumSquaredError, validPixelCount }`
  plus pure PSNR calculation helpers, so texture-limit tiling can accumulate
  tile reductions before the final scalar PSNR calculation.
- The WebGPU texture reducer splits large full-resolution reductions across a
  2D compute-dispatch grid using `maxComputeWorkgroupsPerDimension`, so
  bicycle-sized images avoid the 65,535 workgroups-per-dimension validation
  failure while still reading back only scalar reduction data.
- Suspicious finite PSNR results below 20 dB now run extra WebGPU diagnostic
  passes before metric textures are released. The color pass reads back only 64
  bytes of scalar data: valid pixel coverage plus mean rendered and
  ground-truth RGB. A small GPU offset search compares overlapping regions in a
  bounded pixel window and reads back only 16-byte scalar reductions per tested
  offset. The app stores those values with render size, source image size, image
  name, camera id, camera model id, best offset, offset-improved PSNR, and an
  explicit broad-background/exposure mismatch classification for debugging
  visually aligned low scores.
- Per-image PSNR textures and decoded image bitmaps are released on successful
  metric computation, render/reduction failure paths, and active cancellation
  through metric session disposal.
- WebGPU debug counters in `src/splat/webgpu/webGpuSplatDebugCounters.ts`
  track active device handles, canvases, GPU buffers, GPU textures, render
  sessions, PSNR sessions, and active PSNR image jobs. Unit coverage
  proves the counters return to zero for the device handle, scene upload,
  renderer resize/dispose, ground-truth texture helper, texture reducer, and
  PSNR session lifecycle paths. The metric PSNR `GPUDevice` cache is included
  in the device counter and releases counters when reset, replaced for elevated
  limits, or lost.
- A Chromium WebGPU app E2E repeats selected-image PSNR requests and verifies
  the browser WebGPU debug counter snapshot returns to the same baseline after
  every completed request, covering transient render targets, textures,
  buffers, sessions, active jobs, and metric-device reuse.
- A Chromium WebGPU app E2E repeatedly loads a visible WebGPU `.ply`, switches
  to a visible WebGPU `.spz`, clears the session, and verifies the browser
  WebGPU debug counters return to the same post-clear baseline. The test proves
  visible canvases, GPU buffers, GPU textures, render sessions, PSNR sessions,
  and active jobs do not accumulate across repeated load/switch/clear cycles.
- WebGPU telemetry in `src/splat/webgpu/webGpuSplatTelemetry.ts` records
  Gaussian decode time/bytes, scene upload time/bytes, first-frame time, render
  time, per-image PSNR time/images-per-second, PSNR reduction readback
  bytes/readback time, and low-PSNR diagnostic readback bytes/readback time.
  Focused unit coverage verifies the emitted event payloads from loader, scene
  upload, renderer, reducer, diagnostics, and PSNR session paths.
- Metric device loss invalidates the cached PSNR `GPUDevice`.
- Metric device loss notifies the evaluator, cancels active PSNR work, and
  prevents late metric publishing.
- After metric device loss, the evaluator re-probes WebGPU PSNR from the
  unavailable state; later metric requests can run once readiness is restored.
- Dataset, reconstruction, and splat identity changes cancel active PSNR work
  and prevent stale metric publishing.
- Coverage config includes `src/splat/**` and PSNR evaluator/metric surfaces.
- A Chromium WebGPU Playwright lane executes the PSNR texture reducer on a real
  `GPUDevice`.
- A browser WebGPU full-render lane now renders one synthetic Gaussian into an
  offscreen texture and verifies self-PSNR, non-black output, exact flat-color
  PSNR, color mismatch detection, gamma/color-space mismatch detection,
  one-pixel offset sensitivity, and an aligned Sim3D render above 50 dB under
  the deterministic SwiftShader WebGPU project.
- A browser WebGPU isolation lane now proves the metric session leaves a
  visible DOM canvas byte-identical, creates no DOM canvases, reads back only a
  16-byte scalar buffer, and continues while viewer camera state changes.
- An integrated app WebGPU PSNR lane now loads a synthetic COLMAP dataset plus
  a valid `.ply` splat through the real drop workflow, runs selected-image PSNR
  through `SplatPsnrEvaluator`, verifies the scene center screenshot remains
  byte-identical, and confirms real viewer camera movement does not cancel the
  request. It also proves overlapping selected-image PSNR requests publish only
  the newest metric when an older request resolves late, and that a
  dataset/splat switch during an in-flight metric does not publish stale
  results. The same browser app lane also loads a real `.spz` fixture generated
  by the vendored `gs-toolbox.saveSPZ()` writer through the visible WebGPU path
  and waits for the first rendered frame.
- An opt-in bicycle WebGPU Playwright lane now serves the local bicycle dataset
  through the manifest loader, loads `output/splat_30000.ply`, runs selected
  image PSNR, checks the visible viewer pixel drift stays under a tight
  threshold, verifies no extra visible canvas appears, and checks camera
  movement during PSNR does not cancel the request. The same lane also watches
  browser console output for the fatal large-cloud WebGPU validation class:
  `exceeds the max buffer size limit`, storage-binding limit failures, invalid
  WebGPU buffers, invalid bind groups, visible WebGPU runtime initialization
  failures, and splat render-session validation failures.
- The opt-in hardware WebGPU Playwright projects can run against installed
  Chrome through `COLMAP_WEBVIEW_WEBGPU_CHANNEL=chrome`; bundled Chromium may
  still skip or fail on this Windows machine when Dawn/D3D12 cannot open
  `dxil.dll`.
- Local backend-policy and canvas-layer tests now cover forced Spark, forced
  WebGPU, auto fallback, `.splat` WebGPU ineligibility, `.spz`/`.ply`
  eligibility, first-frame readiness reporting, and metric capability remaining
  available while Spark is the visible fallback.
- A browser backend-preference lane now covers forced Spark without mounting the
  visible WebGPU canvas, forced WebGPU after first frame, and auto mode moving
  from Spark fallback to visible WebGPU after the hidden WebGPU first frame.
- The same browser lane verifies a real Three.js camera-frustum hit target
  remains clickable while the visible WebGPU splat canvas is present behind the
  transparent Three canvas.
- Frustum, match-line, and rig-line width controls are covered from panel
  sliders through store/node facades to fat-line material mutation.
- Point/splat display modes use a shared layer policy: normal points render
  below Spark splats, Spark splats render below splat-point overlays, and
  blinking/rainbow splat-point overlays disable depth test/write so they remain
  visible above splats.
- The detected floor disk/ring and normal arrow render above splats with
  depth testing disabled; the arrow has a higher render order than the disk.
- Footer and gallery chrome auto-hide no longer changes the main render/gallery
  layout: the desktop status bar is absolute, and the gallery toolbar hides
  its controls while preserving a fixed top slot; gallery image-name overlays
  are suppressed with the toolbar.
- Auto-hide remains paused over popup/menu/button surfaces and the gallery
  panel, including portal-rendered UI outside the scene container.
- Visible WebGPU device loss is routed through the renderer adapter into the
  backend store as a failed WebGPU state, unmounting the WebGPU canvas and
  preserving a clear failure reason.
- Auto backend selection keeps Spark resolved while the hidden WebGPU canvas
  initializes, and swaps to visible WebGPU only after the renderer reports its
  first frame.
- Browser auto-backend coverage delays the hidden WebGPU load, verifies a
  nonblank Spark fallback frame during the delay, samples multiple nonblank
  scene-center screenshots through the Spark-to-WebGPU handoff, then verifies a
  nonblank WebGPU frame after the first-frame handoff.
- If hidden WebGPU initialization fails in auto mode, Spark remains the visible
  fallback when available and the app emits a warning with the WebGPU failure
  reason instead of blanking the splat renderer.
- The visible WebGPU canvas layer disposes the active renderer when the selected
  splat file changes, when the active splat file is cleared during a dataset
  switch, or when the layer unmounts.
- Per-render WebGPU validation scopes are now opt-in through the renderer's
  debug-validation option. Production visible and metric sessions skip
  `pushErrorScope`/`popErrorScope`; renderer validation tests and browser smoke
  coverage opt in explicitly.
- Metric offscreen renders request submitted-completion mode, so PSNR does not
  idle the CPU on `queue.onSubmittedWorkDone()` after every render before
  submitting the ordered texture-reduction work on the same WebGPU queue.
- The PSNR session exposes submitted single-image metric handles. All-image
  evaluator requests keep a small window of submitted reductions in flight, so
  the next image can start while prior 16-byte scalar readbacks are still
  pending. Handles keep image textures alive until their readback resolves and
  dispose them exactly once.
- Spark renderer construction now waits for an initialized `SplatMesh` and is
  deferred until the next animation frame after that mesh is committed,
  preventing the observed transient `SparkRenderer.readbackDepth(): No target`
  path while a splat is still loading or after a background WebGPU
  initialization failure.

Still transitional:

- `src/components/viewer3d/splatPsnrMetric.ts` still contains CPU helpers and a
  buffer-based reducer for tests/reference/legacy callers, but the evaluator no
  longer imports it.
- Distorted cameras fail clearly because WebGPU undistort is not implemented.
- Most renderer/session tests fake WebGPU and do not execute WGSL.
- Full render-to-texture and bicycle selected-image PSNR now pass on installed
  Chrome with hardware WebGPU in this environment. Bundled Playwright Chromium
  still cannot run this lane here because Dawn/D3D12 fails opening `dxil.dll`.
- The bicycle `splat_30000.ply` device-limit failure is fixed locally by policy,
  unit tests, and the installed-Chrome bicycle E2E. Lower-limit adapters still
  need future chunked storage buffers.
- Rendered-pixel centroid/intrinsics, pose-perturbation, and Sim3D invariance
  validation now runs in the deterministic WebGPU lane.

## Release Documentation Notes

### WebGPU Capability And Spark Fallback

The visible splat backend is selected independently from the rest of the
Three.js viewer. WebGPU is used for visible splats when it is supported, the
selected splat file is eligible, and the adapter can satisfy the decoded cloud's
buffer limits. Spark remains the visible fallback when WebGPU is unsupported,
when the user selects Spark, or when a file type is not eligible for the app
WebGPU path. A forced WebGPU selection should fail visibly instead of silently
falling back.

Metric PSNR has a stricter policy than visible splat rendering: it requires a
working WebGPU metric device and has no CPU or Spark fallback. If WebGPU metric
support is unavailable, PSNR should be unavailable with a clear status.

### Supported Splat Formats

The app WebGPU splat path supports decoded Gaussian `.ply` and `.spz` files.
When a dataset has multiple splat candidates, automatic selection prefers the
largest `.spz` file, then the largest `.ply` file. The point-cloud menu still
allows explicitly choosing among available `.ply` and `.spz` candidates.

The legacy `.splat` format remains Spark-only unless a separate WebGPU loader is
implemented.

### Large-Cloud WebGPU Limits

Large Gaussian files can exceed WebGPU's portable defaults: 256 MiB
`maxBufferSize` and 128 MiB `maxStorageBufferBindingSize`. The WebGPU path now
decodes `.ply`/`.spz` metadata before device creation, computes the required
Gaussian, SH, and renderer storage sizes, and requests elevated
`requiredLimits` only when the decoded cloud needs them.

If the adapter advertises enough capacity, device creation should opt into the
larger limits and continue. If it does not, loading must fail clearly before
creating an invalid device or canvas. The current renderer still uses
monolithic storage buffers; lower-limit adapters will need future chunked or
batched storage bindings before they can load very large SH clouds.

The hardware bicycle E2E checks this directly. In addition to waiting for the
visible WebGPU first frame, it fails the test if the browser console reports
the prior default-limit failure mode: oversized `CreateBuffer`, oversized
storage-buffer binding, invalid `GPUBuffer`, invalid bind group, WebGPU splat
runtime initialization failure, or render-session WebGPU validation failure.

### PSNR Assumptions

Runtime PSNR renders splats into an offscreen full-resolution `rgba8unorm`
texture, uploads the ground-truth image into `rgba8unorm`, compares RGB values
on GPU, masks pixels with zero ground-truth alpha, and reads back only scalar
reduction data. It does not downscale for speed; tiling is only for texture
limit overflow.

Visible and metric WebGPU sessions use an explicit opaque black render
background. Datasets trained or rendered against a different background need
explicit background support before the PSNR value should be treated as final.
Every runtime PSNR metric stores this assumption as
`renderBackground: { label: "opaque-black", rgba: [0, 0, 0, 1] }`. The
comparison uses display-space 8-bit RGB values with `createImageBitmap` color
conversion and premultiplication disabled.

### Camera And Distortion Limits

Pinhole cameras with unequal `fx` and `fy` are valid and do not require
undistortion. Off-center principal points and Sim3D scale are covered by tests.

Distorted camera models require an undistorted ground-truth target. Until a
WebGPU undistort pass is implemented for OPENCV, FULL_OPENCV, radial, and FOV
models, distorted-camera PSNR should report unsupported instead of producing a
misleading value or falling back to CPU.

### Release Validation Bar

The deterministic Chromium WebGPU lane proves the synthetic full-GPU path, but
it is not sufficient by itself for the large bicycle cloud. The installed-Chrome
hardware lane now proves the large-cloud WebGPU path and a bicycle selected-image
PSNR smoke test on this machine.

The release bar is functional behavior, not perfect calibration:

- WebGPU splats load or fail clearly based on adapter limits.
- PSNR runs offscreen, asynchronously, without blinking or resizing the viewer.
- Runtime diagnostics state the black-background metric assumption.
- Distorted cameras remain unsupported until GPU undistort exists.

Trusted offline numerical comparison remains useful for future calibration of
expected bicycle PSNR ranges, but it should not block this functional release.

## Architecture

### Visible Layering

```text
DOM controls, popups, modals, auto-hide chrome
Three WebGL canvas for overlays and interaction
WebGPU splat canvas for visible splats
Container background
```

Splats are a base layer. They are not depth-interleaved with Three geometry in
this plan.

### Resource Model

```text
GaussianCloud CPU source
  decoded .spz/.ply cloud, bounds, stable cache key
      |
      v
GpuGaussianSceneRef per GPUDevice
  immutable GPU gaussian buffers, count, bounds, release()
      |
      +--> VisibleSplatSession
      |      owns canvas context, visible render targets, camera, scratch
      |
      +--> PsnrSplatSession
             owns offscreen render targets, metric camera, scratch, job state
```

Sharing immutable GPU buffers is allowed only when sessions use the same
`GPUDevice` and a ref-counted resource manager owns the buffers. Sharing mutable
session state is never allowed.

### Device Policy

Initial correctness policy:

- Use a dedicated metric `GPUDevice`.
- Use a metric-owned resource manager.
- Re-upload the Gaussian cloud for metric jobs.
- Optimize sharing only after isolation and numerical correctness are proven.

Future performance policy:

- Add an injectable metric device provider.
- Benchmark same-device visible and metric sessions with shared immutable
  buffers.
- Adopt sharing only if E2E proves metric jobs do not blink, leak into the
  visible canvas, cancel on camera motion, or hitch the viewer beyond the
  accepted budget.

### PSNR Pipeline

Per image:

1. Snapshot request id, image, camera, splat file, Gaussian scene, and Sim3D
   transform.
2. Decode the ground-truth image with:

   ```ts
   createImageBitmap(file, {
     colorSpaceConversion: 'none',
     premultiplyAlpha: 'none',
   })
   ```

3. Upload or resize ground truth into an `rgba8unorm` GPU texture.
4. For distorted cameras, run a WebGPU undistort pass into the target texture.
   Until that pass exists, report unsupported instead of falling back to CPU.
5. Render splats into an offscreen full-resolution `rgba8unorm` texture with
   `RENDER_ATTACHMENT | TEXTURE_BINDING | COPY_SRC` usage.
6. Composite splats over opaque black.
7. Compare rendered and ground-truth textures in compute.
8. Reduce squared error and valid pixel count on GPU.
9. Read back only the final scalar buffer, ideally 16 bytes.
10. Publish the metric only if the request id and data identity are still
    current.

Displayed PSNR:

- Compare display-space 8-bit RGB values.
- Ignore pixels where ground-truth alpha is zero.
- Use the shared opaque black background policy unless trained-background
  support is explicitly added.
- Report the uncorrected base PSNR.
- Keep offset/color diagnostics as explicit debug-only tools, not the hot path.

## Main Risks

1. **Offline numerical calibration remains open.** Installed Chrome now proves
   the hardware WebGPU smoke path on the local bicycle dataset, including
   visible first frame, selected-image PSNR, tiny scalar readback, scene
   isolation, and camera motion during PSNR. Comparing browser WebGPU output
   against a trusted offline render is still useful for calibration, but it is
   not required for the feature to be functional.
2. **Bundled Chromium is not enough for the bicycle hardware lane here.** The
   deterministic SwiftShader lane remains useful for synthetic correctness, but
   Playwright's bundled Chromium/Dawn path still fails on this Windows machine
   while opening `dxil.dll`; installed Chrome is required for the local hardware
   bicycle gate.
3. **Color/background assumptions are under-specified.** The metric compares
   black-composited display-space `rgba8unorm` textures. Bicycle validation and
   release notes must state this assumption clearly.
4. **Large clouds still use monolithic storage bindings.** The v0.7.1 fix now
   requests cloud-specific `maxBufferSize` and `maxStorageBufferBindingSize`
   when the adapter advertises enough capacity. This is principled for capable
   adapters and fixes the default-limit class of failures, but a portable
   long-term renderer still needs chunked Gaussian/SH buffers or per-pass
   binding windows for adapters that cannot expose a single 900 MB binding.
5. **Resize-plus-overflow tiling is still unsupported.** Full-resolution
   source-equals-target overflow now tiles without downscaling, but images that
   also require source-to-target resizing still fail clearly instead of mixing
   resize filtering with tile boundaries.
6. **Spark/WebGPU transition errors need browser coverage.** Unit coverage now
   prevents SparkRenderer from being constructed before an initialized Spark
   `SplatMesh` has committed for one animation frame, which addresses the
   observed `No target` class of transient errors. Browser coverage is still
   needed for the full background-WebGPU-fail plus Spark UI flow.
7. **CPU diagnostics still need quarantine discipline.** The evaluator-facing
   runtime boundary is split and guarded, but CPU reference helpers should remain
   test/debug-only and must not become a runtime fallback.

## Improved Phase Checklist

### Phase 0: Reconcile Plan Claims

- [ ] Re-audit every checked item in this plan against source and tests.
- [ ] Correct any checked item that only has fake-device coverage.
- [x] Reframe `cx`/`cy` validation: principal point reaches the shader through
      the projection matrix, not scalar uniforms.
- [x] Keep `fx != fy` tests separate from distortion/undistortion behavior.
- [x] Confirm default release build has no sibling `../../gsplat` dependency.
- [x] Confirm default release build does not include a live
      `@local-gsplat-webgpu` alias.

Gate:

- [x] `npx tsc -b --pretty false`
- [x] `npm run test:run`
- [x] `npm run build`
- [x] `git diff --check`

### Phase 1: Real WebGPU Reducer Lane

- [x] Add a Playwright `chromium-webgpu` project.
- [x] Create a real `GPUDevice`.
- [x] Validate `computePsnrFromRgbaTexturesWebGpu` on synthetic textures.
- [x] Validate final readback is 16 bytes.
- [x] Capture WebGPU validation errors and fail the test.
- [x] Add identical-texture case that returns `Infinity`.
- [x] Add all-alpha-zero ground truth case that returns unavailable/no valid
      pixels.
- [x] Add multi-workgroup reduction coverage.
- [x] Add 64-bit carry coverage for the reducer accumulator.

Gate:

- [x] Reducer numerics match CPU oracle across edge cases.
- [x] Readback remains tiny.
- [x] Validation errors are visible in test output.

Local Windows command:

```powershell
npx playwright test e2e/webgpu-psnr.spec.ts --project=chromium-webgpu --reporter=line --workers=1
```

### Phase 2: Full WebGPU Render Validation

- [x] Add an opt-in hardware WebGPU Playwright project or script.
- [x] Auto-skip hardware lane when no WebGPU adapter is available.
- [x] Render a single Gaussian at a known model point.
- [x] Assert rendered centroid lands at the expected pixel.
- [x] Cover off-center `cx`.
- [x] Cover off-center `cy`.
- [x] Cover `fx != fy`.
- [x] Render an image and compare it against itself to return `Infinity`.
- [x] Compare render against opaque black and assert output is not blank.
- [x] Read back only scalar centroid data for rendered-pixel validation.
- [x] Compare flat-color render and flat-color GT for exact MSE/PSNR.
- [x] Perturb pose deliberately and assert PSNR drops sharply.
- [x] Run a rendered Sim3D invariance test with translation, rotation, and
      uniform scale.
- [x] Fail the test on any WebGPU validation error in the render session.
- [x] Production build resolves the vendored `gs-toolbox` browser exports used
      by the WebGPU renderer.

Gate:

- [x] Projection, rasterization, render-to-texture, texture compare, and scalar
      readback all run on the deterministic browser WebGPU lane.
- [x] Projection, rasterization, render-to-texture, texture compare, and scalar
      readback all run on a real hardware GPU.
- [x] Principal point and anisotropic focal behavior are proven by rendered
      pixels, not only matrix math.
- [x] Sim3D invariance is proven on rendered output.

Local commands:

```powershell
npx playwright test e2e/webgpu-render.spec.ts --project=chromium-webgpu --reporter=line --workers=1
npx playwright test e2e/webgpu-render.spec.ts --project=chromium-webgpu-hardware --reporter=line --workers=1
```

On this machine the `chromium-webgpu` command passed. Bundled Chromium's
hardware project previously skipped or failed here, but the installed-Chrome
bicycle gate now exercises the same hardware render-to-texture path through
`COLMAP_WEBVIEW_WEBGPU_CHANNEL=chrome`.

### Phase 2.5: Large-Cloud WebGPU Limit Negotiation

- [x] Compute exact Gaussian buffer bytes from `count * 64`.
- [x] Compute exact SH buffer bytes from `count * (((degree + 1) ** 2 - 1) * 3)
      * 4`.
- [x] Compute renderer scratch/storage bytes for splat data, depths, and
      indices.
- [x] Request `maxBufferSize` and `maxStorageBufferBindingSize` through
      `requiredLimits` only when a decoded cloud requires them.
- [x] Treat the WebGPU portable defaults as the opt-up threshold: 256 MiB for
      `maxBufferSize` and 128 MiB for `maxStorageBufferBindingSize`
      ([GPUWeb WebGPU limits table](https://gpuweb.github.io/gpuweb/#limits)).
      Small clouds keep the default `requestDevice()` descriptor and can reuse
      cached default-limit metric devices.
- [x] Fail before `requestDevice()` with a clear adapter-limit message when the
      adapter cannot satisfy the required limits.
- [x] Decode visible `.ply/.spz` clouds before visible `requestDevice()` so the
      device request is sized from the actual file.
- [x] Keep visible large-cloud device creation and cloud upload in
      `createLoadedVisibleWebGpuSplatRendererAdapter`, so the cloud shape that
      computes `requiredLimits` is the same cloud that gets uploaded.
- [x] Verify the returned visible and metric `GPUDevice.limits` satisfy the
      requested elevated limits before creating large splat buffers.
- [x] Re-check the active `GPUDevice` limits at Gaussian scene upload and
      renderer scratch-buffer allocation before calling `createBuffer()`.
- [x] Preflight low-level Gaussian uploads from cloud shape before packing so
      under-limited devices never reach large-buffer allocation.
- [x] Let the PSNR runtime replace a cached low-limit metric device when a later
      cloud requires higher limits.
- [x] Add unit tests for the bicycle-sized 5M Gaussian, degree-3 case:
      320 MB gaussian buffer, 900 MB SH buffer, and 240 MB renderer splat-data
      binding.
- [x] Make the bicycle E2E preflight request the same 900 MB elevated device
      limits before loading the real dataset, so a skip means the adapter cannot
      satisfy the large-cloud requirement.
- [x] Prove `output/splat_30000.ply` no longer hits default 256 MB / 128 MB
      WebGPU limits in a real browser with hardware WebGPU. Installed Chrome
      accepted the elevated 900 MB limit preflight and reached a visible WebGPU
      first frame through the bicycle E2E gate.
- [x] Prove a lower-limit adapter failure is reported once through the visible
      WebGPU layer, stores the clear WebGPU limit message, and unmounts the
      WebGPU canvas in component coverage.
- [x] Prove the same lower-limit adapter failure behavior with a mocked
      low-limit adapter in browser E2E and confirm it does not leave a stale
      WebGPU canvas or Spark loading notification.
- [x] Design long-term chunked/batched storage bindings for adapters that cannot
      expose the monolithic limits needed by very large SH clouds.

Long-term chunked/batched storage design:

- Keep the current monolithic buffer path as the fast path whenever the adapter
  can expose the decoded cloud's `requiredLimits`.
- Add a second renderer resource layout for lower-limit adapters: split
  Gaussian data, SH data, projected splat data, depths, and indices into chunks
  whose individual buffers and storage bindings stay below
  `device.limits.maxBufferSize` and
  `device.limits.maxStorageBufferBindingSize`.
- Use fixed per-chunk metadata buffers containing `baseGaussianIndex`,
  `chunkCount`, `chunkSize`, and SH byte offsets. Shaders must index local chunk
  storage and write local sorted indices without assuming a single global
  storage buffer.
- Preserve exact full-resolution PSNR semantics by rendering all chunks into
  the same offscreen target using deterministic front-to-back or back-to-front
  composition. If exact global ordering is required, introduce a global tiled
  sort/merge pass before rasterization instead of accepting per-chunk ordering
  artifacts.
- Share immutable chunked scene resources between visible and metric sessions
  through the existing ref-counted scene manager, but keep render targets,
  camera frames, sort buffers, and PSNR textures session-owned.
- Treat chunking as a capability fallback, not a CPU fallback. If a cloud still
  cannot fit after chunking because texture, workgroup, or per-pass limits are
  exceeded, fail with a clear WebGPU capability message.

Validation checklist for chunking:

- Unit-test chunk planning at boundaries around portable limits, elevated
  limits, zero SH, degree-3 SH, and the bicycle 5M/degree-3 cloud.
- Browser-test a synthetic cloud that is forced into multiple tiny chunks and
  compare rendered centroids and PSNR against the monolithic path.
- Browser-test multi-chunk visible rendering through Spark/WebGPU auto handoff
  to confirm no blank frame during backend resolution.
- Hardware-test `output/splat_30000.ply` on an adapter that cannot expose the
  current 900 MB SH binding requirement, once such hardware is available.

Gate:

- [x] `npx tsc -b --pretty false`
- [x] `npx vitest run src/splat/webgpu/webGpuSplatLimits.test.ts src/splat/webgpu/webGpuSplatDevice.test.ts src/splat/webgpu/visibleSplatRendererAdapter.test.ts src/components/viewer3d/WebGpuSplatCanvasLayer.test.tsx src/components/viewer3d/SplatPsnrEvaluator.test.tsx src/components/viewer3d/splatPsnrRuntime.test.ts src/components/viewer3d/PointCloud/SplatLayer.test.tsx --reporter=dot`
- [x] `npx playwright test e2e/webgpu-psnr-app.spec.ts --project=chromium-webgpu --grep "low-limit adapter" --reporter=line --workers=1`
- [x] Hardware bicycle visible WebGPU load reaches first frame with no
      `maxBufferSize`, `maxStorageBufferBindingSize`, invalid-buffer,
      invalid-bind-group, or WebGPU runtime validation errors.

### Phase 3: Metric Session Hardening

- [x] Add `src/splat/webgpu/psnrSplatSession.ts`.
- [x] Keep it lazy-loaded from the evaluator.
- [x] Load `.spz` and `.ply` through `gaussianCloudLoader.ts`.
- [x] Acquire metric-owned Gaussian scene resources.
- [x] Create render sessions with no canvas context.
- [x] Render to `rgba8unorm` offscreen textures.
- [x] Use the shared opaque black metric background policy.
- [x] Destroy per-image textures in `finally`.
- [x] Release scene refs on dispose and initialization failure.
- [x] Make `dispose()` idempotent.
- [x] Add injectable metric device provider and reset cached metric devices when
      the provider changes.
- [x] Guard native source image texture size before GT upload.
- [x] Split reducer into `{ sumSquaredError, validPixelCount }` and pure PSNR
      calculation.
- [x] Split large full-resolution reducer work across a 2D compute-dispatch
      grid so large images do not exceed `maxComputeWorkgroupsPerDimension`.
- [x] Add texture-limit tiling that accumulates across tiles.
- [x] Prove tiled PSNR equals non-tiled PSNR on small images.

Gate:

- [x] No canvas is created by the metric session.
- [x] Runtime PSNR has no full-frame CPU readback.
- [x] Oversized images either tile correctly or fail with a clear unsupported
      reason.
- [x] Per-image resources are released on success.
- [x] Per-image resources are released on render/reduction failure.
- [x] Per-image resources are released promptly on cancellation.

### Phase 4: Evaluator Lifecycle And Isolation

- [x] Remove Spark runtime rendering from `SplatPsnrEvaluator.tsx`.
- [x] Remove offscreen `THREE.WebGLRenderer` PSNR rendering.
- [x] Remove full render-target pixel readback from the hot path.
- [x] Remove `waitForAnimationFrame()` from metric execution.
- [x] Lazy import `psnrSplatSession.ts` inside metric job creation.
- [x] Publish results only for the latest request id.
- [x] Moving the viewer camera does not cancel the current metric request.
- [x] Repeated requests publish only the newest request.
- [x] Cancel and dispose active metric work when the splat file changes.
- [x] Cancel and dispose active metric work when the dataset/reconstruction
      changes.
- [x] Cancel and dispose active metric work when the metric `GPUDevice` is lost.
- [x] Ensure stale jobs cannot publish after data identity changes.
- [x] Define and test explicit retry behavior after metric device loss.
- [x] Move CPU PSNR/reference/diagnostic helpers out of the evaluator-facing
      runtime module.
- [x] Extend static import guards to forbid evaluator static imports of `three`
      and CPU diagnostic modules.
- [x] Extend static source guards to forbid evaluator-facing full-frame readback
      APIs.

Gate:

- [x] Synthetic WebGPU PSNR changes only metric/output state and leaves a
      visible DOM canvas byte-identical.
- [x] Synthetic WebGPU PSNR creates no DOM canvases and never renders into the
      visible viewer surface.
- [x] Synthetic viewer camera-state changes do not cancel PSNR.
- [x] Integrated synthetic app selected-image PSNR leaves the visible viewer
      screenshot byte-identical.
- [x] Real viewer camera movement does not cancel integrated synthetic app
      selected-image PSNR.
- [x] Integrated synthetic app repeated selected-image PSNR publishes only the
      newest metric when an older request resolves late.
- [x] Integrated synthetic app dataset/splat switch during selected-image PSNR
      prevents stale metric publication.
- [x] Dataset/splat switch does cancel PSNR.
- [x] Metric device loss produces clear UI state and no late publish.

### Phase 5: Camera, Color, And Numerical Correctness

- [x] Add no-GPU metric Sim3D projection invariance coverage.
- [x] Add camera tests for `fx != fy`, off-center `cx`, and off-center `cy`.
- [x] Add rendered projection parity against known pixels.
- [x] Add non-browser analytic COLMAP projection parity for arbitrary qvec/tvec,
      viewer Sim3D transform, and tile-origin metric views.
- [x] Assert pinhole images with `fx != fy` do not trigger undistortion.
- [x] Pin `createImageBitmap` options in runtime and tests.
- [x] Keep ground truth and rendered textures as `rgba8unorm`, not
      `rgba8unorm-srgb`.
- [x] Compare RGB only and mask by ground-truth alpha.
- [x] Create external-image upload textures with WebGPU-required
      `COPY_DST | RENDER_ATTACHMENT` usage.
- [x] Make runtime WebGPU visible/metric background policy explicit and
      unit-tested as opaque black.
- [x] Capture low-PSNR diagnostics for finite results below 20 dB: mean
      rendered RGB, mean ground-truth RGB, valid coverage, render size, source
      image size, image name, camera id, and camera model id.
- [x] Extend low-PSNR diagnostics with GPU best-offset search and explicit
      broad-background/exposure mismatch classification.
- [x] Extend low-PSNR diagnostics with a GPU-only opaque-white alternate
      background render and store baseline/alternate/best background candidates.
- [ ] Confirm black background semantics match the splat training/rendering
      assumption.
- [x] Add deliberate color-space mismatch test that fails loudly.
- [x] Add deliberate one-pixel offset test that lowers PSNR.
- [x] Add deliberate pose perturbation test that lowers PSNR.

Gate:

- [x] Rendered image compared with itself returns `Infinity`.
- [x] Flat-color synthetic images return exact expected PSNR.
- [x] Pose perturbation lowers PSNR.
- [x] Color mismatch is detected.
- [x] Valid aligned synthetic view reaches expected high PSNR.

### Phase 6: Distorted Camera WebGPU Undistort

- [ ] Define the GPU undistort parameter struct for all parsed camera models.
- [ ] Implement WGSL undistort for OPENCV.
- [ ] Implement WGSL undistort for FULL_OPENCV.
- [ ] Implement WGSL undistort for radial models.
- [ ] Implement WGSL undistort for FOV.
- [ ] Implement WGSL undistort for supported fisheye models.
- [ ] Write alpha zero outside the valid source domain.
- [ ] Compare WGSL undistort against the CPU oracle within tolerance.
- [ ] Use the WGSL undistorted texture in PSNR.

Gate:

- [ ] Distorted-camera PSNR is enabled only after GPU undistort parity passes.
- [x] Unsupported camera models fail clearly.
- [x] Runtime PSNR uses no CPU undistort fallback.

### Phase 7: Visible Backend E2E

- [x] Forced Spark never mounts visible WebGPU.
- [x] Forced WebGPU resolves to WebGPU when WebGPU is supported.
- [x] Forced WebGPU fails visibly when unsupported and does not silently fall
      back to Spark.
- [x] Auto mode falls back to Spark when WebGPU is unsupported.
- [x] Auto mode swaps from Spark to WebGPU only after first valid WebGPU frame.
- [x] Auto mode swaps without visible blink in the synthetic app lane by
      sampling nonblank scene-center frames through the Spark-to-WebGPU handoff.
- [x] Spark visible fallback does not disable WebGPU metric capability.
- [x] `.splat` stays off WebGPU unless a WebGPU `.splat` loader is added.
- [x] `.spz` and `.ply` remain eligible for WebGPU loading.
- [x] Largest `.spz`, then largest `.ply` fallback selection is preserved.
- [x] Points-only, splats-only, splats+points, and rainbow-points layer order is
      preserved.
- [x] Floor disk and arrow render above splats.
- [x] Frustum, match-line, and rig-line width controls are preserved.
- [x] Footer/gallery chrome auto-hide does not resize the render area.
- [x] Auto-hide remains suppressed over popups, menus, buttons, and gallery UI.

Gate:

- [x] Backend-policy E2E passes for Spark, WebGPU, and auto.
- [x] No blink on auto backend swap.
- [x] UI overlays remain interactive with WebGPU splats behind Three.

### Phase 8: Performance, Memory, And Device Loss

- [x] Handle visible `device.lost`.
- [x] Invalidate cached metric device on loss.
- [x] Stop metric jobs cleanly on metric device loss.
- [x] Request elevated buffer/storage-binding limits for large clouds when the
      adapter supports them.
- [x] Recreate the metric device when a cached PSNR device does not satisfy a
      later large-cloud limit request.
- [x] Suppress intentional cached metric-device replacement from device-loss
      cancellation, while preserving real `device.lost` handling.
- [x] Dispose GPU resources on dataset switch.
- [x] Dispose GPU resources on splat switch.
- [x] Dispose GPU resources on clear/unmount.
- [x] Release per-image PSNR textures after each image.
- [x] Release cancelled-job textures and buffers.
- [x] Check `maxTextureDimension2D` before source and target texture creation.
- [x] Add tiling only for texture-limit overflow.
- [x] Make per-render WebGPU validation scopes debug-only after correctness
      validation passes.
- [x] Avoid per-image metric render idle waits by resolving offscreen
      `renderToTexture()` after command submission and relying on WebGPU queue
      ordering for the following texture reduction.
- [x] Pipeline all-image PSNR through submitted single-image metric handles with
      a bounded in-flight window.
- [ ] Design a deeper multi-image reduction path that can combine command
      submission and scalar readback cadence beyond one 16-byte readback per
      image.
- [x] Add telemetry for decode, upload, first frame, render time, PSNR
      images/sec, reduction time, diagnostic time, readback bytes, and readback
      time.
- [x] Add debug counters for buffers, textures, canvases, devices, and active
      jobs.

Gate:

- [x] Repeated load/switch/clear does not leak canvases.
- [x] Repeated load/switch/clear does not leak GPU buffers or textures.
- [x] Repeated PSNR requests do not leak render targets.
- [x] Device loss produces clear UI state.
- [x] SparkRenderer is not constructed before an initialized Spark `SplatMesh`
      has committed for one animation frame.
- [x] Large-cloud adapter-limit failures produce clear UI state and do not
      strand Spark in a broken renderer state in browser E2E.
- [x] Readback byte count remains tiny.

### Phase 9: Bicycle Dataset Validation

Dataset:

```text
C:\Users\HEQ\Projects\colmap_webview\360_v2\bicycle
```

Opt-in local command:

```powershell
$env:COLMAP_WEBVIEW_BICYCLE_DATASET='C:\Users\HEQ\Projects\colmap_webview\360_v2\bicycle'
$env:COLMAP_WEBVIEW_WEBGPU_CHANNEL='chrome'
npx playwright test e2e/webgpu-bicycle.spec.ts --project=chromium-webgpu-bicycle --reporter=line --workers=1
```

Latest local result:

- 2026-06-05: the bundled-Chromium bicycle gate skipped during the elevated
  `requestDevice({ requiredLimits })` preflight with Dawn/D3D12 reporting
  `DynamicLib.Open: dxil.dll Windows Error: 87`; use the installed-Chrome lane
  below for local hardware validation on this machine.
- 2026-06-05: the same opt-in bicycle gate passed in installed Chrome via
  `COLMAP_WEBVIEW_WEBGPU_CHANNEL=chrome` in 47 seconds. It loaded
  `output/splat_30000.ply`, reached visible WebGPU first frame with elevated
  buffer limits, computed selected image 1 at full resolution
  (`4946x3286`, `validPixelCount=16252556`, PSNR about `17.37 dB`), used 2D
  reducer dispatch (`65535x4`) with 16-byte scalar readbacks, kept the visible
  scene within the pixel-diff threshold, and completed a second selected-image
  request while the viewer camera moved.
- 2026-06-05: after adding the fatal WebGPU console guard, the installed-Chrome
  bicycle gate passed again in 46.8 seconds. This run explicitly verified that
  the prior default-limit failure mode did not appear: no oversized buffer or
  storage-binding validation messages, no invalid WebGPU buffer or bind group,
  and no visible WebGPU runtime/render-session validation failure.
- 2026-06-05: after publishing `renderBackground` with every runtime PSNR
  metric, the installed-Chrome bicycle gate passed again in 47.8 seconds and
  asserted both selected-image metrics were computed with `opaque-black`
  `[0, 0, 0, 1]`.
- 2026-06-06: after adding the low-PSNR alternate-background diagnostic and
  serializing metric render/background mutations, the installed-Chrome bicycle
  gate passed again in 48.5 seconds. The gate still verifies no fatal
  large-cloud WebGPU validation messages appear, the visible scene remains
  isolated during PSNR, and any emitted background diagnostics identify opaque
  black as the baseline and opaque white as an evaluated alternative.

Optional tuning:

```powershell
$env:COLMAP_WEBVIEW_BICYCLE_IMAGE_ID='113'
$env:COLMAP_WEBVIEW_BICYCLE_MOVE_IMAGE_ID='114'
$env:COLMAP_WEBVIEW_BICYCLE_MIN_PSNR='15'
$env:COLMAP_WEBVIEW_BICYCLE_TIMEOUT_MS='900000'
```

Visible validation:

- [ ] Load with `?splatBackend=spark`.
- [x] Load with `?splatBackend=webgpu`.
- [ ] Load with `?splatBackend=auto`.
- [ ] Confirm the selected fallback splat is largest `.spz`, then largest
      `.ply`.
- [ ] Confirm splats align with points and frustums at identity transform.
- [ ] Confirm splats align with points and frustums after non-identity Sim3D.
- [ ] Confirm auto Spark-to-WebGPU swap has no blink.

The synthetic auto-backend lane samples nonblank scene-center frames through
the Spark-to-WebGPU handoff. This item remains open here for the bicycle
dataset specifically.

PSNR isolation validation:

- [x] Add opt-in E2E harness that captures visible viewer pixels before
      selected-image PSNR.
- [x] Add opt-in E2E harness that runs selected-image PSNR on the bicycle
      dataset.
- [x] Add opt-in E2E harness that captures visible viewer pixels after PSNR.
- [x] Add opt-in E2E harness assertion that viewer pixel drift stays under a
      tight threshold and no extra canvas is created during PSNR.
- [x] Add opt-in E2E harness assertion that fatal WebGPU large-cloud validation
      errors do not appear in browser console output.
- [x] Add opt-in E2E harness that moves/orbits the viewer camera during PSNR
      and confirms the request completes.
- [ ] Repeat PSNR requests and confirm only the latest publishes.
- [ ] Switch splat/dataset during PSNR and confirm old work is cancelled.

These two request-order/switch checks are still open for the bicycle dataset
specifically. The synthetic integrated app equivalents are covered in
`e2e/webgpu-psnr-app.spec.ts`.

Numerical validation:

- [x] Self-compare render returns `Infinity`.
- [x] One-pixel synthetic offset lowers PSNR.
- [x] Deliberate pose perturbation lowers PSNR sharply.
- [x] Selected bicycle image smoke validation produces a finite full-resolution
      PSNR with nonzero valid pixels on installed Chrome.
- [x] Add an optional independent `gsrender_gl` validation harness and dry-run
      it against the local bicycle dataset without loading the 1.24 GB PLY.
- [x] Limited independent-render smoke exercises PLY decode, COLMAP transform,
      render, image comparison, and PSNR plumbing without loading the full PLY.
- [ ] Good aligned bicycle images are generally in a documented plausible
      range for this trained splat and black-background metric assumption.
- [ ] Intentionally bad/misposed images score clearly lower.
- [ ] Compare at least one browser WebGPU render against a trusted offline
      render and document the expected delta.
- [x] Capture diagnostics for any visually aligned image below about 20 dB:
      mean RGB, valid coverage, render/source resolution, camera identity, GPU
      best-offset search, and explicit broad-background/exposure mismatch
      classification.
- [x] Store and expose the runtime PSNR render-background assumption with every
      published metric.
- [x] For low-PSNR metrics, rerender the isolated metric view on opaque white
      and expose baseline/alternate/best background candidates.
- [ ] Confirm the model training background matches the black-composite PSNR
      assumption or document the mismatch.

Gate:

- [x] Bicycle WebGPU visible rendering reaches first frame.
- [ ] Bicycle WebGPU visible rendering is visually aligned.
- [x] Bicycle selected-image PSNR smoke validation is numerically plausible.
- [x] PSNR work is invisible to the checked viewer surface on hardware WebGPU.
- [x] No checked scene-center blinking during PSNR on hardware WebGPU.
- [x] Camera motion does not cancel PSNR on hardware WebGPU.

### Phase 10: Release

Build/static gates:

- [ ] Clean checkout install.
- [x] `npx tsc -b --pretty false`
- [x] `npm run test:run`
- [x] `npm run build`
- [x] `git diff --check`
- [x] No unresolved build warnings.
- [x] Release/default build does not include `../../gsplat`.
- [x] Release/default build does not include live `@local-gsplat-webgpu`.
- [x] `SplatPsnrEvaluator*` has no static import of `gs-toolbox`.
- [x] `SplatPsnrEvaluator*` has no static import of `gaussianRenderer`.
- [x] `SplatPsnrEvaluator*` has no static import of `psnrSplatSession`.
- [x] `SplatPsnrEvaluator*` has no static import of `three` or CPU diagnostic
      helpers.
- [x] Evaluator-facing PSNR runtime files have no full-frame readback API use.

Renderer/backend gates:

- [x] Spark fallback policy works.
- [x] `.spz` WebGPU splats work.
- [x] `.ply` WebGPU splats work.
- [x] Visible WebGPU device creation requests cloud-specific
      `requiredLimits`.
- [x] Visible and metric WebGPU device creation verifies returned device limits
      before large buffer allocation.
- [x] Large SH clouds do not rely on default WebGPU portable buffer limits.
- [x] Bicycle `splat_30000.ply` reaches visible WebGPU first frame on hardware.
- [x] Adapter-limit failures are shown as WebGPU failure state without a stale
      canvas in component coverage.
- [x] Adapter-limit failures are shown as WebGPU unavailable/failure state
      without a stale canvas or Spark loading notification in mocked browser
      E2E.
- [x] `.splat` follows Spark policy or fails clearly under forced WebGPU.
- [x] Forced WebGPU fails visibly if unsupported.
- [x] Auto fallback behavior is documented and tested.
- [x] Visible readiness flips only after first valid frame.

PSNR gates:

- [x] Runtime PSNR is full GPU.
- [x] Runtime PSNR has no CPU fallback.
- [x] Runtime PSNR has no full-frame CPU readback.
- [x] Runtime PSNR reads back only scalar reduction data.
- [x] Full-resolution PSNR is preserved except texture-limit tiling.
- [x] Distorted cameras fail clearly until GPU undistort ships.
- [x] PSNR metric device can be upgraded from low default limits to
      cloud-specific required limits.
- [x] Real-device full-pipeline PSNR smoke validation passes.
- [ ] Bicycle numerical validation passes.

Isolation/lifecycle gates:

- [x] Synthetic app PSNR never appears in the visible viewer.
- [x] Synthetic app PSNR does not blink the checked render area.
- [x] Synthetic app camera motion does not cancel PSNR.
- [x] Bicycle PSNR never appears in the checked visible viewer surface.
- [x] Bicycle PSNR does not blink the checked scene-center render area.
- [x] Bicycle camera motion does not cancel PSNR.
- [x] Dataset/splat switch cancels PSNR.
- [x] Visible and metric device loss produce clear UI states.
- [x] Repeated load/switch/clear/PSNR does not leak resources.

Docs/release notes:

- [x] Document WebGPU capability and Spark fallback.
- [x] Document supported splat formats.
- [x] Document large-cloud WebGPU limit behavior: capable adapters request
      elevated limits; lower-limit adapters fail clearly until chunked storage
      buffers are implemented.
- [x] Document PSNR background, resolution, and color assumptions.
- [x] Document distorted-camera limitations.
- [x] Document hardware WebGPU validation requirement.

Latest release-gate evidence:

- 2026-06-06: after the low-PSNR alternate-background diagnostic and metric
  render queue landed, `npm run lint` passed.
- 2026-06-06: `npx vitest run src/splat/webgpu/cameraFrames.test.ts
  --reporter=dot` passed 8 tests, including non-browser analytic COLMAP
  qvec/tvec + Sim3D + tile-origin projection parity.
- 2026-06-06: focused WebGPU/PSNR/store/E2E-probe unit coverage passed
  7 files and 51 tests.
- 2026-06-06: `npm run build` passed.
- 2026-06-06: `npm run test:run` passed 404 test files and 2167 tests.
- 2026-06-06: `git diff --check` reported no whitespace errors; the output
  only included existing CRLF normalization warnings from the dirty worktree.
- 2026-06-06: the installed-Chrome bicycle WebGPU gate passed in 48.5 seconds
  with the local bicycle dataset and fatal WebGPU console guard enabled.
- 2026-06-06: after high-performance adapter selection landed,
  `npx vitest run src/splat/webgpu/webGpuSplatDevice.test.ts
  src/components/viewer3d/splatPsnrRuntime.test.ts --reporter=dot` passed
  2 files and 16 tests.
- 2026-06-06: after high-performance adapter selection landed,
  `npx vitest run src/splat/webgpu/webGpuSplatLimits.test.ts
  src/splat/webgpu/visibleSplatRendererAdapter.test.ts
  src/components/viewer3d/WebGpuSplatCanvasLayer.test.tsx --reporter=dot`
  passed 3 files and 28 tests.
- 2026-06-06: after high-performance adapter selection landed,
  `npm run build` passed.
- 2026-06-06: after high-performance adapter selection landed, the
  installed-Chrome bicycle WebGPU gate passed in 54.1 seconds with the local
  bicycle dataset and fatal WebGPU console guard enabled.
- 2026-06-06: `python scripts\validate-bicycle-gsrender-gl.py --dataset
  C:\Users\HEQ\Projects\colmap_webview\360_v2\bicycle --dry-run` parsed the
  bicycle COLMAP binaries as full-resolution `PINHOLE` (`4946x3286`,
  `fx=4649.505977743847`, `fy=4627.300372546341`), confirmed
  `splat_30000.ply` has 5,000,000 vertices, and found a usable system-Python
  `gsrender_gl` import path with CPU backend. This is harness evidence only;
  the trusted offline numerical render comparison remains open until a
  practical GPU/offline backend completes the render.
- 2026-06-06: `python -m py_compile
  scripts\validate-bicycle-gsrender-gl.py` passed.
- 2026-06-06: `python scripts\validate-bicycle-gsrender-gl.py --dataset
  C:\Users\HEQ\Projects\colmap_webview\360_v2\bicycle --images-dir images_8
  --limit-gaussians 1000 --backend cpu --output-render
  .tmp\bicycle-gsrender-limit1000.png` completed in 12.164 seconds. It used the
  new partial PLY memory-map path, rendered 1,000 gaussians, and produced a
  finite PSNR (`7.695 dB`). This is a plumbing smoke test only because it uses a
  downscaled source image and 0.02% of the splat.

## Pragmatic Release Sequence

1. Keep the current unit, build, lint, and installed-Chrome bicycle smoke gates.
2. Ship with explicit black-background PSNR diagnostics and unsupported-camera
   failures.
3. Use the independent harness only for lightweight metadata/smoke checks unless
   a trusted fast offline backend is available.
4. Defer full offline calibration, chunked-buffer portability, shared-device
   resource reuse, and all-image batching benchmarks.

## Deferred Work

- Removing Spark.
- Replacing Three.js controls, overlays, picking, or UI.
- Per-pixel depth interleaving between Three geometry and splats.
- PSNR downscaling for speed.
- Runtime CPU fallback for PSNR render, undistort, or reduction.
- Worker migration before the single-thread async service is correct.
- WebGPU `.splat` loading unless required by release scope.
- Further GPU debug diagnostics beyond the current low-PSNR scalar diagnostic
  paths.
- Fully portable chunked Gaussian/SH storage bindings for adapters that cannot
  expose the large monolithic limits needed by very large SH clouds.
