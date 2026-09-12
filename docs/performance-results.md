# Production performance measurements

The performance-only integration on main excludes all agent features and produces build `43ff995a3cafcaf1af58ea71dcdef8562bbd14c373e1549595f18a59c5e01d99`. Build/lint/typechecks and twelve production hardware cases pass. See [main integration scope](performance-validation-followup.md#performance-only-integration-into-main) for transfer validation. The 8366 build and timing comparisons below remain historical evidence from the source branch.

Before the main transfer, no-regression verification reproduced build 8366 exactly and passed a fresh 3597-test suite, build/lint/typechecks, six browser checks, and a fixed 20-run hardware ABBA comparison. The earlier selection-tail increase did not recur: pooled p95 was 28.6→28.5 ms; scene/startup medians changed +0.65%/+2.43%. Astra/max independently reproduced the raw aggregates. No repeatable >10% regression was observed on this fixture/device; earlier adverse results and coverage limits remain in the [verification report](performance-validation-followup.md#no-regression-verification-of-the-final-build).

For the latest build, see [hardware validation follow-up](performance-validation-followup.md). Build `8366e094877ed02f8a17b6ddc1727c59bbe7aa705b88fbd7b2d4af6daa9f9134` passes **3,597 tests in 524 files** (75.11 s), build/lint/typechecks, and a fresh five-plus-five hardware selection comparison. Frustum resources survive selection changes, overlay colors use only the material uniform, exactly transparent planes skip drawing while remaining pickable, and animated frustum updates upload only changed ranges. A one-camera animation update in the 1000-camera fixture uploads 256 bytes rather than 256000. Independent Astra/max review found no code blockers.

The preceding five-plus-five comparison against retained build 7484 recorded selection median 26.9→26.4 ms, but pooled p95 28.9→32.8 ms; first-selection maximum was 42.2→40.1 ms. These are scheduling proxies and mixed timing results, not a universal speedup or presentation guarantee. Earlier build `7484a2877e499cd1fe5028235bad36feeec7b54d5cbad6c393a84ac63469616d` supplies the broader original-baseline comparison and three high-pressure gallery traversals verifying the 128 MiB File budget and bounded inactive masked-thumbnail retention, including safe mounted URLs and replacement cleanup. Historical evidence below keeps its original build scope.

That follow-up fixed cache-driven gallery scroll resets, LRU starvation during revisits, and unbounded masked-thumbnail accumulation. Astra/max reviewed the fixes without remaining concrete blockers. The historical software-rendered comparisons below retain their original build identities and scope.

Follow-up verification found and fixed a floor-tool cancellation bug: Clear during an asynchronous retry could restore the cleared plane when the old result arrived. Clear, Close, Apply and modal/source cleanup now cancel detection; the legacy deferred calculation also checks cancellation. Astra/max independently reviewed the fix without a remaining blocker. Four new component regressions cover deferred worker completion after Clear/Close/Apply and legacy Clear.

The pre-fix rebuild exactly reproduced measured hash `1da45a32…`, and recomputing the raw comparisons reproduced the table below. The fresh full suite passed 3,563 tests in 517 files (110.56 s), and three worker browser tests passed (12.3 s). After the narrow floor fix, build/typecheck and repository-wide lint passed, as did all 15 focused floor tests (including the four new regressions) and four production browser checks (52.0 s). The patched build is `bce741e9caff3dc119eaf2b2a67fe5f9a3e89dd99a6716ea51f8728e880a60c3`. Its single filtered-million smoke run recorded scene readiness 1170.4 ms and first selection 123.1 ms; the idle probe recorded two rendered frames/nine draw calls over 10011 ms, with interaction and texture wakeups passing. The single smoke run is not a replacement five-run performance baseline. Raw evidence is under `.tmp/performance/*/verify-floor-fixed/`, with logs `.tmp/performance/verify-*.log`.

The final measured build resolves the load and first-selection regressions found during implementation. All twenty final production repetitions passed on build SHA-256 `1da45a32cd617840f49f894e4027cda2746184f1346a90b11de31de8e9771af0` (`index-Buy0WpBn.js`): five each for small, million-point, filtered million-point, and first optional-tool open. These are software-rendered proxy measurements; subsequent hardware evidence and memory limitations are reported in the follow-up linked above.

| Final comparison, before → after | Small | Million | Filtered million, quiet baseline |
| --- | --- | --- | --- |
| Scene readiness median, ms | 517.8 → 285.7 (−44.8%) | 3381.2 → 1521.6 (−55.0%) | 2170.5 → 1093.2 (−49.6%) |
| Final scene readiness min–max, ms | 263.1–317.2 | 1465.6–1787.5 | 1088.8–1163.7 |
| Selection scheduling median, ms | 76.6 → 63.9 | 721.5 → 143.6 | 107.0 → 92.7 |
| Selection scheduling pooled p95, ms | 149.8 → 111.6 | 987.3 → 184.0 | 136.1 → 114.7 |
| First-selection median, ms | 149.8 → 108.6 | 780.1 → 184.0 | 136.1 → 114.7 |
| Later-selection median, ms | 72.5 → 63.6 | 715.3 → 142.3 | 105.0 → 92.4 |
| Main-thread load blocking median, ms | 84 → 64 | 2597 → 817 | 1577 → 232 |

The observed >10% scene/selection regressions are resolved against the matching baselines. The original small/unfiltered baselines had more environmental noise than the final runs, so their precise percentages are qualified; the quieter filtered baseline remains the principal regression check. Individual long-task counts increased for larger fixtures (million median 3→4; filtered 2→5), while total blocking fell substantially. Main-thread heap snapshots exclude worker/process/WASM totals and cannot prove a total-memory improvement.

Final raw runs are `.tmp/performance/runs/final-direct-small-v2` (25.5 s), `final-direct-million` (1.7 min), `final-direct-filtered` (1.3 min), and `.tmp/performance/tool-runs/final-direct-tools` (5.0 s). Final filtered comparisons use `baseline-quiet-million-filtered`, not the noisier original filtered group. All fixtures/settings match; there were no concurrent heavy jobs during this final matrix.

Final initial gzip JS body bytes are 611,888 versus baseline 613,052 (−1,164 bytes, −0.19% net integrated change); cold transfer bytes including headers are 613,088 versus 614,252. The four closed tool chunks are absent from initial requests. Auto-hide loads its 1,142-byte gzip chunk only after first open, confirmed in all five runs. Its final first-open readiness proxy is median 35.6 ms (23.9–160.2), versus 20.9 ms (17.2–23.3) baseline: a 14.7 ms median cost with one slower final sample, explicitly retained in the spread. This establishes a small real startup transfer reduction, not a large bundle speedup; the final five close/open checks and focused state/focus/retry tests passed.

Final integration checks: production build, TypeScript, repository-wide ESLint, and `git diff --check` passed. `npm run test:run -- --maxWorkers=8` passed all **3,563 tests in 517 files** in 109.85 s. An earlier full run alongside ESLint had one 15-second component-boundary timeout; that test passed alone and the complete lower-concurrency rerun passed. The added 100-visit retention test maintains inactive byte budgets and verifies exactly-once bitmap closure/texture disposal; this is an ownership test, not a browser/process-memory measurement. The two final production media tests passed in 5.8 s, covering shared transfer limits/429 recovery and same-page replacement cancellation. All three final Chromium worker workflow tests passed in 10.0 s, including binary/text loading, observations, edits, export/reparse and cancellation. Earlier 14 Python round-trip tests passed; no subsequent C++/binary-writer changes required repeating them. Final logs remain in `.tmp/performance/final-direct-*.log`, and worker browser artifacts in `.tmp/playwright-reconstruction-final/`.

Measured 2026-09-12. These are local Chromium **software-rendered** diagnostic measurements, not hardware rendering targets. The renderer reported ANGLE Vulkan SwiftShader (Subzero). CPU: Intel Core i7-12700K, 20 logical processors; Windows 10.0.26200; 137,167,814,656 bytes RAM; Chromium 145.0.7632.6, headless, 1280×720, DPR 1. The baseline production build was retained before implementation changes at `.tmp/performance/baseline-dist`.

Baseline identity: commit `79cd5477f122177c8e4924aba8a2a7d0b4a135ce`, pre-existing working-tree edits; captured 2026-09-12T12:51:13Z. Saved tracked dirty-patch SHA-256: `AA7A4EC3287F1E8EC0FCAE015F753C283CF8CA439CFAC35E33491C04CD528045`. That patch hash excludes untracked files. Preserve the production snapshot for exact reproduction; newer harness reports additionally fingerprint all production JS/HTML/CSS/WASM paths and bytes. Generated data/reports remain under `.tmp/performance/` and are not committed.

## Reproduce

Install repository dependencies and Playwright Chromium if missing (`npm install`, `npx playwright install chromium`). No public dataset service is used. `npm run build` creates the current production build. The harness refuses missing production output, does not reuse an existing server, uses one worker, and disables traces/retries. Ports 4173 and 4174 must be free.

PowerShell:

```powershell
node scripts/performance/generate.mjs small
node scripts/performance/generate.mjs million
$env:PERF_DIST='.tmp/performance/baseline-dist' # use dist for current production build
$env:PERF_FIXTURE='million'                   # small or million
$env:PERF_RUN='baseline-million-new'          # unique directory; existing results are protected
$env:PERF_REPETITIONS='5'
$env:PERF_FILTERED='0'
npx playwright test -c playwright.performance.config.ts baseline.perf.ts --workers=1
node scripts/performance/summarize.mjs baseline-million-new
# After an equivalent current run:
node scripts/performance/compare.mjs baseline-million-new current-million-new
```

Set `PERF_FILTERED=1` for thinning=50 (one point in 51, approximately 1.96% retained) using the application's persisted point-cloud setting. This exercises filtered membership without changing selection IDs. Set `PERF_FORMAT=txt` and `PERF_RIGS=1` with the small fixture for text and rig/frame validation. Set `PERF_FORMAT=bin` and `PERF_RIGS=0` for the representative baseline. Optional `PERF_BROWSER_CHANNEL=chrome` selects installed Chrome; check the reported renderer before drawing hardware conclusions. Do not run baseline and current browser measurements concurrently. CPU activity from unrelated builds/tests is a source of noise; use a quiet machine for a release decision.

`node scripts/performance/generate.mjs million 16` generates a long-track variant independently of point count; copy/preserve an earlier fixture if retaining both variants. `large` generates 5M points/5K images, explicitly opt-in because writer/parser validation holds multiple full Maps. Generation is outside the timed region. The generator uses the repository binary/text writers, parses binaries back, checks counts and every point's image-observation reference, and separately round-trips rigs/frames. Seed 42, deterministic poses, and nonsequential bigint IDs above 2^53 preserve ID stress. The primary-triple SHA-256 fingerprints are:

| Fixture | Points / images / track length | SHA-256 |
| --- | --- | --- |
| small | 10,000 / 20 / 2 | `cbf0d2f822b9fde8eef1d8c5f9d8377c67ecfe201d6b496d5f19860d3ea00f2f` |
| million | 1,000,000 / 1,000 / 2 | `92a9c8f577cf7806dbf9ec6ef86566072af72c810aa53e95a713e0dbbd08ecf1` |

## Initial baseline

Five independent browser contexts per fixture; ten sequential image selections per context. Each context measures an empty startup with cold HTTP/application caches, followed by warm HTTP reload. Reconstruction loading starts after the warm reload with a previously unloaded reconstruction and prepared local File objects. JS bytes are real Resource Timing entries from gzip-compressed local HTTP responses.

| Metric | Small | Million |
| --- | --- | --- |
| Local scene readiness proxy, median (min–max), ms | 517.8 (487.5–696.3) | 3381.2 (3166.7–4036.2) |
| Selection scheduling proxy, median / pooled p95, ms | 76.6 / 149.8 | 721.5 / 987.3 |
| Load long-task count, median | 1 | 3 |
| Load blocking duration, median (min–max), ms | 84 (64–96) | 2597 (2422–3235) |
| Heap at readiness, median, decimal MB | 103 | 342 |
| Empty cold startup proxy, median (min–max), ms | 456.3 (438.2–1069.8) | 510.2 (423.5–648.8) |
| Empty warm startup proxy, median (min–max), ms | 206.9 (169.5–435.7) | 186.8 (177.9–263.2) |
| Initial compressed JS body bytes | 613,052 | 613,052 |
| Cold JS transfer bytes including headers | 614,252 | 614,252 |
| Warm JS transfer bytes | 0 | 0 |

Raw runs: `.tmp/performance/runs/baseline-small` and `baseline-million`. Five small tests passed in 32.5 s; five million tests passed in 2.6 min. `npm run build` passed before baseline capture; `npm run lint` passed after initial harness implementation.

The five-repeat filtered million run (`baseline-million-filtered`, thinning=50 (one point in 51, approximately 1.96% retained)) passed together with the HTTP fault-protocol check: 6 tests in 1.6 min. Scene readiness proxy median 3098.7 ms (2613.2–3748.9); selection scheduling proxy median 116.1 ms, pooled p95 149.4 ms; median load blocking 2323 ms (1939–2898), median four long tasks; coarse heap-at-ready median 364 MB. This separate configuration is not a before/after speedup: it renders fewer points by explicit benchmark configuration and must be compared with the identical current-build configuration.

Small text plus rigs/frames smoke validation (`PERF_FORMAT=txt`, `PERF_RIGS=1`, one repetition, `baseline-text-rigs`) passed in 8.9 s. This is correctness smoke coverage, not a five-run performance result.

P4b CPU-only evidence supplied by the implementation owner: sorted sparse IDs, 1M points, K=1000 selected, two warmups plus five timed repetitions. The original scan's median was 64.3007 ms (58.67–65.44); indexed gathering median 0.3301 ms (0.276–0.455); index construction 9.7483 ms. Sorted IDs use the stable owned 8 MB ID buffer without an extra order buffer. Unsorted IDs require a 4N-byte Uint32Array plus sorting; that case was not measured here. This evidence isolates helper CPU execution and is not a GPU frame/presentation claim. The implementation owner's scratch runner is `.tmp/performance/selection-cpu.cjs`.

## Prior targeted gate: regression resolved before final matrix

The direct-CSR plus narrowed rendering-policy candidate (`index-D9-KW2Vs.js`, build hash `73cd8d1b3cbb1e142fc532c1a49c8f002bf2f0ab90fb2bc2be653c1e299d1ab9`) passed five quiet filtered repetitions in 1.2 min (`.tmp/performance/runs/direct-csr-filtered`). It resolves the load and first-selection regressions identified in the earlier candidates:

| Filtered metric | Quiet original baseline | Direct-CSR candidate | Change |
| --- | --- | --- | --- |
| Scene readiness median, ms | 2170.5 | 1123.7 | −48.2% |
| Scene readiness min–max, ms | 2079.4–2307.8 | 1109.1–1185.2 | |
| First-selection median, ms | 136.1 | 111.8 | −17.9% |
| Later-selection median, ms | 105.0 | 90.2 | −14.1% |
| All-selection pooled p95, ms | 136.1 | 111.8 | −17.9% |
| Main-thread load blocking median, ms | 1577 | 250 | −84.1% |

The browser reported more individual long tasks (median six versus two), with much lower total blocking. Compared with the intermediate compact candidate, blocking increased from 196 to 250 ms while scene readiness improved from 2992.5 to 1123.7 ms. Coarse page-heap snapshots still exclude worker/total-process memory. The complete final matrix after the duplicate-ID correctness fix is reported first above. The following earlier-candidate results document how the regression was discovered and diagnosed, not the latest gate outcome.

## Earlier integrated candidates and diagnosis

The pre-compact candidate build has SHA-256 `74fbaa539ea76c6c16f6ea1f575aa8919890b1fde4f1416503da3001a251d82e` (entry `index-CllGuoJI.js`). The retained baseline build hashes to `2838d1a7324d13a4c10d950dc3de84fd08cc85bd99fdbd839a24cef77187665d`. All twenty requested current production repetitions passed: small five in 26.2 s, million five in 1.8 min, filtered million five in 1.4 min, and optional-tool five in 4.9 s. The first three raw runs are `.tmp/performance/runs/current-final-small`, `current-final-million`, and `current-final-million-filtered`. They use identical fixture fingerprints and settings to the original baseline. No build or other test job ran concurrently with those browser measurements.

| Metric, before → current | Small | Million | Million, thinning=50 |
| --- | --- | --- | --- |
| Scene readiness proxy median, ms | 517.8 → 505.2 (−2.4%) | 3381.2 → 3591.8 (+6.2%) | 3098.7 → 2988.6 (−3.6%) |
| Current scene proxy min–max, ms | 487.7–514.6 | 3313.2–4443.7 | 2975.0–3068.2 |
| Selection scheduling median, ms | 76.6 → 63.4 | 721.5 → 148.6 | 116.1 → 94.1 |
| Selection scheduling pooled p95, ms | 149.8 → 120.7 | 987.3 → 269.2 | 149.4 → 187.4 |
| Load blocking median, ms | 84 → 63 | 2597 → 1184 | 2323 → 329 |
| Coarse page heap at ready, decimal MB | 103 → 35.1 | 342 → 199 | 364 → 139 |

**This earlier candidate did not pass the regression gate.** Filtered selection p95 increased 25.4%, consistently at the first selection after load. A quiet sequential five-repeat baseline/current rerun (`baseline-quiet-million-filtered`, `current-quiet-million-filtered`) confirmed the p95 increase and exposed a load-time regression that the noisier original baseline obscured:

| Quiet paired metric | Preserved baseline | Current | Change |
| --- | --- | --- | --- |
| Scene readiness median, ms | 2170.5 | 3038.6 | +40.0% |
| Scene readiness min–max, ms | 2079.4–2307.8 | 2981.9–5541.0 | Every current run slower |
| Selection scheduling median, ms | 107.0 | 101.5 | −5.1% |
| Selection scheduling pooled p95, ms | 136.1 | 188.8 | +38.7% |
| Main-thread load blocking median, ms | 1577 | 441 | −72.0% |

Both follow-up groups passed their functional assertions (1.4 and 1.6 min). The slower initial scene and first-selection tail require further diagnosis/fixing or explicit acceptance against the responsiveness improvement under the specification. Worker initialization/snapshot transfer and first-selection work are plausible investigation areas, not established causal explanations. The current build's lower page-heap snapshot **does not establish lower total memory**: worker heap and total WASM/process memory are excluded. Do not describe this integration as a blanket performance win or a passed release gate.

Before further changes, this candidate was preserved as `.tmp/performance/pre-compact-dist` with the same `74fbaa…` build hash. A separate instrumented filtered diagnostic (`PERF_DIAGNOSTIC=1`, one repetition; `.tmp/performance/runs/diagnostic-pre-compact-filtered/million-0.json` and `.trace`) recorded worker initialization about 89 ms, parsing 251 ms, statistics 1783.4 ms, and snapshot construction 24.3 ms. Snapshot-phase progress to main-thread result delivery was 395.7 ms, leaving approximately 371.4 ms beyond snapshot construction for serialization/delivery/dispatch; this is not an isolated structured-clone timer. The delivered reverse index contained 1,000 Sets and 2,000,000 bigint memberships. Reported rendering buffers were 40 MB, WASM heap 167.5 MB, retained image binary 48.1 MB. CDP marks place parse/statistics/snapshot on the worker thread. The instrumented first-selection window was 235.9 ms; its longest main-thread animation callback was 33.9 ms, followed by an 11.5 ms function slice, with click dispatch 0.8 ms. That trace does not support attributing the entire first-selection delay to one long UI task. These instrumentation-on values diagnose stages and are excluded from the five-run timing tables. The regression remains unaccepted while the owners investigate compact membership transfer and frame scheduling.

The subsequent compact-membership plus child-frameloop candidate (`index-AW5tYsde.js`, build hash `358d04a3d4a61d342657a6ff227ff4738b5cac5f74b4c518d9632064646caa33`) passed five filtered repetitions in 1.5 min (`.tmp/performance/runs/compact-filtered`). Scene readiness median 2992.5 ms (2984.5–3000.5) remained 37.9% above the quiet baseline; first-selection median 219.0 ms (186.2–240.2) remained 60.9% above baseline 136.1 ms. Later-selection median was 102.6 ms versus baseline 105.0 ms; later p95 was 112.0 versus 120.8 ms. Main-thread load blocking fell to 196 ms, versus 441 ms in the pre-compact rerun and 1577 ms baseline. The integration owner reported a brief single-thread filesystem search during one run window, so this group is not described as entirely quiet; the consistently large regression across all five scene samples is not borderline. These targeted gates still fail, and no broader candidate matrix was run.

One separate compact diagnostic passed (`diagnostic-compact-filtered/million-0.json` and `.trace`): initialization 32.5 ms, parse 189.7 ms, statistics 1536.7 ms, snapshot construction 78.2 ms including 40.1 ms membership packing. The packed membership payload was 16,012,004 bytes and contained no wire-format membership Sets. Snapshot progress to main-thread result delivery was 81.5 ms, only about 3.3 ms beyond reported construction, compared with approximately 371.4 ms residual in the pre-compact diagnostic. This supports successful removal of the expensive delivery path, while statistics remain the largest reported worker stage; the one-shot instrumented stage values are not a substitute for the five-run gate. The compact candidate's initial compressed JS was 611,207 bytes, still 1,845 bytes below the original baseline.

P8 has a measured startup benefit in the pre-compact integrated build: actual initial compressed JS fell from 613,052 to 610,302 bytes (−2,750 bytes, −0.45% net across the integrated changes). Cold transfer bytes including headers fell from 614,252 to 611,502. None of the four tool-modal chunks appeared in initial requests. In all five first-open runs, `AutoHideModal-BN3KZmI_.js` was requested only after clicking Auto-hide and transferred 1,142 gzip body bytes (1,442 including headers). Auto-hide first-open readiness proxy increased from median 20.9 ms (17.2–23.3) to 32.4 ms (26.7–35.4): an 11.5 ms absolute first-open cost. Net integrated bundle changes cannot be attributed solely to P8, but the deferred request boundary is directly observed. Retaining this narrow deferral is supported by the real startup reduction and small measured first-open cost; it does not waive the independent filtered-scene regression gate.

P8's twelve focused unit tests cover import deferral, state retention across close/reopen, focus restoration, pending-close handling, and failed-import retry; lint passed. To reproduce first-open diagnostics, set `PERF_TOOLS=1` and a unique `PERF_RUN`, then run `npx playwright test -c playwright.performance.config.ts tools.perf.ts --workers=1`. Raw before/current values and requested chunks are under `.tmp/performance/tool-runs/baseline-tools` and `current-final-tools`.

## Metric definitions and limitations

Scene readiness is drop-event dispatch to the first gallery image label becoming visible plus two animation callbacks. It includes Playwright observation overhead and is a useful-scene **proxy**, not a GPU upload/presentation fence. Empty startup is navigation start to visible drop zone plus two animation callbacks. Selection uses an actual DOM click on a gallery image label, measured in-page until two animation callbacks; it includes React scheduling and software rendering and does not isolate selection-array work. It must not be reported as exact selection-to-present latency. P95 pools 50 selections using nearest rank; summary medians use the middle sample. Raw samples retain the full distribution.

Long tasks are browser PerformanceObserver `longtask` entries starting after drop dispatch. Blocking duration is the sum of `max(duration - 50, 0)`. They are not attributed specifically to parse, statistics, conversion, or upload. `performance.memory.usedJSHeapSize` is a coarse, browser-specific snapshot, not peak process memory, cache ownership, or total WASM memory. Measured rAF intervals are scheduling intervals, **not rendered-frame counts or draw calls**. They are retained in JSON but excluded from hardware performance claims.

The controlled server runs on two loopback origins and exposes `/manifest.json?fixture=small&namespace=example`, delayed response bodies, 404s, two 429s with exposed Retry-After, and disconnects. Manifest image overrides use relative paths as required by the application, so that application fixture uses one origin; the separate protocol and scheduler unit tests exercise two origins. `/__metrics` records active/peak transfers, body bytes, and request start/end/status. `/media/…?delay=500` supports explicit body delay, and a namespace starting with `slow-` delays bodies by ten seconds. The separate HTTP protocol test verifies the server's fault behavior. Application coverage is in `application-media.perf.ts`; the protocol test alone does not establish application cancellation or priority behavior.

P6 validation supplied by the implementation owner: three real Chromium cases in `e2e/reconstruction-worker.spec.ts` passed in 20.3 s, covering binary/text worker-only parse marks, observations, transforms, deletion, download/reparse, and clearing pending worker work. Fourteen pycolmap tests, thirteen authority/service tests, and nineteen focused cancellation/workflow tests also passed. Ownership contracts are documented in `reconstruction-worker-ownership.md`. Worker parse marks establish where parsing executes; they do not measure exact GPU upload time or combined peak main/worker/WASM memory.

P5 ownership/cancellation evidence includes a separate Astra review reproduction of twelve rapid selections: peak four active decodes, five total starts, seven skipped stale jobs, and exactly-once stale bitmap closure. Twelve `useFrustumTexture` tests passed. These are ownership and scheduling checks, not a measured plateau under budget-exceeding navigation or exact GPU memory accounting. Two final-build production application-media tests passed in 5.6 s; raw artifacts are under `.tmp/performance/media-runs`. The integration owner measured peak four active browser transfers and four active server bodies, cancellation settlement, and at least one second of retry cooldown after 429 headers actually reached the browser. A request cancelled before headers does not establish a received-429 cooldown obligation.

P7's final five quiet production repetitions (`.tmp/performance/render-runs/p7-final-direct/0.json` through `4.json`) passed in 2.4 minutes against build `1da45a32cd617840f49f894e4027cda2746184f1346a90b11de31de8e9771af0`. With static selection explicitly configured, each recorded exactly two rendered frames and nine WebGL draw calls during a roughly ten-second settled window: duration median 10006.5 ms, range 10002.6–10011.8. Actual scene draw calls define these counts; the probe does not schedule animation callbacks. This meets the static nonsplat gate of at most ten incidental frames per ten-second window. The narrowed policy keeps rainbow/blink scenes with selectable images continuous even before the first selection; no idle-render reduction is claimed for those default animated scenes.

All five final P7 runs passed wheel, orbit, held W, goto, delayed texture decode/upload, and auto-rotation's continuous fallback followed by settlement. Each recorded three decodes and nine texture-upload calls; the last decode completed after a median 611.3 ms without draws (601.2–613.5), followed by rendering. The final `0-texture.png` and `0.png` were visually inspected: the expected pink image plane and colored point cloud were intact. There were no page errors or relevant detached/disposed/texture warnings. The small 10K-point/20-image fixture used Chromium 145.0.7632.6/ANGLE SwiftShader, 1280×720, DPR 1. These are measured software WebGL idle/wake results, not hardware GPU speedups. Input continuation counts are retained in the raw JSON and are functional checks, not latency measurements. The earlier `.tmp/performance/render-runs/p7-verified/` run remains historical evidence; the final run validates the current narrow gate. The complete consumer audit and qualifications are in [demand-rendering-audit.md](demand-rendering-audit.md).

Full P0 coverage remains incomplete: first-thumbnail/splat timings, budget-exceeding image revisit cycles with owned File/bitmap/GPU retention, peak process/worker/WASM memory, complete touch/picking/recording/visibility-return interaction matrix, and hardware WebGPU measurements remain release validation. Text/rig smoke and worker parity are covered; long-track/5M generators are available but are not claimed as timed baseline results unless separately recorded. A repeatable >10% current-build regression requires investigation using comparable runs; these software measurements alone do not certify a hardware release gate.
