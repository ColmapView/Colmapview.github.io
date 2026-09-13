# Loading and rendering performance: verification and execution specification

Date: 2026-09-12. Baseline commit: `79cd5477f122177c8e4924aba8a2a7d0b4a135ce`, plus the current working tree. Application version: 0.14.2.

This document records the verified execution specification. The user subsequently authorized implementation: P1–P8 are implemented and P0 has a reproducible production harness. Measured results and remaining validation limits are recorded in [performance-results.md](performance-results.md). Existing edits to rig connections, viewer controls, and `rigFrameGroups.ts` were preserved. The earlier `performance-improvement-plan.md` remains historical context.

The [hardware follow-up](performance-validation-followup.md) extends validation through million-point, dense-track, five-million-point, real GPU rendering, and repeated cache-pressure workflows. It also closes three measured gallery/retention issues: cache refreshes resetting selected-image scrolling, snapshot reads distorting File-cache recency, and accumulated masked-thumbnail versions. Masked thumbnails now use a 64 MiB inactive Blob budget with consumer leases and exact payload accounting; active and retired leases remain separately accounted. Final implementation review used Astra/max. The follow-up records completed gates and the precise remaining measurement limits.

Implementation re-review used Astra at `max`. It independently reproduced and verified fixes for request failure/priority propagation, retained modal files, stale configuration loads, same-name texture replacement, and bounded high-resolution decoding. No concrete code blockers remained in the final reviewed P1–P7 changes. Measurement qualifications and incomplete hardware coverage remain explicit in the results; source review alone does not certify performance targets. Worker ownership and recovery are documented in [reconstruction-worker-ownership.md](reconstruction-worker-ownership.md).

Measured integration regressions led to two refinements: worker WASM snapshots build transferable membership directly from CSR tracks instead of constructing and cloning per-image bigint Sets, and animated-selection scenes with available images keep continuous rendering before the first selection. Demand rendering is restricted to eligible static/point-only scenes and retains explicit continuous fallbacks. Worker loads also skip the legacy 200 ms paint delay. Accepted binary input with duplicate point IDs retains all matching selection rows through an exceptional scan with constant-time membership; normal unique-ID selection remains indexed. Astra/max reviewed these refinements without remaining concrete blockers.

## Selection follow-up execution packet

The next measured bottlenecks were shader/resource churn on camera selection and full frustum-style uploads during animation. Implemented by the integration owner and the existing Astra/high rendering worker, with independent Astra/max review: retain frustum geometry/material identity; omit unused overlay vertex colors; suppress draws for exactly transparent basic planes without disabling raycasts; narrow animated-only uploads while preserving pending full updates until renderer consumption. Keep static, rainbow, blink, hover, matches, deletion, opacity, and replacement behavior intact.

Validation requires real Three resource/range tests, focused point-overlay and plane-arrival/picking tests, production upload/program diagnostics, quiet matched five-run comparisons, the full unit suite, lint/build/typechecks, and hardware idle/interaction/splat checks. Record mixed or regressed timing metrics. Defer shader warmup unless quiet measurements establish a remaining cold-selection gap; preserving program ownership and safe asynchronous cleanup is additional complexity, not an assumed performance win. Evidence and remaining limits are in [performance-validation-followup.md](performance-validation-followup.md).

## Evidence standard and scope

Completed independent review using `gpt-6-astra` at `max` reasoning effort. Verdict: the preliminary findings are supported with the qualifications below; after incorporating the review corrections, the reviewer found no remaining blocking specification gap. Verification included source inspection and an executable request-state reproduction. `npm run lint` passed. Code evidence establishes execution paths and missing controls; it does not establish a measured stall duration, FPS loss, memory leak, or speedup. Production browser measurements are phase P0, not an already-completed result.

Preserve reconstruction fidelity, point IDs, camera/rig data, masks, metric-image bytes, PSNR behavior, selection behavior, exported COLMAP compatibility, and current visible rendering quality. Performance limits below are initial tuning candidates unless described as correctness invariants. Do not silently downsample datasets, change splat backends, or reduce image-plane visibility to meet a benchmark.

## Findings to address

| ID | Verified code behavior | Implication and qualification |
| --- | --- | --- |
| F1 | `src/parsers/wasmParser.ts:58` reads three complete files concurrently, then calls synchronous WASM parsers at line 64. `src/wasm/reconstruction.ts:126` retains `imagesBuffer` for lazy observations. | Parsing can block the main thread; async file reads do not make parsing asynchronous. Lazy observations avoid eager expansion, but the source image binary remains retained. Severity depends on dataset size. |
| F2 | `src/hooks/pointCloud/usePointCloudData.ts:103` combines base geometry/color and selection computation in one memo. Selection is a dependency, and the fast path calls full-cloud color computation at line 214. | Selection-only changes can allocate/recompute all colors and trigger a GPU color upload. Cached fast-path positions already prevent unnecessary geometry replacement. The filtered path additionally rebuilds positions. |
| F3 | `src/components/viewer3d/Scene3D.tsx:476` creates a Canvas without a frameloop override; the installed Fiber default is `always`. | The main canvas continues producing frames while settled. The visible WebGPU adapter already skips unchanged frames (`src/splat/webgpu/visibleSplatRendererAdapter.ts:245`), while the R3F bridge still constructs/forwards snapshots (`WebGpuSplatCanvasLayer.tsx:899`, `:915`). The local adapter renders supplied frames (`src/splat/webgpu/localGsplatRendererAdapter.ts:65`). Measure each backend separately; many animations and frame-driven controls depend on the main loop. |
| F4 | `src/utils/imageFileRequestState.ts:21` retains File objects in a Map with no budget; `src/hooks/frustumTextureCache.ts:20` defaults active texture capacity to infinity; `src/hooks/useFrustumTexture.ts:62` retains decoded bitmaps separately. | Retention can grow with visited images within a dataset. This is not proof of a leak after teardown. File bytes, decoded bitmap bytes, GPU resources, and externally held references require separate accounting. |
| F5 | `src/utils/urlImageFiles.ts:116`, `:153`, and `:200` fetch display images, raw images, and masks directly. `src/components/gallery/useImageGalleryVisibleImageFetch.ts:83` starts independent image/mask batches. | Local batching exists, but there is no shared application media-transfer budget or propagated AbortSignal on these paths. Reconstruction/manifest fetches are a different scope. |
| F6 | `src/utils/imageFileRequestState.ts:65` clears waiter callbacks without settling them; cache insertion/completion are not tied to an operation generation. | Clearing during a request can leave duplicate callers unresolved and allow obsolete work to write or complete a newer operation. This correctness issue precedes scheduling/eviction changes. |
| F7 | `src/hooks/fileDropzoneReconstruction.ts:41` synchronously computes image statistics after parsing. `src/parsers/imageStats.ts:96` and `:114` contain nested per-track image loops. | Covisibility/index construction includes work proportional to the sum of squared track lengths, plus per-observation Sets. Moving only binary parsing leaves this main-thread stage intact. Benchmark long-track fixtures, not only point count. |

Astra independently executed the current request-state helper after in-memory TypeScript transpilation. For an old request, clear, new same-key request, stale cache insertion, then old completion, it observed:

```json
{
  "oldWaiterSettled": false,
  "staleWriteAccepted": true,
  "newWaiterReceivedOldFile": true,
  "newRequestStillPending": false
}
```

This is executable helper-level evidence for F6, not a browser reproduction of visible cross-dataset contamination. P1 must add permanent regression coverage. Separately, live frustum bitmap loading already rejects stale insertion by generation, but its unconditional finally deletion can remove replacement in-flight tracking; preserve the existing guard and add operation-identity protection.

Existing strengths to retain: WASM lazy observation access; typed-array rendering with cached position copies; batched frustum lines and instanced arrows/hit targets; virtualized gallery rows; resized images; local batching/coalescing; optional Spark lazy loading; worker-capable Gaussian decoding. These are individual optimizations, not proof of end-to-end optimal performance.

The optional import boundaries are `src/utils/sparkSplatRuntime.ts:10` and the WebGPU Gaussian loader import at `src/components/viewer3d/WebGpuSplatCanvasLayer.tsx:572`. Worker decoding/packing applies to the PLY/SPZ Gaussian path (`src/splat/gaussianCloudLoader.ts:233`); worker-construction failure/unavailability falls back to same-thread work. Do not describe all splat loading, or COLMAP parsing, as off-thread. Frustum bitmap generation checks and explicit cache teardown already exist; missing eviction is not missing cleanup.

## Execution order and model settings

Use one implementation owner per phase and a separate read-only review of risky changes. The requested verification uses Astra/max. The execution assignments below are engineering recommendations, not measured model benchmarks.

| Phase | Deliverable | Dependencies | Execution model / effort | Review model / effort |
| --- | --- | --- | --- | --- |
| P0 | Reproducible production performance harness and baseline | None | `gpt-6-astra` / `medium` | Astra / `high` |
| P1 | Safe request identity, cancellation, and dataset invalidation | P0 baseline | Astra / `high` | Astra / `max` |
| P2 | Shared prioritized media scheduler and 429 handling | P1 | Astra / `high` | Astra / `max` |
| P3 | Byte-bounded URL File retention | P1; integrate after P2 | Astra / `high` | Astra / `high` |
| P4a | Separate base cloud computation from selection | P0 | Astra / `high` | Astra / `high` |
| P4b | Indexed selection gathering, if P4a still misses latency target | P4a measurements | Astra / `high` | Astra / `max` |
| P5 | Ownership-aware bitmap/texture retention | P0; coordinate with P1-P3 | Astra / `max` | Astra / `max` |
| P6 | Worker-owned reconstruction service and consumer migration | P0, P4 contracts stabilized | Astra / `max` | Astra / `max` |
| P7 | Conditional demand rendering | P0; after P4-P6 integration | Astra / `max` | Astra / `max` |
| P8 | Measured startup code deferral | P0; independent of data changes | Astra / `medium` | Astra / `high` |

Default sequence: P0 -> P1 -> P2 -> P3 -> P4a -> reassess -> P4b/P5 -> P6 -> P7. P8 is a small independent candidate after baseline. Prioritize P6 earlier only if baseline shows parsing dominates the target workflow. Stop at each measured gate; a conditional phase is not a commitment to ship an unhelpful change.

For an all-Astra execution run, use `high` by default, `max` for ownership/concurrency architecture and final integration review, and `medium` for bounded harness/documentation work. The official [Astra model page](https://developers.openai.com/api/docs/models/gpt-6-astra) confirms these supported effort settings. It does not prescribe this phase allocation.

P1-P3 share lifecycle state and must execute sequentially. P4 and P8 can be delegated in isolated worktrees after P0, with disjoint file ownership. P5-P7 touch renderer and data contracts; avoid simultaneous edits to their shared integration surfaces. Each implementation packet must state ownership, preserve others' changes, run its acceptance checks, and return evidence plus unresolved risks.

## P0: establish a reproducible baseline

**Ownership:** proposed `scripts/performance/`, a separate `playwright.performance.config.ts`, focused `e2e/performance/` scenarios, and documentation. Store generated datasets, traces, and reports under `.tmp/performance/`; commit only generators/configuration/source tests.

The ordinary Playwright configuration launches Vite development mode and includes software WebGPU projects. Create an explicit production-build measurement path; do not present development or software-rendered frame timings as hardware performance. Record commit plus dirty patch identity, browser/version, CPU/GPU, renderer/backend, OS, viewport, DPR, hardware/software rendering, dataset fingerprint, and cache state.

Fixtures and scenarios:

1. Empty startup and first optional-tool/splat open, measuring actual initial JS requests and compressed bytes.
2. Deterministic valid local binary reconstruction: small correctness case, approximately 1M points/1K images, and approximately 5M points/5K images if available memory permits. Fix tracks, camera poses, sparse nonsequential bigint IDs, seed, and selection visibility. Vary short/long track distributions independently of point count to expose pairwise statistics work. Include a text fallback case and rigs/frames. Generate fixtures from repository-supported writers; validate them before timing.
3. Controlled local HTTP dataset with image/mask body delays, duplicate consumers, two origins, 404s, 429 with Retry-After, and connection failures. Run selected image + visible gallery + background prefetch + metric requests together. Never benchmark rate limits against a public dataset host.
4. Selection changes with filters off/on and floor colors off/on; orbit, fly, touch, point picking, gallery scroll, and dataset replacement mid-load.
5. Settled point scene and each available splat backend; animations off/on; recording; image planes; high-resolution selection; background/foreground transition.
6. Revisit enough images to exceed proposed budgets; repeat the same navigation cycle three times, then clear/switch datasets.

Record time to first useful scene/thumbnail, parsing/conversion/upload phases, selection-to-present latency, long-task count and blocking duration, frame-time p50/p95, idle frame count/draw calls, transfer concurrency and bytes, obsolete work, retained File bytes, bitmap estimates, renderer texture/geometry counts, and estimated peak process/heap/WASM memory where observable. Mark unavailable metrics explicitly; GPU memory estimates are not exact measurements.

Run at least five timed repetitions per representative configuration, report median and spread, and separate cold HTTP/application caches from warm runs. Collect performance traces in separate diagnostic runs if instrumentation distorts timings. Use fake clocks for deterministic scheduling tests, not wall-clock microbenchmarks in unit CI.

**Gate:** checked-in reproducible commands and a baseline table, with every metric defined and missing hardware/data identified. Proposed investigation triggers: selection p95 above 50 ms, main-thread tasks above 50 ms during parsing, or retained bytes growing on repeated equivalent visits. These are triggers, not invented baseline observations. Treat repeatable >10% regressions in first useful scene, selection latency, or peak owned memory as a release blocker until explained and accepted against the primary improvement.

## P1: make request lifecycles safe

**Ownership:** `imageFileRequestState.ts`, `urlImageFiles.ts`, `zipImageFiles.ts`, dataset manager/types/adapters, relevant cache-clear integration and callers. Add focused tests beside each policy.

Introduce an internal operation record containing a unique operation token, dataset generation, canonical resource identity, controller when cancellable, consumers, and settlement state. Identity is generation + resolved URL + representation (`display`, `raw`, `mask`); do not use an image name as a cross-dataset request identity. Alias image names resolving to one URL may share bytes, but synchronous lookups must resolve each alias correctly. Preserve explicit URL encoding and signed query strings.

Add optional `{ signal, priority }` access options to dataset async accessors and adapters without breaking existing calls. Preserve the public `File | null` result convention; use richer internal outcomes for abort, definitive absence, HTTP failure, and successful data. Snapshot source/generation at request creation. A stale completion must neither return old data to an active current-generation consumer nor publish it into current caches.

Completion and finally cleanup must compare operation token and generation before writing/deleting state. Clear invalidates the generation, removes queued work, aborts owned transfers, and settles all old consumers exactly once with null. Independent cancellation settles that consumer; the underlying shared operation is aborted only after the last consumer leaves. Requests without an explicit signal still count as consumers until settlement. ZIP extraction and image encoding may be uncancellable; discard their obsolete results and dispose owned resources.

Thread cancellation through gallery cleanup, selected-image requests, prefetch, metric jobs, and dataset replacement. Scope mask-absence state by source/generation. Count absence only when all applicable candidate URLs return definitive 404; cancellation, 429, authentication errors, 5xx, and network failures must not poison the absence heuristic.

**Acceptance:** duplicate consumers settle once; one consumer cancelling does not break another; last-consumer cancellation aborts fetch/body reads; clear settles waiters immediately; old completion/finally cannot affect a new same-key operation; clear during body read/encoding is safe; aliases and two datasets sharing names stay isolated; local and ZIP access retain compatibility; raw metric bytes are unchanged. Integration tests must prove signal propagation to the active URL fetch, not only a cancelled boolean.

## P2: coordinate network work

**Ownership:** proposed `src/dataset/urlMediaScheduler.ts` and policy/tests; integration through URL media access and caller priorities established in P1.

Route all application-owned URL display/raw/mask transfers through one page-level scheduler. Initial configurable budgets: four transfers per origin and eight per page. A slot is held until the body is consumed or cancelled, and released before decode/compression or retry cooldown. Retained files and decode/upload queues are separate budgets. Direct reconstruction downloads and opaque backend-managed splat network requests are explicitly outside the first scheduler's scope.

Priorities: selected interactive media first, visible gallery second, explicit batch metric work next, speculative prefetch last. Coalesced demand raises queued priority; no duplicate physical fetch for equivalent representation. Use FIFO within each class plus aging/fairness, with a documented bounded dispatch opportunity for eligible older jobs even under sustained foreground arrivals. Test both sustained demand and queue drain. Do not preempt an active transfer needed by another consumer.

On 429, pause dispatch for that origin. Parse exposed Retry-After seconds/date; otherwise apply bounded exponential backoff with jitter. Permit at most two retries after the initial attempt, use the later outstanding origin deadline, and keep waits cancellable. Do not shorten a valid long server deadline to retry early. If the product imposes a maximum wait, fail visibly instead. Non-429 ordinary 4xx responses are not retried. Do not silently turn exhausted rate limits into missing masks.

**Acceptance:** aggregate active/body-reading requests never exceed either limit; cancelled queued jobs never start; slot accounting survives failures; Retry-After and fallback jitter pass fake-clock cases; unrelated origins proceed during cooldown; no retry storm; raw/display outputs remain distinct; foreground priority and background progress hold under combined workloads. Report first-visible-media latency against P0; tune initial limits rather than asserting four/eight is optimal.

## P3: bound retained URL files

**Ownership:** URL cache retention policy and cache diagnostics. Keep request lifecycle and eviction separate. The request-state helper also serves ZIP; apply limits opt-in to URL caches initially.

Use a shared initial 128 MiB LRU budget for cache-owned URL display images and masks. Track byte totals incrementally; reads refresh recency, replacement removes prior bytes, and deletion/clear update exact totals. Oversized entries are delivered but not retained. Raw metric files remain transient by default; pending-request coalescing must release results after consumers settle.

Eviction releases cache File references only. Downstream consumers may retain usable files, object URLs, decoded bitmaps, or textures; do not revoke/dispose those resources here. Extend existing diagnostics with budget, retained bytes, evictions, and oversized bypasses. Route any new persistent setting through `STORAGE_KEYS` and migration helpers; prefer a nonpersistent internal tuning policy first.

**Acceptance:** owned retained bytes never exceed budget after insertion; LRU order and accounting are exact; selected/visible images stay valid after eviction; dataset clear and stale-write protections still pass; repeated scroll does not cause excessive refetch churn. Report actual File bytes separately from total process memory and decoded/GPU estimates.

## P4: make point-cloud selection proportional to selection work

**Ownership:** `src/hooks/pointCloud/`, `src/utils/pointCloudColors.ts`, `src/components/viewer3d/PointCloud/`, relevant tests. Preserve the public point-picking ID semantics.

P4a splits the current combined memo into base positions/filter membership, base colors/statistics, and selection overlay. Base dependencies are reconstruction/data revision, active filters/thinning, color mode, and relevant floor-color inputs. Selection ID, selection visibility, and highlight color must not invalidate base positions/colors. Apply this to WASM fast path, filtered WASM, and Map fallback; fixing only the no-filter case is incomplete. Reuse GPU geometry and color attributes when base data did not change.

Use explicit data/reconstruction revisions or proven immutable identities to invalidate cached buffers after transform, deletion, replacement, or WASM memory growth. Do not retain detachable WASM views as stable GPU arrays. Preserve existing floor-color normalization, filtered membership, geometry bounds, overlay draw order, and hidden-cloud behavior. Highlight recoloring can update only overlay colors; animation should continue using existing material/frame updates.

**P4a acceptance:** with base computation already enabled and unchanged data revision/filter/color inputs, selection-only changes preserve base array/geometry identity and color attribute version; no full-cloud base color allocation or upload occurs. Enabling a previously inactive hidden cloud for its first selection overlay may legitimately allocate initial data. Changed filters/colors/floor inputs still update correctly; nonsequential bigint IDs and filtered-out points select correctly; transforms and dataset replacement invalidate caches; all existing point-cloud tests pass. Measure selection latency before/after with identical scenes.

P4b is conditional: the current overlay helper itself scans all N points twice for a nonempty selection. If that remains material, gather selected K point IDs through a reconstruction-scoped ID-to-source-index lookup and source-to-filtered-index mapping. Do not assume IDs are index+1. Prefer an existing authoritative index; otherwise compare a compact sorted ID/index structure (logarithmic lookup), a proven dense-ID representation, and a Map. Account for index construction time and retained bytes before choosing; a multi-million-entry bigint Map can negate memory savings. Release the index on revision changes and dataset disposal.

**P4b acceptance:** after index construction, selection gathering performs O(K) or O(K log N) lookup work instead of a full-cloud scan; selected membership and point IDs match the original output; any needed deterministic ordering is preserved; index bytes and construction time are reported; no unacceptable load-time/memory regression. Proposed target: selection-to-present p95 <=50 ms on the documented reference fixture/device, or a clear measured improvement with the remaining bottleneck identified.

## P5: manage bitmap and GPU texture ownership

**Ownership:** `useFrustumTexture.ts`, `frustumTextureCache.ts`, `frustumTextureResources.ts`, selected-image cache integration, plane display/visibility consumers, and diagnostics. Coordinate lifecycle identity with P1.

Implement explicit acquire/release leases or equivalent reference ownership for textures/bitmaps used by mounted materials. Cache recency alone is insufficient. Inactive textures are disposable; active textures remain pinned until consumers detach. A bitmap cannot be closed while an active texture may upload from it. Dispose texture references before closing backing bitmaps, including dataset teardown and failed asynchronous decode.

Account separately for decoded bitmaps and estimated GPU texture bytes, including actual dimensions/format/mip policy. Begin with configurable inactive-cache budgets (candidate 64 MiB decoded, 128 MiB GPU estimate), then tune against P0. Report pinned bytes separately: a cache eviction policy cannot guarantee a hard total budget when the visible scene itself exceeds it. Release texture leases for nonrendered planes only after confirming display/selection semantics, and reload on visibility. If active demand exceeds capacity, retain correctness and report pressure; changes to quality or visible-plane count require a separate product decision.

Add a real bounded decode/upload queue where measurements show bursts. The current exported frustum pause/resume functions are no-ops; do not rely on them as throttling. Selected media must remain serviceable while speculative work is paused. Guard both result publication and finally cleanup by generation/token, and notify mounted consumers when resources become ready or change.

**Acceptance:** no white planes, disposed texture use, or detached-image upload warnings; one consumer unmounting cannot dispose a shared resource; stale decodes close their bitmaps and do not overwrite/delete newer work; inactive retained bytes obey budgets; selected high-resolution texture stays valid; repeated visits plateau in owned inactive memory; pressure from pinned resources is explicit. Validate with real WebGL and available hardware WebGPU, not mocks alone.

## P6: move reconstruction ownership off the UI thread

**Ownership:** `src/parsers/wasmParser.ts`, `src/wasm/`, proposed reconstruction worker/service/protocol, reconstruction store/actions, point-cloud snapshot integration, observation consumers, export/transform/deletion paths. This is an architectural migration, not a small loader edit.

First map every synchronous wrapper consumer: rendering arrays, statistics, lazy observations, matches, floor operations, export writers, transforms, and deletion. Establish a worker-owned authoritative reconstruction, with a main-thread immutable render/metadata snapshot and an async service for operations. The current wrapper instance, WASM views, and embind objects cannot be transferred as a live object to the UI.

Include post-parse statistics, covisibility and reverse-index construction in worker ownership before enabling the new load path. Existing track-pair loops have sum(trackLength squared) work; relocating them changes responsiveness, not computational complexity. Measure whether exact lazy/on-demand connectivity is warranted as a separately scoped algorithm change. Avoid duplicating image-to-point membership structures introduced by P4. Build transferable render buffers in the worker where possible and measure main-thread snapshot installation/upload independently.

Use protocol messages carrying request ID, dataset generation, operation, payload, progress phase, and typed error/result. Validate message shapes and dataset/parser inputs. Keep rendering snapshots in transfer-owned ArrayBuffers copied out of WASM where necessary; never detach live WASM memory. Read File data inside the worker where possible, retain the original image binary there for lazy observations, and avoid retaining duplicate full input buffers on both threads. Document ownership for every transferred buffer and every retained source File.

Stage migration: (1) define service/snapshot contracts and a current-thread adapter for parity; (2) implement worker init/load/snapshot/dispose plus async observations; (3) migrate statistics/matches and editing/export workflows; (4) enable worker mode only once required capabilities are complete. A worker-only parse followed by full reparse/reconstruction on the UI thread does not meet this specification. Do not ship an interactive mode that silently disables exports or editing.

Cancellation invalidates generation immediately and can terminate/recreate the worker to interrupt synchronous WASM parsing; an abort message alone cannot interrupt a busy worker. Ignore stale progress/results, terminate orphan workers on teardown, and define bounded recovery from worker crashes/init failure. Preserve an explicit compatible fallback when workers/WASM fail, with telemetry distinguishing fallback; do not endlessly retry deterministic malformed inputs. Avoid SharedArrayBuffer as a new requirement in the first implementation.

**Acceptance:** binary/text and optional rig/frame fixtures preserve counts, IDs, observations, exports, transforms, deletion and undo behavior where supported; Python round trips pass for changed binary/WASM contracts; load cancellation/switch and worker failure recover without stale UI or leaks. Trace shows COLMAP parse execution outside the main thread and the UI remains responsive during that stage. Measure snapshot conversion/upload separately: worker parsing is not a promise of zero main-thread long tasks. Report peak main + worker + WASM memory and cold-start cost; no duplicated resident reconstruction solely to preserve the old API.

## P7: render only when needed, with explicit animation activity

**Ownership:** Scene3D, trackball event/frame loops, animation hooks, texture-ready invalidation, picking, recording, culling, FPS instrumentation, Spark/WebGPU integrations. Do this after the more isolated data optimizations.

Create a central activity policy whose inputs identify continuous work: orbit/fly interaction and inertia, keys held, auto-rotation, fly-to, animated selection/lines, splat progressive work, recording, and other audited useFrame consumers. Begin with demand mode only for a settled nonsplat scene whose animations are off. Keep the existing continuous mode for unverified backend/recording cases until parity is proven.

Event handlers must request the first frame; active animation schedules subsequent frames until it settles. Invalidate on asynchronous texture/geometry readiness, relevant store changes, resize/DPR changes, camera changes, and point-picking pointer movement. Replace frame-count-only visibility/culling schedules with a dirty/time policy that completes when the camera settles; otherwise demand mode can stop before a plane updates. Reset/cap elapsed time after idle/visibility changes to prevent camera jumps.

**Acceptance:** settled nonsplat scene renders at most one incidental frame per second averaged over a 10-second idle window after settling; no continuous animation may be silently disabled to satisfy this gate. First interaction wakes promptly; orbit/fly damping, touch, wheel, keyboard, goto, hover/picking, animated colors, plane culling, image decode completion, screenshots/recording, and visibility return remain correct. Verify each splat backend separately before extending demand mode. Compare screenshots and frame traces; retain a small explicit continuous fallback policy.

## P8: defer startup code only when the bundle proves a benefit

**Ownership:** `ViewerToolModals.tsx`, modal import boundaries, Vite configuration only if justified, and relevant interaction tests.

Measure production import graphs and requests. Try conditional lazy imports for closed viewer tools, with loading/error UI and preserved editing state where required. Ensure hotkeys, focus, dismissal, and first-open behavior remain compatible. Shared dependencies or eager imports through another path can erase savings. Keep Spark's existing lazy boundary intact. Do not treat the earlier plan's bundle numbers as current measurements, and do not hide regressions by increasing chunk warning thresholds.

**Acceptance:** measurable reduction in initial transferred JS and/or parse/evaluation work; closed tools are not fetched through another eager import; first-open latency is documented and acceptable; no modal state/focus regression. Defer the entire Three canvas only as a separately evaluated behavior change because startup already uses it.

## Validation and execution handoff

Each phase is a focused change with: exact scope, files owned, behavioral invariants, tests, baseline/after evidence, known tradeoffs, and rollback boundary. Run relevant colocated Vitest tests, `npm run lint`, and `npm run build`. Run selected Playwright scenarios serially with `--workers=1`; use the dedicated production harness for performance. Run `npm run test:run` before final integration handoff. Use `npm run test:pycolmap` when parser/export contracts change and `npm run build:wasm` only when WASM sources change. Record missing browser/GPU/Python prerequisites honestly.

No CI timing assertions against arbitrary shared machines. Deterministic checks enforce budgets, request settlement, identity, and update behavior; controlled performance runs establish speed and memory effects. Hardware-only validation remains explicitly outstanding if hardware is unavailable. Do not commit `.tmp/`, `dist/`, generated reports, or Playwright artifacts.

Suggested execution packet:

> Implement phase Pn from this specification using the assigned model/effort. Own only its listed modules and tests; you are not alone in the repository and must preserve unrelated changes. First confirm dependencies and baseline evidence. Implement the smallest complete change satisfying the behavioral invariants. Run the phase acceptance checks, lint/build, and relevant controlled performance comparisons. Return changed files, exact commands/results, measured before/after data, remaining limitations, and a concrete reviewable diff. Do not deploy or commit unless requested. If evidence invalidates the phase's premise, report the counterevidence and revise the proposal instead of forcing the change.
