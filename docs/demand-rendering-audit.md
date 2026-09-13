# Conditional demand rendering audit

P7 implementation, 2026-09-12. This audit covers every application `useFrame` call found in `src/`, plus the scene's Drei and splat frame consumers. It establishes wake/continuation ownership; production measurements below establish observed idle behavior separately.

`useSceneRenderStoreFacade` selects continuous mode whenever rainbow or blink image selection is configured and the installed reconstruction contains selectable images, including before the first selection and after deselection. It also keeps a loaded splat of any backend (including a hidden or still-loading layer), active recording, orbit auto-rotation, visible blinking matches/rigs, or a detected floor plane's pulse continuous. Static-selection scenes and point-only reconstructions without images are demand-eligible when those other activities are absent. No animation setting or visible quality is changed to achieve idle. Broader backend demand rendering is intentionally deferred until backend-specific parity is measured.

| Consumer | Work and continuation policy |
| --- | --- |
| `useTrackballFrameLoop` | Runs at priority -2, before camera-dependent consumers. Interaction, held movement keys, angular/fly inertia, orbit zoom, and goto request subsequent frames until their existing mutation thresholds settle. Native events request the first frame. One final settling frame is retained. |
| `useSelectionAnimation` | Configured rainbow/blink image selection uses the explicit continuous fallback whenever selectable images exist, even without an active selection. Splat point overlays are covered by the loaded-splat fallback. Static colors run on the store/resource wake frame. |
| `BatchedFrustumLines` | Selected rainbow/blink and matched blink use the continuous fallback; static selection, hover, deletion, opacity, and color changes wake through store changes or React props. |
| `BatchedArrowMeshes` | Same selected/matched animation fallback. Hover/input and React commits wake static instance updates. |
| `FrustumPlaneSelectionBorder` | Selected rainbow/blink fallback; static border color/opacity update on the selection wake frame. |
| `CameraMatches` | Visible blinking matches with a selected image use continuous mode. Static line geometry/material changes use store/React wake. |
| `RigConnections` | Visible blinking rigs use continuous mode. Geometry, selection, and static styling use store/React wake. |
| `FloorPlaneWidget` | Every detected plane retains continuous mode for its always-on opacity pulse. No pulse is suppressed. |
| `Photosphere` | Updates lens uniforms, inside/outside visibility, opacity, and pointer gate from camera, resize/DPR, and pointer wake frames. It has no time-based animation. |
| `usePointPicking` | Pointer movement explicitly wakes; a throttled dirty pick schedules a shared deadline wake so its final pointer position is not lost. Camera movement re-dirties the active pointer. |
| `useFrustumPlaneViewAngleCulling` | Initial/options changes measure immediately. Camera position or group world-matrix changes are dirty; a shared 80 ms deadline completes delayed measurement even after controls stop. No frame-count threshold remains. |
| `useFrustumTextureCachePause` | Camera movement pauses speculative prefetch. A cancellable debounce timer resumes it without producing settle frames. Unmount releases the pause. Visible and selected jobs remain the cache queue's responsibility. |
| `FpsTracker` | Counts rendered frames and samples wall time on a timer, including zero FPS when settled. FPS store writes are excluded from scene wake subscriptions. The observer never requests a frame. |
| `useScreenshotRecordingFrameLoop` | All GIF/WebCodecs/MediaRecorder recording paths use the shared recording state and continuous fallback. Single screenshots already render explicitly through screenshot capture helpers. |
| `WebGpuSplatCanvasBridge` | Snapshot forwarding stays continuous under the loaded-splat fallback. Visible/local adapter parity is not claimed. |
| Spark layer/runtime | Existing `onDirty`/load invalidation remains; any loaded splat keeps the main canvas continuous because progressive runtime behavior remains backend-specific. |
| Drei `Billboard`/`Html` | Camera-facing labels and projected HTML refresh after the trackball update in the same frame. React commits, camera commands, pointer events, and resize/DPR changes request frames. These consumers do not require time-based continuation. |

The scene wake bridge subscribes to native canvas input (capture phase), keyboard/focus/resize/visibility, relevant domain stores, frustum-cache completion, and the page-level `requestSceneRender` signal. Canvas property commits retain Fiber's normal automatic invalidation. Imperative point color writes, decoded texture publication, camera commands, camera lifecycle effects, and asynchronous URL camera restore explicitly request a frame. FPS and saved current-camera/navigation-history reports are excluded to avoid observer feedback.

The activity facade lives inside the canvas. A layout effect updates Fiber's frame mode only when its live value differs from the requested mode, so activity changes do not rerender the Canvas owner. Observing the live value also restores required continuous activity if an unrelated Canvas configuration restores its static demand prop.

Trackball simulation uses a normal frame interval on the first frame after settling or visibility change. Goto start times are shifted by the hidden interval, preserving progress instead of jumping to completion. Subsequent frame deltas retain the existing 100 ms cap.

Tests cover transient continuation and settlement in orbit/fly, zoom, held keys including Space, goto and visibility return, dirty culling deadlines, deferred hover picks, native input capture, resource deadline coalescing, prefetch resume/unmount, FPS without wake feedback, and store-controlled fallbacks. The existing store boundary checks remain unchanged.

Production probe: `PERF_RENDER_IDLE=1 PERF_REPETITIONS=5 PERF_RUN=<unique-run> npx playwright test --config playwright.performance.config.ts e2e/performance/render-idle.perf.ts --workers=1` after `npm run build` and fixture generation. Use PowerShell environment assignments on Windows. Generated measurements and screenshots are written only under `.tmp/performance/render-runs/`.

The probe wraps actual WebGL draw calls without scheduling animation callbacks. A rendered frame is a distinct animation timestamp containing a draw from the scene canvas; draw-call totals are recorded independently. It measures a ten-second settled window and exercises wheel, orbit, held keyboard movement, goto, delayed image decoding/texture upload, and auto-rotation fallback. The actual browser renderer is recorded, and a software-GPU limitation is added only when that renderer indicates software rendering. The initial software probe did not establish hardware speed; the later hardware and recording checks below retain the same narrow demand gate.

## Narrowed gate after default-selection measurements

Earlier candidates with default rainbow selection did not pass the filtered first-selection regression gate. The quiet baseline first-selection scheduling proxy was 136.1 ms versus 188.8 ms in the integrated candidate; the subsequent combined compact-membership/child-frame-controller candidate remained worse at 219.0 ms. These comparisons are recorded in [performance-results.md](performance-results.md). The latter combined experiment did not confirm the hypothesis that moving mode changes out of the Canvas owner would resolve the regression.

The conservative gate therefore keeps selectable-image scenes continuous whenever rainbow/blink is configured, so their first selection does not switch from demand to continuous rendering. The image-count check uses the installed reconstruction shared by the gallery for worker and fallback loads. Static selection and point-only scenes retain demand mode. This change narrows the eligible scenes; its source alone does not establish that the first-selection regression is resolved. Default animated scenes have no claimed idle-render reduction. Subsequent first-selection comparisons are recorded separately in [performance-results.md](performance-results.md); the static-scene check below is a distinct gate.

## Earlier software production check with static selection

Five serial repetitions passed on the earlier frozen production build identified below, with static selection explicitly configured and heavy unit/lint jobs stopped during collection. Raw JSON and screenshots are in `.tmp/performance/render-runs/p7-final-direct/`. Every ten-second idle window contained exactly two rendered frames and nine draw calls, meeting P7's maximum of ten incidental frames per window. These are actual scene WebGL draw counts, not scheduled animation-callback counts. They apply to the static-selection fixture and do not establish default animated-scene idle behavior. The earlier `.tmp/performance/render-runs/p7-verified/` run is retained as historical evidence.

| Observation | Median | Minimum–maximum |
| --- | ---: | ---: |
| Idle window duration | 10,006.5 ms | 10,002.6–10,011.8 ms |
| Idle rendered frames | 2 | 2–2 |
| Idle draw calls | 9 | 9–9 |
| No-draw interval before delayed texture decode completed | 611.3 ms | 601.2–613.5 ms |

All five runs woke and continued for wheel zoom, orbit dragging/inertia, held W movement, and gallery goto, then settled. Each observed three bitmap decodes and nine texture-upload calls. A delayed decode completed after the scene stopped drawing, and its result uploaded and became visible. Auto-rotation kept producing frames while enabled and settled after disabling it. No page errors or console warnings/errors concerning detached/disposed resources or texture upload were observed. The controlled pink image plane and the final point-cloud screenshot were visually inspected and rendered correctly; this is a visual smoke check, not a pixel-diff certification.

The environment was Chromium 145.0.7632.6, ANGLE Vulkan SwiftShader, Windows 10.0.26200, Intel Core i7-12700K, 1280×720 viewport, and DPR 1. The binary fixture contained 10,000 points and 20 images (seed 42, fingerprint `cbf0d2f822b9fde8eef1d8c5f9d8377c67ecfe201d6b496d5f19860d3ea00f2f`). All five reports record production build SHA-256 `1da45a32cd617840f49f894e4027cda2746184f1346a90b11de31de8e9771af0`.

The browser command used `PERF_RENDER_IDLE=1`, `PERF_REPETITIONS=5`, and `PERF_RUN=p7-final-direct`, with `--workers=1 --max-failures=1`; all five tests passed in 2.4 minutes. The narrowed frame policy and controller passed 17 focused tests, focused lint, and typecheck before the combined build. Full integration validation is recorded in [performance-results.md](performance-results.md). Software rendering establishes the idle/wake gate for this controlled nonsplat scene; it does not establish a hardware frame-time improvement or extend demand mode to splats or recording. Touch, picking, visibility return, and the other audited continuations also have focused unit coverage.

## Hardware interaction parity

The opt-in `e2e/performance/interactions.perf.ts` checks actual production rendering without a development-only scene API. It observes uploaded point-cloud view/projection matrices and actual WebGL draws, projects parsed fixture points to locate real picking targets, and exercises the existing controls and export downloads. No observer-owned animation loop drives the application.

Four functional cases passed on Chromium 145.0.7632.6 with ANGLE D3D11 reporting NVIDIA GeForce RTX 4090. The 10,000-point, 20-image fixture, 1280×720 viewport, and DPR 1 match the idle probe. All reports identify production build SHA-256 `bce741e9caff3dc119eaf2b2a67fe5f9a3e89dd99a6716ea51f8728e880a60c3`. Raw case reports and exported artifacts are in `.tmp/performance/interaction-runs/hardware-interactions/`.

| Case | Observed result |
| --- | --- |
| Static point hover and picking | A real pointer move produced the one-point hover draw; two clicks advanced the picking UI from P1 to P2 to a positive distance. Cancel returned to the static scene. |
| PNG export | The actual downloaded PNG decoded at 512×512 and contained 8,986 colorful scene pixels outside the watermark strip. Visual inspection confirmed the point cloud, camera frustums, and grid were intact. |
| Configured animated-selection fallback | Before first selection, after selecting an image, and after Escape, 700 ms windows contained 43, 43, and 42 drawn frames respectively. |
| Native touch controls | Trusted browser touch input changed the rendered rotation, retained inertia after release, and separately changed translation for pinch and pan without rotation. Cancellation was delivered and the scene settled. All 38 recorded touch events were trusted. This is browser-emulated touch, not a physical device test. |
| WebM recording fallback | The existing Record control generated a playable 45,822-byte WebM. Its decoded frame was 223×180 with 2,347 colorful scene pixels; duration was 4.897 s for the five-second setting. The static scene drew 61 frames during a one-second recording window and settled again afterward. |

Visibility return is explicitly unverified in this headless browser. Native window minimization and bringing a real second tab to the foreground both left `document.visibilityState` as `visible`. The test records that limitation and skips before asserting animation parity; it does not replace `document.hidden` or dispatch a synthetic visibility event. The opt-in headed mode (`PERF_INTERACTION_HEADED=1`) permits a later native capability check. GIF and MP4 were not exercised in this bounded run; WebM is the verified recording path.

Run with `PERF_GPU=hardware`, `PERF_BROWSER_CHANNEL=chromium`, `PERF_DIST=dist`, `PERF_INTERACTIONS=1`, `PERF_RECORDING_FORMATS=webm`, and `PERF_RUN=hardware-interactions`, then `npx playwright test --config playwright.performance.config.ts e2e/performance/interactions.perf.ts --workers=1 --max-failures=1`. These functional checks do not measure GPU presentation latency or certify visual equivalence for every dataset or codec. No page errors or captured texture/disposal/encoder warnings occurred.

## Hardware static idle and wake check

Five serial repetitions of the existing idle probe passed in 2.4 minutes on the same `bce741e9caff3dc119eaf2b2a67fe5f9a3e89dd99a6716ea51f8728e880a60c3` build and RTX 4090 D3D11 renderer. Other heavy tests and benchmarks were paused. Raw reports and screenshots are in `.tmp/performance/render-runs/hardware-idle/`; the fixture, viewport, DPR, browser, CPU, and OS are recorded in every report.

| Observation | Median | Minimum–maximum |
| --- | ---: | ---: |
| Idle window duration | 10,008.8 ms | 10,003.7–10,013.1 ms |
| Idle rendered frames | 2 | 2–2 |
| Idle draw calls | 9 | 9–9 |
| No-draw interval before delayed texture decode completed | 599.7 ms | 589.7–608.0 ms |

Every run woke for wheel, orbit/inertia, held-key movement, gallery goto, and delayed texture completion, then settled. Auto-rotation retained continuous frames until disabled. Each run observed three bitmap decodes and nine texture-upload calls; no captured resource/texture warnings or page errors occurred. `0-texture.png` visibly contains the expected solid pink image plane, and `0.png` contains an intact colored point cloud. Both were visually inspected; this remains a controlled smoke check rather than general pixel equivalence.

Run with `PERF_GPU=hardware`, `PERF_BROWSER_CHANNEL=chromium`, `PERF_DIST=dist`, `PERF_RENDER_IDLE=1`, `PERF_REPETITIONS=5`, and `PERF_RUN=hardware-idle`, then `npx playwright test --config playwright.performance.config.ts e2e/performance/render-idle.perf.ts --workers=1 --max-failures=1`. This establishes the static nonsplat idle/wake gate on this hardware, including asynchronous texture upload. It does not establish GPU presentation latency or an idle reduction for configured animated-selection scenes, recording, or splat backends, which retain continuous rendering.
