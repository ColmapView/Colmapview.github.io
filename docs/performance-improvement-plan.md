# Performance improvement plan

Verified against v0.14.2 on 2026-09-06. This is an implementation plan;
production behavior has not been changed. Runtime speedups are not yet measured.

## Confirmed findings

| Finding | Evidence | Qualification |
| --- | --- | --- |
| No shared URL-media concurrency budget | `imageGalleryFetchPolicy.ts` batches five requests; `useImageGalleryVisibleImageFetch.ts` starts image and mask batches independently; `prefetchUrlImages` has its own five-request batches. `urlImageFiles.ts` calls fetch directly. | There is batching and duplicate-request coalescing already. The missing piece is coordination across callers within a page. |
| No HTTP 429 cooldown | URL image/raw/mask fetch paths do not inspect Retry-After or defer subsequent requests after 429. A browser log in this session recorded 429 for cam_1/02.png. | A local limiter cannot guarantee compliance with host quotas shared across tabs/users. |
| URL file caches lack eviction | `imageFileRequestState.ts` uses a Map without byte/count limits or eviction; `registerCaches.ts` registers clear/stat hooks, not a budget. | Other thumbnail/texture caches already have their own policies. File.size does not measure decoded images or GPU memory. |
| Cancellation does not reach active media fetches | Gallery cleanup only sets a boolean checked between batches. URL fetch calls have no AbortSignal. | Do not cancel a coalesced request while another consumer still needs it. |
| Cache clearing can strand waiters and accept obsolete writes | clear() removes callback lists; completeRequest() cannot settle removed waiters. URL fetch completion writes without checking dataset generation. | The helper is shared by ZIP caches, so lifecycle fixes need ZIP regression coverage too. |
| Some startup code can potentially be deferred | Built HTML preloads Three.js; main app chunk is 291.81 KB gzip and Three.js 299.79 KB gzip. ViewerToolModals statically imports its four tools. | 591.60 KB is combined transfer size, not achievable savings. Spark is already dynamically imported. Shared dependencies may limit modal-splitting savings. |

A scratch reproduction loading the real TypeScript request-state helper confirmed
that a waiter remains unresolved after clear followed by completion, and that a
write after clear is accepted. Artifact: `.tmp/verify-image-cache.cjs`.
This is helper-level evidence, not a full browser reproduction of dataset mixing.

## Implementation order

Implement sequentially, one reviewable change per phase. Keep renderer/backend
behavior, scene quality, raw PSNR data, and UI design unchanged. Avoid a new
dependency unless measurement demonstrates a need.

### 0. Record a reproducible baseline — small effort

- Serve the production build, not the Vite development server.
- Measure empty startup, a local large dataset, and a controlled HTTP fixture
  with delayed images, masks, 404, and 429 responses. Avoid hammering the public
  toy host. Use the same browser, viewport, dataset, and cache state for comparisons.
- Record initial JS transfers, requests in flight, duplicate fetches, time to
  first visible thumbnails, stale work after dataset switching, cache-owned
  bytes, and long tasks while scrolling. Repeat runs; compare medians and spread.
- Distinguish cold-cache and warm-cache runs. Also exercise touch emulation.
- Use browser network/trace tooling when available; current confirmation is
  code-based and does not include a DevTools performance trace.

### 1. Make request lifecycles safe — medium effort, first priority

Primary files: `src/utils/imageFileRequestState.ts`, `urlImageFiles.ts`,
`zipImageFiles.ts`, dataset adapters, and cache-clear integration.

- Give each pending operation a unique token and generation. Completion must
  match both before writing a cache or settling that operation's waiters.
- On clear, invalidate the generation, settle existing waiters once with null,
  abort owned URL requests, and remove queued work. Old finally blocks must not
  delete a new operation that happens to use the same URL/name.
- Pass AbortSignal through URL fetch/body consumption. Guard asynchronous
  compression completion too: abort cannot undo already-running encoding.
- Scope image/mask state and absence counters to the dataset generation; use
  resolved URL plus representation (display/raw/mask) for request identity.
- Preserve raw-image bytes used by metrics. ZIP extraction may be uncancellable;
  discard obsolete completion instead of pretending extraction was aborted.

Acceptance tests: duplicate callers all settle exactly once; clear during fetch,
body read, and compression; old/new datasets with identical image names; stale
completion cannot clear or fulfill a new request; ZIP clear semantics still work.

### 2. Coordinate downloads and rate limits — medium effort

Add a small shared URL-media scheduler consumed by image, raw-image, mask, and
prefetch paths. Keep scheduling separate from cache retention.

- Initial configurable policy: four active transfers per origin, eight per page;
  validate/tune these starting values using phase 0 fixtures.
- Hold a transfer slot through body consumption, not merely until response headers.
- Prioritize the selected image, then visible gallery items, then prefetch;
  include fairness so background work eventually progresses.
- Coalesce equivalent requests. Track consumer cancellation; abort an active
  operation only when its last consumer leaves or the dataset is invalidated.
- On 429, pause that origin. Parse Retry-After seconds or HTTP dates when exposed
  by CORS; otherwise use bounded exponential backoff with jitter. Allow two retries
  after the initial attempt. Make all waits abortable and release transfer slots
  during cooldown. Long server deadlines must not be shortened to retry early.
- Do not retry ordinary 4xx errors. Only definitive 404 mask misses should count
  toward absence detection; 429/network failures must not disable mask loading.
- Report a useful rate-limit failure after retry exhaustion. No infinite loops.
- First version is page-scoped. Cross-tab coordination is explicitly deferred.

Acceptance tests: aggregate limits across gallery/prefetch/masks; response bodies
hold slots; fake-clock Retry-After cases; cancellation during cooldown; no retry
storm; no mask-absence poisoning; priority/fairness; duplicate request sharing.

### 3. Bound retained URL files — medium effort

Implement opt-in byte-budget LRU retention for URL images and masks. Preserve
existing ZIP behavior until ZIP-specific requirements are reviewed.

- Start with a shared configurable 128 MiB budget for cache-owned URL File data;
  this is a tuning candidate, not an asserted safe limit for all devices.
- Maintain byte totals incrementally and update recency on reads. Replacement,
  deletion, and clear must keep accounting exact.
- Deliver oversized files to callers without retaining them. Retained bytes must
  never exceed the configured budget after insertion/eviction.
- Eviction only releases this cache's File references. Do not revoke URLs or
  dispose GPU resources owned by downstream caches. Measure those separately.
- Ensure selected/visible consumers retain usable references when entries are
  evicted; verify warm scrolling does not cause persistent refetch thrashing.
- Expose retained bytes and eviction counts through existing cache diagnostics.

Acceptance tests: recency, byte accounting, oversized files, separate datasets,
clear during pending requests, active-image stability, and repeat-scroll requests.

### 4. Reduce startup code only where measured — small/medium effort

- Try lazy-loading closed ViewerToolModals first, with conditional mounting and
  a shared Suspense/loading/error boundary. Check whether state should survive
  closing; do not accidentally reset editing workflows.
- Record actual initial gzip bytes and the first-open latency before/after.
  Keep the change only if initial work falls and modal interaction remains smooth.
- Verify production requests: closed tools must not be fetched by eager imports
  through another path. No modal-state, focus, or shortcut regressions.
- Defer delaying the entire Three.js canvas: the startup background and controls
  already use it, so that is a separate product/performance decision.
- Do not migrate Spark or introduce demand rendering as part of this work.

## Validation and delivery

Each phase needs focused Vitest tests for shared policies and lifecycle races,
relevant controlled-network Playwright scenarios, lint, and production build.
Run the full suite before the final release. Fake clocks should make scheduling
tests deterministic; do not assert timing against a loaded machine's wall clock.
Document baseline/after evidence and any tradeoffs. Publish only when requested.

Suggested execution: one repository implementation agent, high reasoning effort
for phases 1–3; normal effort for baseline collection and phase 4. These phases
share lifecycle contracts, so avoid concurrent edits to their core modules.
