# Native Three.js Gaussian-splat migration plan

Status: proposal, 2026-09-06. Replaces the proposed PlayCanvas direction; no runtime or dependency changes made.

## Recommendation and verified constraints

Evaluate native Three.js GaussianSplat before adding a second engine. This repository uses Three.js 0.182.0; npm currently reports 0.185.1, and the r185 source tree does not contain GaussianSplat. The feature exists on upstream dev, inspected at commit 1091c70369e47728e0b951ad0ced066e0173588e. Pin an exact tested revision for the prototype; prefer a stable release containing it for production. Do not mix dev addons with the installed older core.

GaussianSplat explicitly requires WebGPURenderer. Its forceWebGL backend is supported; the existing WebGLRenderer is not. Native support therefore does not make this a drop-in replacement for Spark in the current R3F canvas.

The repository already owns a WebGPU splat rasterizer, Gaussian cloud loader, and metric pipeline. Replace Spark's compatibility role first. Preserve the existing WebGPU renderer and PSNR/SSIM behavior while evaluating the new native adapter. The historical “do not remove Spark” constraint in docs/splat-webgpu-migration.md is superseded by this requested migration; other behavior constraints remain applicable.

## Ownership boundary

Proposed interpretation of repo-owned: the app owns the data contract, loading/selection, transforms, feature state, cancellation, scheduling, capture, metrics, capability policy, errors, and tests. Three.js supplies the low-level renderer, sort primitive, and supported addon APIs. If owning the actual sorting and rasterization source is required, use a separately reviewed vendored implementation with license/provenance and upgrade policy; this is a larger maintenance commitment.

Keep engine objects inside src/splat/three/. React components and stores consume repository interfaces and never import GaussianSplat directly. Establish repository-owned GaussianCloud types instead of publicly aliasing the gs-toolbox type; keep decoder compatibility in an adapter. Separate generic decoding from WebGPU-specific packing currently invoked by gaussianCloudLoader.ts.

## Execution sequence

| Phase | Detailed scope / owned files | Acceptance gate | Suggested executor / effort |
| --- | --- | --- | --- |
| 0. Baseline | Record Spark and repo-WebGPU outputs for existing PLY/SPZ fixtures, SH0–3, transforms, camera modes, capture, memory, startup and camera-motion timing. Inventory all Spark imports and live callers, including the apparently unused sparkPsnrSession. | Reproducible baseline and supported-feature matrix; no assumptions that file-extension parity implies format-version parity. | Graphics engineer / high |
| 1. Feasibility spike | Isolated checkout; pin matching Three core/addons revision. Construct GaussianSplat from repo-decoded GaussianCloud using an adapter. Test WebGPU and forceWebGL explicitly. | Both backends render supported fixtures; camera, covariance, quaternion, opacity and SH conventions verified. No monkey-patching renderer internals. | Graphics engineer / xhigh |
| 2. Integration decision | Prototype a separate native Three WebGPURenderer canvas using existing WebGpuSplatCanvasLayer camera/composition patterns. Also assess a unified R3F WebGPURenderer scene. Audit custom ShaderMaterial, lines, image shaders, picking, postprocessing and capture before choosing unified migration. | Document canvas/depth limitations. Separate canvases cannot share a depth buffer: accept overlay semantics explicitly or choose a unified renderer migration. Do not silently change Spark scene occlusion. | Architecture + graphics / xhigh |
| 3. Repo adapter | Add src/splat/three/{nativeSplatAdapter,gaussianGeometryAdapter,nativeSplatCapabilities}.ts and a renderer-neutral visible-session contract. Keep one frame snapshot source and render-on-demand ownership. | Abort obsolete loads; first-frame readiness; deterministic disposal; no stale frames after dataset switch; no idle render loop. | Implementation engineer / high |
| 4. Feature parity | Wire splat selection, visibility, committed/model/pending transforms, camera sync, resize/DPR, background and alpha. Update screenshotCapture/recording composition through an adapter, not backend-specific DOM queries. | Screenshots and recordings contain splats and overlays at the requested resolution without gamma/alpha shifts or tearing. Orbit/orthographic modes and existing picking semantics pass. | Viewer engineer / high |
| 5. Metrics and policy | Preserve src/splat/webgpu metric sessions and camera capability gates; decouple evaluator eligibility from visible backend identity only with numerical evidence. Update splatBackendPolicy, store, status notices, progress types and URL parsing. | PSNR/SSIM do not silently change renderer, precision, resolution or unsupported camera behavior. Visible and metric sessions never mutate each other. Legacy ?splatBackend=spark maps to the new compatibility backend with documented behavior. | Graphics/metrics engineer / xhigh |
| 6. Cutover | Replace Spark lazy import and Vite vendor chunk; remove @sparkjsdev/spark after import/call-graph audit. Update notices/docs/tests and packaging checks. Pin the validated version. | Clean install/build; no Spark runtime imports or bundled chunks; native renderer remains lazy; old URLs work; rollback possible by reverting the release commit. | Release engineer / high |

Phases are execution packets, not instructions to launch agents. Use one integrator; independently assigned work must have explicit file ownership.

## Native adapter contract

- loadCloud(cloud, {signal, onProgress}): decode ownership stays outside the renderer; report upload and first-frame stages separately.
- setFrame(snapshot): immutable view/projection/model matrices, dimensions and background; explicitly document coordinate, clip-space, unit and color conventions.
- render(): scheduled by the repository, including asynchronous-sort completion invalidation on the WebGL path.
- capture(frame): await readiness and correct ordering; return a defined color/alpha surface for repository composition.
- dispose(): idempotent teardown of geometry, sort resources, GPU resources and listeners; in-flight load completion cannot revive a disposed session.
- capabilities: distinguish actual graphics backend, supported SH degrees, sorting mode, capture support and device failure. Do not equate the WebGPURenderer class name with GPU availability.

## Release gates

1. Run lint, all unit tests, build and affected browser suites on the exact pinned dependency graph. Verify React Three Fiber/Drei compatibility and one resolved Three.js copy.
2. Test PLY and every SPZ version used by repository fixtures; retain the repo decoder when upstream loaders do not cover older variants. Verify SH packing/quantization against the canonical floats.
3. Test very small, representative and largest supported clouds; measure peak memory, time to first frame and p95 camera-motion frame time against Phase 0. Proposed budget: no unexplained regression over 10%; calibrate per target hardware before adopting it as a gate.
4. Test switching datasets during decode/upload/sort, repeated mount/dispose, device/context loss, hidden tabs, resize, DPR and mobile rotation. No increasing resource count across repeated loads.
5. Pin representative image comparisons and inspect differences in sort ordering, covariance projection, edge clipping, tone mapping and SH color. Do not assume pixel identity or PSNR interchangeability across rasterizers.
6. Exercise both native WebGPU and forced WebGL on supported Chrome/Firefox/WebKit profiles. Device emulation does not replace real iOS/Android validation.
7. Remove Spark only after compatibility-path parity. Keep repo-WebGPU metrics intact; do not remove it as incidental cleanup.

## Decision after the spike

Proceed if native rendering satisfies the required feature matrix and composition strategy without unstable private APIs. If not, retain the current production renderer while documenting the blocker. Choose between waiting for a stable Three release, a pinned/vendor-maintained addon, or revisiting PlayCanvas based on measured failures—not assumed API equivalence.

## Sources

- Upstream implementation and renderer constraint: https://github.com/mrdoob/three.js/blob/1091c70369e47728e0b951ad0ced066e0173588e/examples/jsm/objects/GaussianSplat.js
- Contributor announcement and merged-dev status: https://discourse.threejs.org/t/native-gaussian-splatting-in-three-js-for-webgpu-renderer/93509
- Implementation background: https://ben3d.ca/blog/gaussian-splatting-for-threejs
- Stable releases: https://github.com/mrdoob/three.js/releases

Version and support observations above were checked on 2026-09-06; verify again before implementation.
