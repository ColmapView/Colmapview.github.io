# Performance validation follow-up

## Performance-only integration into main

The performance changes were transferred onto `main` at `19e822e` (v0.14.3), excluding agent-control commit `79cd547`. Main already contains the rig-frame corrections. No Agent UI, MCP bridge/scripts, agent commands/features, guide/entrypoint changes, or agent dependencies were transferred. The agent-only `trackballCommandController.ts` change was excluded; `TrackballControls.tsx` receives only render invalidation and interaction-state changes. Astra/max independently verified all 98 directly transferred tracked files, 77 new files, the already-released rig files, and the three manual control changes. All 30 agent-added paths are absent; the 13 agent-modified base files retain main's versions.

The **main-only production artifact is `43ff995a3cafcaf1af58ea71dcdef8562bbd14c373e1549595f18a59c5e01d99`**. Build, repository-wide ESLint and E2E TypeScript pass. Twelve production hardware cases pass (1.4 min): million-point loading/selection, media scheduling and replacement, picking/PNG, animated selection, touch controls, WebM recording, Spark/WebGPU at 100K/1M, and idle/wake behavior. Logs are in the original workspace `.tmp/performance/main-{build,lint,e2e-types,hardware}.log`; raw main reports are under `.tmp/performance-main/.tmp/performance/*/main-only-validation/`.

All **3399 applicable tests** pass: the full suite passed 3394 tests in 514 files (85.05 s), initially skipping five fixture-dependent tests in two files; those five then passed against the existing bicycle fixture (7.63 s). Logs: `main-full-unit.log` and `main-fixture-tests.log`. A fresh production-page check confirms the app mounts with zero Agent/Agent-controls buttons and zero page errors; its startup screenshot was visually inspected (`main-ui-check.log` and the isolated checkout's `.tmp/performance/main-ui/`). The lower test count relative to the historical branch is due to excluded agent-feature test files. No skip is counted as a pass without its separate completed check.

All build `8366…`, 3597-test and ABBA timing results below are **historical agent-branch validation**, not measurements of this main-only artifact. Main's checks establish transfer correctness; the one-run million-point smoke does not replace the historical timing matrix or establish performance equivalence between the two branch builds.

Updated 2026-09-12. This follow-up extends the software-rendered evidence in `performance-results.md`. The completed hardware comparison supports a substantial improvement on the measured million-point case: scene readiness median fell from 2241.0 to 1115.4 ms, and selection scheduling pooled p95 fell from 696.5 to 37.2 ms. These remain browser scheduling/readiness proxies, not GPU presentation-fence measurements. Completed validation and remaining limits are distinguished below.

**Build scope:** The latest selection/resource follow-up below uses `8366e094877ed02f8a17b6ddc1727c59bbe7aa705b88fbd7b2d4af6daa9f9134`. The earlier primary comparison against the original baseline uses build `7484a2877e499cd1fe5028235bad36feeec7b54d5cbad6c393a84ac63469616d`, including the fixes for gallery scrolling, cache recency and masked-thumbnail retention. Long-track, 5M and five-per-backend splat timings retain historical bce741-build evidence; they are not five-run validations of the latest build.

The first gallery fix prevents cache-array identity changes from retriggering selected-image scrolling, while preserving geometry-driven recentering through the primitive column count. A second fix makes snapshot scans inspect the File cache without updating LRU order, while actual consumers refresh recency. The integration owner reports independent Astra review of both fixes. Build `de1e135b9f360efa0880091acc7e3f4ce9ec39f2e80a1e3ad7b519e962ca6a97` supplies the process-memory diagnostics; subsequent build `826eb21ebad0da7d4689eec04d043aa767e54a06152c6c67d97fc344860074af` passes File revisits. The final masked-thumbnail implementation passes 3584 tests across 521 files in 135.56 seconds and builds successfully; completed final-build hardware retention and smoke evidence are recorded below. The measured `bce741…` production snapshot is preserved at `.tmp/performance/floor-fixed-dist`.

## No-regression verification of the final build

The requested verification rebuilt the current source and reproduced exact artifact `8366e094877ed02f8a17b6ddc1727c59bbe7aa705b88fbd7b2d4af6daa9f9134`. Fresh checks pass: **3597 unit tests / 524 files** (68.49 s), production build, global ESLint and E2E TypeScript. Logs are `.tmp/performance/no-regression-{build,lint,e2e-types,full-unit}.log`.

Before measuring, a fixed ABBA protocol was recorded in `.tmp/performance/no-regression-protocol.json`: five repetitions in each of four blocks, retained 7484 build → current 8366 → current 8366 → retained 7484. All **20 runs passed**, with no concurrent heavy jobs or diagnostic instrumentation. All samples are retained. Raw groups are `runs/no-regression-{a1,b1,b2,a2}/`; independently checkable aggregation is `no-regression-comparison.json` with its scratch script `summarize-no-regression.py`. Fixture, browser, hardware, configuration and artifact identities match across the groups.

| Proxy, ms: ten scenes per build | Retained 7484 median / p95 | Current 8366 median / p95 |
| --- | --- | --- |
| Selection (100 observations per build) | 27.6 / 28.6 | 26.9 / 28.5 |
| First selection | 27.9 / 42.4 | 27.2 / 29.4 |
| Later selection | 27.6 / 28.6 | 26.8 / 28.5 |
| Scene readiness | 725.8 / 740.9 | 730.5 / 757.7 |
| Cold startup | 301.0 / 358.2 | 308.3 / 325.2 |

The earlier 13.5% pooled-selection-p95 increase **did not reproduce** in this fixed comparison. Neither paired block comparison shows a >10% increase in the reported median/p95 metrics. Scene/startup medians rise 0.65%/2.43%; these small changes are not a claim of equivalence. The existing comparator's median convention is the upper middle observation for even sample counts; p95 uses nearest rank. Selection observations are clustered within ten scene loads, and first-selection p95 is the maximum of only ten observations. Astra/max independently checked every raw report and reproduced the aggregates and block comparisons. This supports **no regression detected in the checked workloads**, not a universal no-regression or compositor-presentation guarantee. All prior mixed/outlier results remain below; they have not been discarded or pooled into this protocol.

Fresh functional checks also pass: three production hardware cases for shared image/mask transfer limits and 429 recovery, obsolete-body cancellation on dataset replacement, and static idle/wake behavior (33.6 s); plus three real-worker browser workflows covering text/binary loading, observations, edits, export, and cancellation before snapshot installation (25.5 s). Logs: `.tmp/performance/no-regression-functional.log` and `no-regression-worker.log`. The earlier nine interaction/large-splat/idle checks retain the same verified 8366 artifact identity. No application changes were needed during this verification.

## Selection resource follow-up

Astra/max independently reviewed three further fixes: keep batched frustum geometry/materials alive across selection and opacity changes; omit the unused selected-point color array/attribute while preserving uniform color animation; and skip exact-zero-opacity basic plane materials while preserving mesh raycasting and texture arrival. Invisible plane geometry may still upload because Three updates objects before testing material visibility.

The first production build with these fixes is `81db6b5333ee0a6d0f245c35cd5a807b3def3b33325f4e5689497bc1b2c40fa0`. Diagnostic traces compare `.tmp/performance/runs/selection-diagnostic-before-v2/` (7484) with `selection-diagnostic-after/` (81db). First-selection new programs fell 5→2; `bufferData` calls/bytes fell 13/496384→5/24176, while `bufferSubData` rose 3/320000→5/576000. Combined recorded upload bytes fell 816384→600176 (26.5%). Shader-info inspection waits fell 25.2→13.2 ms, and the two-RAF proxy fell 54.0→32.2 ms. These are instrumented single-run diagnostics, not timing gates. The overlay fence observes submitted GPU completion, not compositor presentation. Later selections still relink the border material (roughly 1–2 ms); overlay compilation is reused.

The matching quiet five-plus-five comparison is `.tmp/performance/selection-resources-comparison.json`, with raw `selection-resources-before` and `selection-resources-after` groups. First-selection median/max was 30.4/44.7→29.4/30.8 ms; pooled median/p95 was 27.0/30.4→29.6/30.9 ms; later median was 26.9→29.6 ms (+10.04%). Scene readiness was 869.2→763.9 ms and startup 329.3→307.2 ms. This mixed result does not establish that every selection improved. The retained-before reports have the correct measured 7484 build fingerprint, but their ancillary `identity` field mistakenly references the original baseline patch because the harness matched a directory-name substring. The harness now identifies the original baseline by exact resolved path and reports other retained builds separately; the measured build fingerprint is authoritative for this group.

Shader warmup remains deferred. It must retain program owners, preserve shader error checking and handle pending `compileAsync` cleanup; transparent double-sided plane compilation also requires waiting for both face variants.

The subsequent range patch produces build `8366e094877ed02f8a17b6ddc1727c59bbe7aa705b88fbd7b2d4af6daa9f9134`. Animated-only frustum color/alpha updates now upload the changed 48/16 float components per camera; pending partial updates accumulate and a pending full update remains full until consumption. Initial upload cleanup and shared interleaved endpoint ownership are tested against Three's actual `WebGLAttributes`. Astra/max reviewed the implementation and tests without blockers. The complete suite passes **3597 tests in 524 files** (75.11 s), with production build, global ESLint and E2E TypeScript checks passing; logs are `.tmp/performance/selection-final-*` and `selection-ranges-build.log`.

Final diagnostic `.tmp/performance/runs/selection-ranges-diagnostic/` confirms an animated-only update for one camera uploads 192+64=256 bytes instead of 192000+64000=256000 bytes for the 1000-camera fixture (99.9% fewer bytes for that update). Actual selection changes still upload full style buffers. Selection 2/3 recorded 24176 `bufferData` bytes plus 320256 `bufferSubData` bytes, versus 816384 combined bytes before these fixes. The probe accounts WebGL2 source offsets/counts. This final instrumented run recorded a slower first-selection proxy of 68.6 ms and shader-log waits of 24.6 ms; tracing/profiling/fence observations are diagnostic, not a quiet latency guarantee. Preserve that result alongside the earlier faster diagnostic rather than claiming a universal 32 ms first selection.

The final fresh quiet pair, `.tmp/performance/runs/final-selection-before/` and `final-selection-after/`, has five repetitions per build (7484→8366), the same million-point fixture/settings/hardware, corrected retained-build metadata, and no concurrent heavy jobs. Comparison: `.tmp/performance/final-selection-comparison.json`.

| Scheduling/readiness proxy, ms | Before | Final |
| --- | --- | --- |
| Selection median / pooled p95 | 26.9 / 28.9 | 26.4 / 32.8 |
| First-selection median / p95 (maximum of five) | 28.8 / 42.2 | 27.6 / 40.1 |
| Later-selection median / p95 | 26.8 / 28.7 | 26.3 / 28.9 |
| Scene readiness median / p95 | 796.4 / 963.9 | 787.3 / 1078.1 |
| Cold startup median / p95 | 311.8 / 363.7 | 321.0 / 412.5 |

Median selection and scene timing do not regress, but pooled selection p95 rises 13.5% (3.9 ms); scene/startup tails also worsen in this small sample. Resource/upload reductions are established; consistent tail-latency improvement is not. The earlier intermediate comparison remains above, including its later-selection median regression. These bounded comparisons do not justify a blanket claim that every latency gate improved, and no additional repetitions were run merely to obtain favorable numbers.

Astra/max checked the final raw distribution: the three largest selection values (40.1, 33.8, 32.8 ms) occur in one final repetition, which also has the worst scene readiness. That concentration does not establish an external cause and the repetition remains included. This pair does not establish a repeatable regression, but its observed tail regression remains an acceptance limitation.

Final 8366 hardware functional validation passes **eight cases in 48.1 s**: picking/PNG export, animated selection, CDP touch controls, playable WebM recording, and Spark/WebGPU at 100K and 1M splats. Raw reports are `.tmp/performance/interaction-runs/selection-final-hardware/` and `large-splat-runs/selection-final-hardware/`; all four splat reports match the final build hash and record no page errors. The separate idle/wake case passes in 30.5 s, observing two rendered frames/nine draw calls over 10005.6 ms and valid interaction/delayed-texture wakeups (`render-runs/selection-final-idle/`). Logs: `selection-final-hardware.log` and `selection-final-idle.log`. Previously unsupported native visibility return is not counted as run/passed here. These checks do not expand the prior cross-backend parity, physical-touch, GIF/MP4, or exact memory/presentation claims.

## Hardware comparison: verified evidence

Independently aggregated all five baseline and five current JSON reports, checking repetition IDs 0–4, fixture fingerprint, build hash, browser, renderer, binary format, filter state, and rig state across every sample. Both runs use the same 1M-point/1K-image, track-length-2 fixture, seed 42, unfiltered, binary, without optional rigs. Fixture SHA-256 is `92a9c8f577cf7806dbf9ec6ef86566072af72c810aa53e95a713e0dbbd08ecf1`.

| Identity | Value |
| --- | --- |
| Baseline build | `2838d1a7324d13a4c10d950dc3de84fd08cc85bd99fdbd839a24cef77187665d` |
| Final current build | `7484a2877e499cd1fe5028235bad36feeec7b54d5cbad6c393a84ac63469616d` |
| Browser in both timing groups | Chromium 145.0.7632.6, headless |
| Reported renderer in every timing sample | ANGLE NVIDIA GeForce RTX 4090, Direct3D11 |
| CPU / OS | Intel Core i7-12700K, 20 logical CPUs / Windows 10.0.26200 |
| Viewport / DPR | 1280×720 / 1 |
| Raw timing groups | `.tmp/performance/runs/final-paired-baseline-million`, `.tmp/performance/runs/final-paired-current-million` |

The independent audit checks identities recorded by the harness and their agreement with fixture metadata; it did not reread/hash the large binaries during another owner's timing runs. Each report's build hash was generated by the harness from production JS/HTML/CSS/WASM paths and bytes. The baseline/current source commit is unchanged with different working-tree/build contents, so the build hashes are the relevant artifact identities.

| Metric | Baseline | Current | Median change |
| --- | --- | --- | --- |
| Scene readiness proxy median, ms | 2241.0 | 1115.4 | −50.2% |
| Scene readiness proxy min–max, ms | 2197.4–2730.8 | 1066.7–1307.1 | |
| Selection scheduling median, ms | 506.4 | 25.0 | −95.1% |
| Selection scheduling pooled p95, ms | 696.5 | 37.2 | |
| First-selection median / p95, ms | 478.6 / 613.6 | 37.2 / 58.5 | −92.2% median |
| Later-selection median / p95, ms | 506.4 / 696.5 | 24.8 / 28.8 | −95.1% median |
| Load blocking duration median, ms | 1714 | 539 | −68.6% |
| Load blocking min–max, ms | 1657–2138 | 485–707 | |
| Load long-task count median | 2 | 1 | |
| Empty cold startup proxy median, ms | 407.7 | 437.4 | +7.3% |
| Initial compressed JS body bytes | 613,052 | 612,407 | −0.11% |

Scene readiness is local drop dispatch to the first gallery label plus two animation callbacks. Selection is an in-page gallery-label click followed by two animation callbacks. Each group has five scene samples and fifty selections (ten per scene); p95 uses nearest rank over the stated sample set. First-selection p95 is computed over only five values, so it is their maximum. The fresh matched pair has pooled selection p95 37.2 ms and later-selection p95 28.8 ms, but first-selection p95 is 58.5 ms; not every selection meets 50 ms, and exact selection-to-GPU-present latency remains unmeasured.

Coarse page heap-at-ready median was 341.9 MB baseline and 150.2 MB current. This excludes worker/process/GPU totals and is not peak memory; it does not establish a total-memory reduction. Scene/selection improve substantially against baseline. Fresh paired startup is 7.3% slower (+29.7 ms), below the 10% investigation trigger, with overlapping baseline 394.7–494.5 ms and current 385.1–475.0 ms ranges. The bounded investigation is closed with a qualified outcome: the earlier >10% startup difference was not reproduced, but no startup speedup or universal sub-50-ms selection guarantee is established. Compressed initial JS is still 645 bytes smaller than baseline, so the added ownership code leaves only a 0.11% net saving. This does not certify unmeasured datasets, backends, or interaction modes.

Reproduce aggregation without launching a browser:

```powershell
node scripts/performance/compare.mjs final-paired-baseline-million final-paired-current-million
```

For a new hardware run, set `PERF_GPU=hardware`, `PERF_DIST` to the intended production snapshot, a unique `PERF_RUN`, `PERF_FIXTURE=million`, `PERF_FILTERED=0`, `PERF_FORMAT=bin`, `PERF_RIGS=0`, and `PERF_REPETITIONS=5`, then run `npx playwright test -c playwright.performance.config.ts baseline.perf.ts --workers=1`. In PowerShell use `$env:NAME='value'`. Keep jobs sequential and inspect the recorded renderer; the flag alone is not hardware evidence.

The superseded `hardware-current-million` group on historical `bce741…` recorded scene median 1229.3 ms and pooled selection p95 42.7 ms. The final-build values above replace those earlier headline results; the final matched pair supplies its own pooled result.

The first final-build group is preserved at `runs/final-hardware-million`, compared against the earlier `runs/hardware-baseline-million`. It recorded baseline/current scene medians 2785.4/1297.8 ms, startup 488.2/552.3 ms (+13.1%; ranges 418.3–493.0/462.7–578.6), and pooled selection p95 841.1/55.4 ms. Both baseline and current changed materially in the fresh paired session; this supports session variability rather than attributing the earlier startup difference to the ownership changes. The fresh paired groups are not pooled with or substituted for the preserved first group when describing spread. The primary table uses the deliberately matched follow-up, whose aggregation is also saved in `.tmp/performance/final-paired-million-comparison.json`.

## Final exact-build hardware smoke checks

The integration owner reports five final-build smoke cases passed in 41 seconds (two media, one render and two splat), following five million-point runs passed in 32 seconds. Final renderer report `.tmp/performance/render-runs/final-hardware-smokes/0.json` matches `7484a287…`: two rendered frames/nine draws over 10014.1 ms idle; wheel/orbit/keyboard/goto wake checks pass, with three decodes/nine texture uploads and a 595.7 ms no-draw gap before delayed decode.

The two `.tmp/performance/splat-runs/final-hardware-smokes` reports match the final hash and have no errors. Spark produces its actual instanced draw (881.1 ms proxy); WebGPU reaches ready-canvas state (258.0 ms) with a successfully created nonfallback NVIDIA/Lovelace device. These single-run functional smokes do not replace the historical five-per-backend timing comparison or establish a final splat regression gate.

The final media scheduler client report `.tmp/performance/media-runs/scheduler-1789230603288-client.json` records peak four active requests and zero remaining. After receiving 429 headers, the affected URL retries 1001 ms later; the owner reports the fault-handling and cancellation cases both pass. The integration owner confirms final global lint, E2E TypeScript checking and diff checks all exit successfully.

## Hardware capability and correctness checks

`.tmp/performance/hardware-probe.json` contains successful probes for installed Chrome 152.0.7977.83 and bundled Chromium 145.0.7632.6. Both report the RTX 4090 through ANGLE D3D11 and an NVIDIA/Lovelace WebGPU adapter. A GPU compute probe returned the expected value 42. The GPU inventory reports NVIDIA driver 32.0.15.9579. This establishes available hardware WebGL and a working WebGPU compute path; it is **not** an application splat-rendering, PSNR, or memory-retention test.

The latest correctness log `.tmp/performance/masked-retention-full-unit.log` records **521 test files and 3584 tests passed in 135.56 s**. `.tmp/performance/masked-retention-build.log` records a successful production build in 12.49 seconds. The earlier `.tmp/performance/gaps-final-unit.log` recorded 518 files/3567 tests in 107.77 seconds before the follow-up gallery/thumbnail fixes. This verifies the logged unit-suite outcome, independently of the hardware timing assertions. Additional earlier worker/export/ownership tests are documented in `performance-results.md`; this follow-up does not treat their mocks as hardware validation.

## Long-track native-file comparison

Five completed reports per group in `.tmp/performance/runs/hardware-native-baseline-million-long` and `hardware-native-current-million-long` use `nativeFiles: true`, baseline 2838d1… and historical current bce741… build hashes, RTX 4090 D3D11, and the validated `million-long` fingerprint below. Trace and process-memory instrumentation are disabled in these timing rows. This is a matched native filesystem-backed File comparison; do not pool it with the earlier million-point **in-memory File** comparison. Initial synthetic dense-input trials failed with `NotReadableError`; those were invalid input-delivery trials, not valid application timing results.

| Native long-track metric | Baseline | Current |
| --- | --- | --- |
| Scene readiness median, ms | 14582.9 | 8094.6 (−44.5%) |
| Scene readiness min–max, ms | 14148.6–14625.5 | 8078.4–8316.9 |
| Selection scheduling median / pooled p95, ms | 361.9 / 458.4 | 29.3 / 33.0 |
| First-selection median / p95, ms | 360.5 / 402.8 | 33.0 / 48.8 |
| Later-selection median / p95, ms | 361.9 / 458.4 | 29.2 / 30.6 |
| Load blocking median, ms | 13820 | 302 (−97.8%) |

The 16-observation tracks remain computationally substantial: current readiness is still about eight seconds despite much less main-thread blocking. The coarse page-heap snapshot fell from about 1279.0 to 267.1 decimal MB; worker/process totals are excluded, so this does not establish total-memory reduction. No >10% scene/selection regression is observed in this matched pair.

## Five-million-point native-file comparison

The complete groups `.tmp/performance/runs/hardware-native-baseline-large` and `hardware-native-current-large` contain five native-file repetitions each, with baseline 2838d1…/historical current bce741… builds and matching browser/RTX 4090 identities and the validated 5M-point/5K-image, track-length-2 fingerprint below. These timing rows have trace and process-memory instrumentation disabled. The integration owner reports all ten cases passed (baseline about 3.3 min, current 43.7 s).

| Native 5M metric | Baseline | Current |
| --- | --- | --- |
| Scene readiness median, ms | 8482.8 | 4731.3 (−44.2%) |
| Scene readiness min–max, ms | 8333.8–9335.3 | 4703.3–5394.4 |
| Selection scheduling median / pooled p95, ms | 2629.7 / 2946.4 | 29.1 / 32.1 |
| First-selection median / p95, ms | 2686.2 / 2946.4 | 32.1 / 50.6 |
| Later-selection median / p95, ms | 2616.4 / 2862.4 | 28.8 / 30.9 |
| Load blocking median, ms | 7783 | 2951 (−62.1%) |

No >10% scene/selection regression is observed in this matched pair. The current pooled selection proxy is below 50 ms, but its five-sample first-selection maximum is 50.6 ms; do not claim every interaction met that threshold. Current loading still produces roughly three seconds of main-thread blocking, so moving parsing off-thread does not eliminate installation/rendering work. Page-heap-at-ready median was 1592.9 MB baseline versus 709.1 MB current, excluding worker/process totals. The separate instrumented large-load process-memory comparison below must not be pooled with these timing rows.

## Five-million-point process-memory diagnostic completed

Independently aggregated `.tmp/performance/memory-runs/hardware-memory-{baseline,current}-large/large-1.json`. These are one completed diagnostic run per build, matching the validated 5M fixture fingerprint and Chromium 145.0.7632.6. Baseline is `2838d1…`; current is the gallery-fixed `de1e135…`, unlike the earlier quiet timing build. The corresponding `runs/hardware-memory-{baseline,current}-large/large-0.json` records confirm native Files, process-memory instrumentation enabled, and tracing disabled. The integration owner reports both tests passed.

| Maximum observed allocation sample, MiB | Baseline | Current |
| --- | --- | --- |
| Summed CDP-owned process CPU private commit | 2945.3 | 2329.7 |
| Summed process working sets | 2884.5 | 2305.8 |
| OS GPU dedicated allocation counter | 289.0 | 174.3 |
| OS GPU shared allocation counter | 122.5 | 120.6 |
| OS GPU total-committed counter | 412.2 | 295.6 |

Baseline contains 31 samples over 66.1 seconds; current contains nine over 19.1 seconds, spanning startup, loading and selection. GPU counters were available in every sample. These measurements cover the browser's CDP-enumerated OS processes, including renderer and GPU-process CPU allocations, rather than page heap alone. They do **not** isolate worker/WASM allocations or establish instantaneous peaks: sampling has gaps, unequal observation windows, and process/counter reads are not simultaneous. Working-set sums can double-count shared pages. GPU counters describe OS/driver allocations, not exact physical VRAM; neither their independently observed maxima nor CPU/GPU totals should be added together. The lower observed maxima are diagnostic evidence from one run each, not a repeated peak-memory guarantee. Process sampling perturbs driver timing, and the timing comparator excludes these instrumented rows.

## Hardware retention: three aligned cycles completed

Independently checked all phases in `.tmp/performance/memory-runs/hardware-retention-aligned/report.json`. This completed run supersedes the earlier `hardware-retention` run with a sampling race. It uses current build `bce741…`, Chromium 145/RTX 4090 D3D11, 1100 distinct image URLs with identical deterministic 128×128 PNG pixels, and fully awaited cycle boundaries. The owner reports the test passed in 1.5 min and visually checked textured screenshots; the raw report has no page/texture errors.

| Phase | Live bitmaps / RGBA bytes | Native WebGL texture handles |
| --- | --- | --- |
| Active planes, each of three cycles | 1100 / 68.75 MiB | 1104 |
| Released planes, each of three cycles | 1024 / 64 MiB | 1028 |
| Same-page dataset switch | 0 / 0 | 4 base handles |

This demonstrates a repeated plateau at the 64 MiB **inactive decoded-bitmap** budget and releases owned resources on dataset replacement. Active pinned demand correctly exceeds that inactive budget. The displayed inactive GPU estimate was 85.3 MB (including the mip estimate), below its separate 128 MiB candidate budget; this fixture does not independently overflow that GPU budget. URL-image File retention was only about 1.80 MB because the display files are compressed; the separate File-pressure test below supplies the encoded-budget evidence.

The separate File-pressure test now **passes three full gallery traversals** on build `826eb21…`, recorded in `.tmp/performance/file-runs/cache-revisit-fixed/report.json`. Independently checked the hash, empty error array, all three 1100-image coverage checkpoints and cache samples. The 1100 valid PNG masks are 163,840 bytes each, totaling 171.875 MiB of unique encoded mask input. Each traversal takes eight scroll steps (26.1, 30.8 and 29.2 seconds). Retained display/mask Files total exactly 134,097,930 bytes (127.8858 MiB) after each cycle, 134,118,486 bytes after returning to the selected image, and zero on same-page replacement. The owner verifies ordinary card selection of image 00007, a valid 3D plane and successful refetch of its evicted mask. This supersedes the earlier placeholder/revisit failure.

That earlier File test exposed masked-thumbnail entries increasing from 1100 to 2200 to 3300, then 3492 on return. Its UI byte estimates were not actual Blob sizes. The subsequent 64 MiB inactive thumbnail budget uses actual Blob bytes; mounted-consumer leases preserve active/retired URLs, WeakMap identities track Files, and stale-load ownership plus partial-decode cleanup are covered. Independent Astra review is clean, and the final high-entropy hardware test below supersedes the earlier unbounded-thumbnail result.

## Final encoded-File and derived-thumbnail retention: passed

Independently inspected `.tmp/performance/file-runs/hardware-file-and-derived-bounded/report.json`, build `7484a2877e499cd1fe5028235bad36feeec7b54d5cbad6c393a84ac63469616d`. The owner reports a 2.2-minute hardware pass. All three traversals cover 1100 names in eight steps (30.8/34.9/36.6 seconds), with no recorded errors or mounted-URL revocations. The selected image's evicted mask refetches successfully and its noise-textured plane remains valid. This uses a separate deterministic 128px noise fixture, fingerprint `eaefb766aa9c94d90231d3ee596fb83bd3c1ddf97328bd01d1da3587622360bc`, not the earlier gradient retention fixture. Its 1100 padded valid PNG masks provide 171.875 MiB of unique encoded input.

| Exact owned bytes / derived retention proxy | Cycle 1 | Cycle 2 | Cycle 3 | Return to selected | Dataset replacement |
| --- | --- | --- | --- | --- | --- |
| Retained encoded Files | 134,147,832 | 134,147,832 | 134,147,832 | 134,092,848 | 0 |
| Live derived PNG Blob payload | 72,567,000 | 72,764,910 | 72,764,910 | 79,757,730 | 0 |
| DOM-mounted derived PNG payload | 12,402,360 | 12,402,360 | 12,402,360 | 12,666,240 | 0 |
| Live minus DOM-mounted payload (inactive proxy) | 60,164,640 | 60,362,550 | 60,362,550 | 67,091,490 | 0 |

Encoded Files remain below 128 MiB; the settled derived inactive proxy stays below 64 MiB (67,108,864 bytes), including the return sample. Live derived payload plateaus between cycles two and three despite cumulative creation growing to 217,701,000 bytes; 144,936,090 bytes have been revoked by cycle three. On replacement all 230,367,240 cumulatively created bytes have matching revocations and no derived URLs remain live. Blob payload totals are exact instrumented create/revoke sizes; subtraction of DOM-mounted URLs is an **inactive-consumer proxy**, not inspection of private lease counters. Active demand is additional to the inactive budget. This establishes controlled cache retention and usable revisits for this workload; it does not establish universal whole-process reclamation, independently overflow the GPU texture budget, or convert OS allocation counters into exact physical VRAM. Final exact-build million-point timings and renderer/splat/media smoke checks are complete above; the bounded fresh-pair timing investigation is complete with the variability qualifications above.

The first ordinary gallery thumbnail became ready 614.7 ms after manifest fetch start; this is an instrumentation-on readiness measurement, not first paint. Released CPU private-commit samples across the three cycles were 1200.7, 1212.0, and 1172.2 MiB; after switching, 996.8 MiB remained versus 398.9 MiB before plane prefetch. Thus whole-process memory did **not** return to the starting sample, and these values alone prove neither a leak nor complete reclamation. GPU Process Memory dedicated-allocation counters were 252.1, 237.6, and 206.3 MiB after release, and 217.1 MiB after switch. They are OS/driver allocation counters for CDP-owned process IDs, not exact physical VRAM. Do not sum CPU private commit and GPU counters into a purported total.

## Inactive frustum GPU-budget invariant

An independent inactive GPU-estimate overflow while the bitmap budget is satisfied is unreachable under the current ownership model. [frustumCacheRetention.ts](../src/hooks/frustumCacheRetention.ts) counts bitmap bytes as `B = 4wh` and texture bytes as `G = 4 × sum(mip areas)`. For positive integer dimensions, each remaining mip area is at most half its predecessor, ending at one pixel; therefore `G ≤ 2B − 4`, including the no-mipmap case. [useFrustumTexture.ts](../src/hooks/useFrustumTexture.ts) shares image keys and pins between a bitmap and its single cached texture; bitmap eviction removes the texture first. Summing over inactive entries, `inactive bitmap ≤ 64 MiB` therefore implies `inactive texture estimate < 128 MiB`.

This replaces an impossible independent-overflow fixture requirement with a source-backed invariant. Texture-first trimming can still occur during transient **joint** overflow before bitmap trimming. Active pins, retired leases awaiting consumer release, the separate selected-image high-resolution cache, and actual driver VRAM allocations lie outside this settled inactive-cache estimate. The three-cycle hardware retention evidence validates lifecycle behavior; it does not turn these estimates into physical GPU-memory measurements.

## Hardware idle and interaction checks completed

All five reports in `.tmp/performance/render-runs/hardware-idle` match current build `bce741…`, Chromium 145/RTX 4090 D3D11, and the small 10K-point/20-image fixture. Each ten-second idle window records exactly **two rendered frames and nine actual WebGL draw calls**. Window duration median is 10008.8 ms (10003.7–10013.1). All five cover wheel, orbit/inertia, held W, goto, texture completion, and auto-rotation fallback. Each records three bitmap decodes/nine uploads, with a no-draw gap before delayed decode of median 599.7 ms (589.7–608.0). These hardware results establish idle/wake behavior rather than GPU presentation latency.

Independent inspection of `.tmp/performance/interaction-runs/hardware-interactions/*.json` finds four passed cases and one explicitly skipped case, all with the current build and no recorded app/resource/encoder errors:

- Actual point hover/two-point UI picking and a valid 512×512 PNG download passed.
- Browser-native CDP touch rotation/inertia, pinch, pan, and cancellation passed (38 trusted touch events); this is not a physical touchscreen test.
- Configured animated selection continued drawing before selection, after selection, and after Escape (43/43/42 frames in the respective 700 ms windows).
- WebM recording produced a playable 45,822-byte 223×180 file with decoded duration 4.897 seconds; 61 draw frames occurred during the measured one-second recording window, followed by settlement. This validates the captured artifact and rendering continuation, not exact recording-duration fidelity.
- Real visibility-return validation **skipped** because neither native minimize nor a real tab switch made the headless page hidden. No synthetic visibility event is substituted for that missing evidence.

The interaction owner visually checked the PNG, pink texture plane, and point-cloud screenshots. GIF/MP4 recording and physical touch remain unrun. WebGPU application-backend checks are not implied by this WebGL interaction coverage.

A second real-visibility attempt in `.tmp/performance/interaction-runs/hardware-visibility-native` also explicitly skipped. Its raw report identifies intermediate build `91a4b0ab552ce778e454e1a0949b75465911e0fac7c5d4e379229dc62c03e011`, headed offscreen Chromium/RTX 4090, and disabled focus emulation. Neither native minimize nor an actual tab switch hid the page; the recorded visibility-event array is empty. This is additional evidence of an unavailable test condition, not a passed visibility-return check.

## Application splat-backend smoke and quiet first-open comparison

The twenty quiet reports under `.tmp/performance/splat-runs/hardware-splat-baseline-quiet` and `hardware-splat-current-quiet` contain five runs for each backend/build. Independently checked repetition IDs 0–4, baseline 2838d1…/historical current bce741… build hashes, Chromium 145.0.7632.6, empty recorded error arrays, and the same prepared binary PLY fixture: 27 Gaussians, SHA-256 `cc0f7b88245220c6113232bafda9b058a1ccd0cf95eb6ae14cc418b10f07f8c3`. The integration owner manually inspected PNGs showing the expected red Gaussian cloud on both actual backends, and reports an independent Astra review of the probe source.

Spark reports actual completed JavaScript instanced draw calls from an identified Spark shader program to the scene's default framebuffer. Every WebGPU run records a successfully created device from an NVIDIA/Lovelace adapter with `isFallbackAdapter: false`; its readiness proxy observes the application WebGPU canvas becoming ready/opaque. This extends the standalone compute probe to actual application backend execution.

| Backend-specific readiness proxy | Baseline median (min–max), ms | Current median (min–max), ms | Median change |
| --- | --- | --- | --- |
| Spark draw-call return | 564.9 (514.4–724.6) | 577.7 (541.1–748.7) | +12.8 ms / +2.3% |
| WebGPU ready-canvas observation | 228.7 (217.4–245.4) | 239.3 (210.7–246.5) | +10.6 ms / +4.6% |

Neither quiet backend comparison exceeds the 10% median startup investigation threshold on this fixture. Median post-drop compressed JavaScript body bytes were 1,790,706 baseline versus 1,790,707 current for Spark, and 71,326 versus 71,338 for WebGPU. Earlier groups without the `-quiet` suffix potentially overlapped 3.5 seconds of TypeScript/lint work; these quiet groups supersede their preliminary timing gates.

These backend proxies deliberately have **different definitions**: Spark measures local prepared-File drop to draw-call return; WebGPU measures drop to observed ready-canvas state. Neither is a GPU completion/presentation fence, and the values must not be compared between backends as throughput or speed rankings. A tiny 27-Gaussian first-open smoke test does not establish large-splat throughput, PSNR parity, recording, retention, or all backend lifecycle cases. The reconstruction-only `compare.mjs` helper is not used to aggregate these splat reports.

Separately, `.tmp/performance/hardware-webgpu-validation-fixed.log` records `e2e/webgpu-render.spec.ts` **passed in 20.9 seconds** (one test). This hardware source-harness test exercises actual application renderer/PSNR modules on synthetic offscreen textures. It asserts self/flat-color PSNR, expected color and color-space mismatch errors, a one-pixel offset error, projection centroids including principal-point and anisotropic focal changes, pose perturbation, and Sim3D invariance. Obsolete diagnostic API calls removed from the application in `9db7ce3` were removed from the test; supported PSNR and geometry assertions remain, with independent Astra review reported by the integration owner. This closes the synthetic WebGPU PSNR/geometry check, not cross-backend image parity or large-scene validation, and is separate from the production timing-build identity above.

## Large-splat hardware functional validation

`e2e/performance/large-splat.perf.ts` passed all four cases in 8.6 seconds; focused ESLint and E2E TypeScript checks also passed. Reports and scene PNGs are in `.tmp/performance/large-splat-runs/hardware-large-splat`, all on final build `7484a2877e499cd1fe5028235bad36feeec7b54d5cbad6c393a84ac63469616d`, Chromium 145 and RTX 4090 D3D11. The generated native binary PLY fixtures use deterministic seed-42 positions, SH0 red color and density-scaled isotropic Gaussian radii. Fingerprints are `27e3756382ea986e235936c16c7d0aeb21e0d5bfa0382134bd2eda16fb833faa` (100K) and `bce13c8e94e109ef3621755537c34d5c743126b2f704b8ffebabbaf2b622bc89` (1M).

| Single-run diagnostic | 100K Gaussians | 1M Gaussians |
| --- | --- | --- |
| Spark draw-call-return proxy, ms | 725.6 | 737.7 |
| WebGPU ready-canvas proxy, ms | 208.7 | 488.9 |
| Separate post-ready WebGPU queue wait, ms | 13.5 | 0.5 |

Both WebGPU cases created actual nonfallback NVIDIA/Lovelace devices; Spark executed the identified instanced shader draw. All four reports have no recorded page errors, and screenshots contain over 17K red cloud pixels. Manual inspection of both 1M PNGs confirms an intact red cube, but WebGPU draws the grid over the cloud while Spark occludes it: **image parity is not claimed**. Backend readiness definitions differ, so the table is not a speed ranking or a five-run timing gate. `queue.onSubmittedWorkDone()` measures a separate post-readiness submitted-work completion wait, not display presentation. Cleanup verifies navigation to a blank document and scene removal, followed by context teardown; it does not establish same-page splat-resource reclamation or long-session retention. No sustained throughput result is inferred.

## Larger fixtures and remaining validation

The fixture metadata records successful repository-writer/binary-parser round trips, counts, and every observation reference. Generation/validation is complete; only completed report groups are counted below.

| Fixture | Points / images / track length | Fingerprint | Timing status |
| --- | --- | --- | --- |
| `million-long` | 1M / 1K / 16 | `e766cbf365401c2fe917626f104465163c79f054ef4139f92a420cc24205bf1d` | Five matched native-file runs per build complete |
| `large` | 5M / 5K / 2 | `0e676b05b648dcd5e3ad9d3ab5643b0a9b27a2adb888e15541f24006c55cf148` | Five matched native-file runs per build complete |
| `memory` | 1K / 1100 / 2, 128px cameras | `080325e98be43c6e6d0f8e936b119c8d3e0970779bcb3132fd31dae26cb92f00` | Three aligned retention cycles complete; supersedes earlier camera-size metadata |

| Validation gap | Current evidence | Still required |
| --- | --- | --- |
| Final-build timing gates | Fixed 20-run ABBA check: pooled selection p95 28.6→28.5 ms; earlier 13.5% increase did not reproduce; all earlier groups retained | No universal no-regression or 50 ms guarantee; sample size and workload/device scope remain limited. Historical dense/splat timings are not latest-build five-run gates |
| Long-track and 5M loading | Five-per-build historical native-file results complete; separate one-per-build process-memory diagnostics complete | No universal device/dataset timing or peak-memory guarantee |
| Budget-exceeding media revisits | Three decoded-bitmap cycles plus final encoded-File/derived-thumbnail plateau, revisits and cleanup; source-backed inactive texture/bitmap invariant | Active/retired/high-resolution and driver allocations remain outside the inactive estimate; no universal whole-process reclamation guarantee |
| Full interaction matrix on hardware | Five hardware idle/wake runs, four functional interaction cases including CDP touch, picking, PNG and WebM complete | Real visibility return, physical touch, GIF/MP4; remaining backend-specific behavior |
| Application WebGPU/splat backends | Final 100K/1M actual-backend rendering smokes; historical five-per-build first-open comparison; synthetic WebGPU PSNR/geometry assertions pass | Cross-backend image parity, sustained throughput, backend idle/wake/recording and same-page retention scope |
| Peak process/worker/WASM memory | Retention-phase CPU/GPU allocation samples and one-per-build large-load process-memory diagnostics complete | Exact worker/WASM attribution and instantaneous peaks remain unmeasured; GPU allocation counters are not physical VRAM |
| Exact GPU presentation/phase timings | Worker-stage traces, scalar shader/upload diagnostics, overlay submitted-work fence observation and scheduling proxies | Compositor presentation and complete conversion/upload phase attribution remain unmeasured |

The remaining gaps describe limits of this completed audit. No unrun check is counted as passed merely because a harness or fixture exists.
