# Reconstruction service ownership (P6)

The default COLMAP load path creates a dedicated module worker. That worker parses the files, constructs image statistics, exact covisibility and reverse point membership, and produces the render snapshot. Binary files use the existing WASM parser and lazy observation reader. Text files and unavailable WASM use the JavaScript parsers in the same authority. The UI does not parse those files again to preserve the old wrapper API.

`src/wasm/reconstructionProtocol.ts` defines requests, responses and the render contract. `reconstructionAuthority.ts` owns the data and implements the operations. `reconstructionService.ts` handles transport, revision checks, cancellation and recovery. `reconstruction.worker.ts` serializes requests inside the worker. Main-thread consumers use `ReconstructionSnapshot`; the structural `ReconstructionPointSource` interface also supports the legacy wrapper for existing callers and tests.

## Resident ownership and transfers

| Resource | Owner and lifetime |
| --- | --- |
| Original COLMAP `File` references | The loaded-files store and service retain the same original references. The service keeps them for one possible crash recovery, then drops its references on disposal. Structured cloning sends file handles to the worker; the UI does not read full input ArrayBuffers. Browser-managed File backing storage is not assumed to be free. |
| Camera/point binary read buffers | Read in the authority. Temporary parse inputs are released after loading. WASM owns parsed records. |
| Original images binary ArrayBuffer | Retained only by the authority's WASM wrapper for lazy observations. Released when the authority materializes editable records or is disposed. |
| WASM heap, embind wrapper, live typed-array views | Stay in the authority. No live view or wrapper is posted to the UI. Disposing/materializing also releases the module cache reference. |
| Snapshot positions, colors, errors, track lengths, IDs | New dedicated arrays copied from WASM or assembled from JavaScript records, then transferred to the UI. Their combined payload is 40 bytes per point: 12 positions + 12 colors + 4 errors + 4 track lengths + 8 IDs. The worker loses these buffers on transfer. They are immutable by contract and remain valid independently of later worker memory growth. |
| Snapshot metadata, statistics and connectivity | Constructed in the authority and structured-cloned to the UI. The authority retains source camera/image/track records but does not retain the generated statistics maps after posting. The UI snapshot has no full point-record map and no observation arrays. |
| Reverse point membership | The WASM authority builds a dedicated `BigUint64Array`, `Float64Array` image IDs, and `Uint32Array` offsets directly from CSR tracks. JavaScript authority data uses the existing Set builder and then packs it. These buffers transfer to the UI, which installs native Map entries containing read-only Set views. Iteration preserves the original Set order and does not materialize a boxed ID index. Temporary worker indexes are released after snapshot construction. |
| Requested observations | Only requested image observations are returned asynchronously. Binary reading remains lazy. Modal consumers cancel stale requests and release cached data when their source changes. |
| Floor distances | Computed in the authority and transferred as a dedicated Float32Array. Histogram responses contain only small aggregate results. |
| Export bytes | Serialized in the authority into dedicated byte arrays and transferred to the UI for download. ZIP packaging and optional image/mask gathering retain their existing download path. |

The 40-byte point payload excludes Three.js derived colors/filter buffers and GPU allocations, metadata maps, original File backing storage, observation responses, and all authoritative records. `renderBytes`, `wasmHeapBytes` and `retainedImageBufferBytes` diagnostics report these particular owned quantities separately; they are not total process memory. `wasmHeapBytes` uses the live point view's backing buffer because this Emscripten build does not expose `Module.HEAPU8`.

Compact reverse membership adds 8 bytes per unique image/point membership, 12 bytes per image and one 4-byte terminal offset. `membershipBytes` reports that payload and `membershipPackMs` reports worker packing time, included in `snapshotMs`. The UI installs only one view object per image. The views support `size`, `has`, all Set iterators and `forEach`, with no mutation API. Only optional `has` calls build native lookup Sets, bounded to eight images and 65,536 total IDs per snapshot; larger individual memberships use a scan. The indexed selection renderer iterates the views directly and does not use this cache. Image IDs remain exact safe integers, point IDs remain unsigned 64-bit bigints, and packing rejects offset overflow instead of truncating it.

For WASM data, statistics skip boxed reverse-membership Sets and point-ID reads. Numeric statistics and exact covisibility retain the same loops and counting semantics, including duplicate or unknown image references. Two CSR passes count and fill compact membership, with per-image point markers deduplicating repeated image references in one track. Strictly increasing point IDs prove uniqueness without another index. Unsorted IDs use a temporary native uint64 sorted copy (8 bytes per point) to check uniqueness; their original iteration order is retained. Duplicate point records accepted by the old binary parser use the original Set-based dedup policy as a compatibility fallback. JavaScript/text data and edited full records continue using the established Set builder before packing.

## Editing, exports and consumers

Transforms and committed image deletion materialize point records and observations only inside the authority, release the old WASM owner, apply the existing pure policies and publish a new snapshot revision. Point IDs, camera/rig metadata and observation remapping use the existing serializers and transformation/filtering helpers. Camera conversion updates the authority before installing its new metadata. Export with a pending transform produces a temporary transformed reconstruction inside the authority and does not mutate the installed dataset. This preserves pending deletion/transform undo behavior; committed edits retain the existing undo limits.

The migration covers point rendering/picking, bounds, selection membership and matches, lazy image detail observations, floor detection/alignment, histograms, camera conversion, export writers, transforms and deletion. Main-thread statistics and match consumers read the completed snapshot indexes. New snapshots preserve service identity while changing data identity so rendering caches invalidate on real edits. Queued operations validate their starting revision; stale consumers cannot apply results to a replacement reconstruction.

Some operations still require substantial temporary memory: binary export realizes point records, transforms/deletions realize the editable reconstruction, snapshot replacement briefly overlaps old and new UI arrays, and structured cloning installs metadata on the UI. Exact covisibility retains the existing sum-of-squared-track-length cost. Worker placement improves where this work executes; it does not eliminate computation or promise zero main-thread long tasks.

## Cancellation and compatible fallback

Load generations cover PLY classification, configuration reads/application, parsing, post-parse work and installation. Starting another load or clearing the dataset aborts the previous generation immediately. Active worker parsing is interrupted by terminating the worker, rather than queuing an abort behind a synchronous WASM call. Stale progress and results are ignored, and all pending transport requests settle. Configuration and standalone PLY parsing also check cancellation before publishing state. Worker snapshot installation omits the old 200 ms paint delay because worker progress/result delivery already yields to the UI. Current-thread fallback retains that delay. Cache clearing happens after the final current-generation check, immediately before source installation.

Independent observation/floor/histogram cancellation rejects that consumer without terminating a worker shared by other requests. Worker initialization has a 15-second timeout. Worker unavailability, initialization failure or a transport crash permit at most one switch to the compatible current-thread authority. After a crash, original Files are loaded there and only confirmed edits are replayed before retrying the operation. Typed input/operation failures do not trigger this replay. The log distinguishes `worker` from `main-thread-fallback` and `wasm` from `javascript`; fallback work can block the UI thread.

## Verification

`reconstructionAuthority.test.ts` covers binary/text fixtures with rigs/frames, sparse bigint IDs, lazy observations, transfer detachment, transforms, deletion, camera updates and binary/text/PLY exports. `reconstructionService.test.ts` covers protocol payload validation, generation/revision handling, worker termination, independent consumer cancellation, input failures, one-time crash replay and initialization timeout. File-import/workflow/point-cloud-only tests cover stale asynchronous reads and installation.

`compactPointMembership.test.ts` covers direct CSR and Map membership parity, all read-only Set operations, insertion order, sparse IDs above the safe-number range through the maximum uint64 value, repeated image references, unknown images, duplicate point records, empty tracks, missing-ID compatibility, transfer detachment and invalid offsets. `imageStats.test.ts` compares the worker's membership opt-out against the unchanged Map/default-WASM statistics and confirms it never reads point IDs.

`e2e/reconstruction-worker.spec.ts` exercises the normal load path in a real Chromium worker for binary and text, checks worker-local parsing measures, invokes observation and edit workflows, reparses actual downloaded binary files, verifies disposal, and clears a pending worker load. These functional tests use the development server; performance claims must use the separate production harness. Python round trips validate the existing binary writer contracts. No C++/WASM source contract changed.

Final functional verification on 2026-09-12:

| Command / scope | Result |
| --- | --- |
| `npx vitest run src/parsers/imageStats.test.ts src/wasm/compactPointMembership.test.ts src/wasm/reconstructionAuthority.test.ts src/wasm/reconstructionService.test.ts src/hooks/fileDropzoneWorkflow.test.ts` | 53 tests passed after the direct CSR and worker-delay changes. |
| `npx playwright test e2e/reconstruction-worker.spec.ts --project=chromium --workers=1 --reporter=line --output=.tmp/playwright-reconstruction-final` | All 3 tests passed on the final source in 10.0 seconds. |
| `npx tsc -b --pretty false` and focused ESLint for changed parser/worker/workflow files | Passed after the final implementation changes. |
| `npm run test:pycolmap` | 14 tests passed earlier in this implementation. Subsequent compact membership/statistics changes did not alter C++ or binary writer contracts. |

Production before/after timings, peak process memory and available hardware limits belong in `performance-results.md`. The worker's `colmap-parse`, `colmap-statistics` and `colmap-snapshot` measures separate its phases; snapshot installation/Three.js uploads still require main-thread/browser measurement.
