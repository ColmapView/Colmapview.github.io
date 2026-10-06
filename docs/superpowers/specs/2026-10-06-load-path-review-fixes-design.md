# Load-Path Review Fixes — Design

**Date:** 2026-10-06
**Source:** `/code-review` of the six unreleased commits `v0.15.4..0a1d01c` (Drive workflows, dual-host deploy, deferred splat downloads). 25 findings survived verification; the user approved fixing items 1–5 of the suggested-fix list first. This spec covers exactly those items. Every finding below was re-checked against the code before this spec was written.

## Findings in scope

| # | Finding | Where |
|---|---------|-------|
| F1 | "Cancel loading" calls the store's full `clear()`, destroying the scene already on screen (dataset, WASM wrapper, active ZIP, edits). | `src/components/dropzone/DropZone.tsx:290` |
| F2 | After cancelling a `?url=` / `#d=` startup load nothing restarts it, yet `hasUrlLoadRequest = hasUrlToLoad() && !urlError` stays true, so the landing panels never return. | `src/components/dropzone/useDropZoneStoreFacade.ts:34` |
| F3 | `AbortSignal.any` is called unguarded on every load path. Safari/iOS < 17.4, Chrome < 116 and Firefox < 124 (incl. ESR 115) throw `TypeError` and cannot open any dataset. | 8 call sites (Task 1 lists them) |
| F4 | Private/gated Hugging Face ZIP/TAR URLs fail: `loadZipFromUrl` sends an anonymous HEAD via global `fetch` (`validateZipUrl`), gets 401, and throws before the token-aware download runs. | `src/utils/zipLoader.ts:277` |
| F5 | Every HF load first calls `GET /api/datasets/<repo>?expand=private`; any 429/5xx/network failure aborts loads of public datasets whose files would still be served. v0.15.4 continued on API failures. | `src/hooks/useUrlLoader.ts:196,260`, `src/features/huggingface/datasetAccess.ts:60` |
| F6 | With splat downloads deferred, a single auto-loadable splat opens the splat picker during its whole download (catalog merge happens before restoration). Closing the picker (`handleSelect('')`) cancels the auto-load. | `src/store/reconstructionStore.ts:366-378`, `src/hooks/urlLoaderManifestSource.ts:133` |
| F7 | Reload re-processes `droppedFiles`, which no longer contain the deferred (auto-loaded or manifest-listed) splat, so the splat and every remote tile disappear. | `src/hooks/fileDropzoneWorkflow.ts:543`, 3 Reload call sites |
| F8 | `activateSavedSplat` now re-selects splats whose bytes are already loaded; `selectSplatSource`'s `source.file` branch force-clears `urlLoading`/`urlProgress`, hiding the overlay while the renderer still decodes the first splat. | `src/store/reconstructionStore.ts:412-424`, `src/hooks/useUrlState.ts:91` |
| F9 | The 3 s deadline for the optional `colmapview.yaml` starts at load start, in parallel with the COLMAP downloads, although the result is only needed after parsing. On a slow connection the saved splat alignment, camera and display settings are silently dropped and auto-load is skipped. | `src/hooks/urlLoaderManifestSource.ts:74-83`, `src/hooks/urlLoaderViewerState.ts:21-48` |

## Required behavior

1. **Cancel stops only the work in progress.** Clicking "Cancel loading" aborts the URL load (its controller), any lazy splat download, and any pending reconstruction parse/extraction. It never disposes the current WASM wrapper, never closes the active ZIP, and never nulls `reconstruction`/`loadedFiles`/`droppedFiles`/source info. Loading state (`urlLoading`, `urlLoadActive`, `urlLoadController`, `urlProgress`) is reset.
2. **Cancelling a renderer decode** (no lazy download pending and the progress belongs to the active splat file) deactivates that splat (COLMAP only) and records it as an explicit choice (`splatSelectionRevision + 1`). The splat's source stays listed.
3. **Cancel with nothing loaded** strips the `?url=` / `#d=` request from the address bar (existing `clearUrlLoadRequestFromLocation`) so the landing panels return. With a scene loaded the address bar is untouched.
4. **No `AbortSignal.any` on any path.** One helper `anySignal()` uses the native API when present and a listener-based fallback otherwise. A lint rule forbids direct use.
5. **HF archive HEAD uses the token-aware dataset fetch** (`fetchDatasetResource`), exactly like the download that follows it.
6. **HF access pre-check is fatal only for definitive answers:** 404 (existing messages), other 4xx except 408/429, thrown `HfError`s (sign-in required / expired / denied), and cancellation. 408, 429, 5xx, timeouts and network errors are logged and the load continues; the file requests decide.
7. **The splat picker opens only after restoration settled with nothing active.** Merging a catalog never opens it. After `applySavedViewerState` finishes, the URL loader offers the picker when: a remote catalog was merged in this load, the effective restored source id is not `''` (explicit None), the user made no choice since the load began, and no splat is active. Closing the picker keeps meaning "COLMAP only".
8. **Reload keeps remote splat tiles.** The three Reload actions re-process the dataset with `preserveRemoteSplatSources`: url-bearing sources from the current `loadedFiles` that the file map does not contain are carried over (downloaded bytes included), and the active splat stays active when it belongs to a carried-over source (byte-less placeholders included). The renderer is not handed the loading state when the committed splat file is the one already rendered.
9. **Re-selecting the already-active splat keeps the renderer's progress.** In `selectSplatSource`'s already-downloaded branch, when the source's file is the active file and `urlProgress` is that file's splat-loading progress, `urlLoading`/`urlProgress`/`urlError` are left unchanged. A superseded lazy download indicator is still cleared, as today.
10. **The optional-settings deadline starts when the result is needed** (after COLMAP parsing on the manifest path; unchanged for the sequential splat-URL and archive paths). The request itself still starts at load start. On timeout every optional-settings path shows one persistent warning notification instead of failing silently.

## Decisions

- **Cancel during decode deactivates the splat** rather than hiding the overlay while decoding continues: "Cancel loading" must leave the scene in a state the user chose. This reuses the existing COLMAP-only transition (`clearActiveSplatFile`).
- **Late settings are not applied after a timeout.** Applying camera/transform/display changes after the user starts interacting is out of scope. The deadline move fixes the common slow-connection case; the warning makes the rare remaining case visible.
- **The picker decision moves to the URL loader** (`offerSplatPicker` store action) because only the loader knows whether restoration selected a splat. `mergeRemoteSplatCatalog` becomes a pure merge.
- **Reload uses an explicit option**, not Map-identity detection, so a fresh load can never inherit tiles from the previous dataset.

## Out of scope

Suggested fixes 6–9 (publishing size `0`, Drive mask probe, Drive icon target, privacy policy, CI cache poisoning) and the open decision on HF sign-in/publishing for `/dev/` builds. They are tracked in the review and will be handled separately.

## Constraints

- Full `vitest run`, `tsc -b --force`, `npm run lint` and `npm run build` must pass before the branch is considered done. Baseline before work: 564 files / 4,343 tests passing.
- Components reach stores only through `*StoreFacade` modules (`src/components/componentStoreBoundary.test.ts`).
- Hand-written CSS only; no new classes are needed for this work.
