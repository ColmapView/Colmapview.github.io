# SOG Splat Format Support — Design Spec

**Date:** 2026-09-28
**Status:** approved; plan at `docs/superpowers/plans/2026-09-28-sog-splat-format.md`
**Target release:** 0.15.0
**Motivation:** PlayCanvas SOG (`.sog`) is a widely used compressed Gaussian-splat distribution format, roughly 5–20× smaller than PLY for the same scene. ColmapView accepts only `.ply` and `.spz`. An earlier custom SOG decoder was disabled after it produced malformed Gaussians that hung the GPU (Windows TDR, `DXGI_ERROR_DEVICE_HUNG`) and has since been removed.

## Purpose

Load and render standard PlayCanvas SOG bundles as a third splat format next to PLY and SPZ, wherever a splat can be loaded today, with defensive validation so that a malformed or oversized file cannot hang the GPU, crash a phone, or poison renderer state.

## Evidence (spike, 2026-09-28)

- Spark 2.2 (`@sparkjsdev/spark`, already a dependency) decodes PlayCanvas SOG natively: `SplatFileType.PCSOGSZIP` for bundled `.sog` and `PCSOGS` for `meta.json`, versions 1 and 2, with the type selected from `fileName`.
- Files written by `@playcanvas/splat-transform` 3.7 (`-g cpu`) rendered through Spark on SwiftShader matched the source PLY at **52 dB PSNR** (SH degree 1, 40k splats) and **43 dB** (SH degree 3, 5k splats). This held with both `fileBytes` and `stream` input, with no context loss.
- Decoding with PlayCanvas's own reader was faithful: position ≤ 0.13 mm, rotation ≤ 1.8°, colour < 1/255, opacity ≤ 0.4%.
- `splat-transform` stores zip entries uncompressed; other producers may deflate them.
- The custom WebGPU renderer, the PSNR/SSIM evaluator and the byte-less touch loader decode only PLY/SPZ (`src/splat/gaussianCloudLoader.ts` `getGaussianCloudFormatForFile`).
- Backend resolution (`resolveSplatBackend`) is global; auto mode resolves to WebGPU whenever it is available.

## Scope

**In:**
1. `.sog` bundles as a splat format in every load path: local files, folders and dataset zips; direct URLs; Hugging Face and directory-listing discovery; manifests; published datasets.
2. File-aware renderer routing: SOG always renders with Spark; PLY/SPZ keep today's routing.
3. A validation gate for every `.sog` before Spark receives it.
4. A size-based pre-download budget for SOG, plus an exact splat-count ceiling after the header is readable.
5. UI copy, documentation and release notes.

**Out:**
- Encoding (PLY → SOG) in the app. Publishers convert beforehand with `npx @playcanvas/splat-transform in.ply out.sog`.
- Unbundled SOG (`meta.json` plus loose WebP files).
- SOG in the custom WebGPU renderer, and therefore GPU PSNR/SSIM for SOG.
- An exact remote splat count before download (it would need range reads into the zip).

## Design

### 1. File policy and default choice (`src/utils/splatFilePolicy.ts`)

- Add `.sog` to `SPLAT_FILE_EXTENSIONS`.
- Add `supportsWebGpuRenderer(path): boolean`, true for `.ply`/`.spz` and false for `.sog`. This is the single source of truth for "our decoders can read this". It lives here rather than in `gaussianCloudLoader.ts` because e2e specs stub that module's exports.
- `SPLAT_EXTENSION_PRIORITY`: `.sog` = 0, below `.ply` (1) and `.spz` (2).
  - Automatic selection is unchanged for every existing dataset: SOG never wins when a PLY/SPZ exists.
  - A SOG-only dataset selects as today (largest file on a tie in rank).
- Splat picker rows are sorted by file size, ascending, with the path as tie-break, so the user chooses between formats knowingly.
- Hardening outside SOG: the worker's format ternary (`gaussianCloudLoader.worker.ts`) throws on an unknown format instead of decoding it as PLY, and `getGaussianCloudFormatForFile` keeps its explicit throw.

### 2. File-aware renderer routing

**Backend store input.** The splat backend store's `availability` gains `activeSplatRenderer: 'any' | 'spark-only'`. Carrying it inside `availability` means `resolveSplatBackend` and the three preload gates become file-aware without changing their call sites. It is derived from `supportsWebGpuRenderer(activeSplatFile.name)`, and is `'any'` when no splat is active. It is updated whenever the active splat file changes, through a subscription to the reconstruction store's `loadedFiles.splatFile`, so it does not depend on React effect timing.

**`resolveSplatBackend(requested, availability)`.** When `availability.activeSplatRenderer === 'spark-only'`, for any requested backend:

| Spark availability | Resolution |
| --- | --- |
| loaded | `resolved: spark`, with reason "SOG renders with Spark". If WebGPU was forced: "The WebGPU renderer cannot read SOG; using Spark". |
| preload failed | `unavailable`, with reason "Spark renderer unavailable; SOG cannot be displayed" |
| otherwise | `unavailable`, with reason "Preparing Spark renderer for SOG". This is a loading state, the same convention as the existing "Preparing WebGPU splat renderer". |

The metric capability for a SOG gives the reason "PSNR/SSIM needs the WebGPU renderer, which cannot read SOG".

WebGPU availability state is never changed by a SOG. When `activeSplatRenderer === 'any'`, behaviour is unchanged.

**Spark preload gates.** NEED (`shouldPreloadSparkSplatRuntime`), START (`shouldStartSparkSplatRuntimePreload`) and PENDING (`isSparkSplatRuntimePreloadPending`) take the same input. A spark-only active splat needs Spark whatever the WebGPU state, so Spark downloads on demand. The existing function names and call forms stay, because `sparkImportBoundary.test.ts` requires them. NEED and resolution stay consistent by construction, with one shared predicate.

**Consumers.** Consumers read the file-aware `resolution` as before (`useScene3DStoreFacade`, `SplatLayerStoreFacade`, `SplatPsnrEvaluatorStoreFacade`, `useCameraFrustumsStoreFacade`, `useImageGalleryStoreFacade`, `useViewerControlsStoreFacade`), so they all follow the active file.

**WebGPU mount gate.** `isWebGpuGaussianCloudFile` uses `supportsWebGpuRenderer`. A SOG never mounts or decodes in the WebGPU layer, so `setWebGpuBackendState('failed')` cannot be triggered by format.

**Byte-less touch loader.** `shouldActivateSplatSourceByteLess` and `canUseByteLessSplatLoader` require `supportsWebGpuRenderer(source.path)`. A SOG always takes the byte-retaining path. `SplatPickerModal` computes byte-less availability per row, so SOG rows use the 3M ceiling rather than the 4M one.

**Notice.** When WebGPU is forced and a SOG is active, a one-line notice says SOG renders with Spark.

### 3. SOG validation gate (new `src/splat/sogBundle.ts`)

`validateSogBundle(file: Blob, { maxSplats? }): Promise<SogBundleInfo>` runs at the single point where Spark receives a file, in `SplatLayer.loadSplat` before `new SplatMesh(...)`, for every `.sog`. It reads only the zip's end-of-central-directory region and `meta.json` (and at most the first 64 bytes of each texture), never the whole file.

Checks, in order:

1. **Zip structure.**
   - The end-of-central-directory record must be found within the last 64 KiB + 22 bytes.
   - No ZIP64. Entry count ≤ 64.
   - Each entry's name is unique, and its offsets and sizes fall within the file.
   - Supported methods: stored or deflate.
2. **`meta.json`.**
   - Present; ≤ 1 MiB uncompressed (inflated with `fflate` when deflated); valid JSON; an object.
3. **Schema.**
   - **Version 2:**
     - `count` is an integer, 1 ≤ count ≤ 50,000,000.
     - `means.mins` and `means.maxs` are 3 finite numbers each, with |v| ≤ 30 (SOG v2 stores log-transformed positions).
     - `scales.codebook` is a finite array with every value in [-30, 20] (natural-log scale, so e²⁰ ≈ 4.9e8 units at most). This bound is meant to catch the garbage-scale failure mode.
     - `sh0.codebook` is finite.
     - Every `files` list is non-empty.
     - `shN`, if present, has a finite `codebook` and integer `bands` in 1–3.
   - **Version 1:**
     - `means.shape[0]` is the count, with the same bound.
     - The `mins`/`maxs` arrays are finite, with the same range rules where applicable.
     - `files` are present.
4. **Referenced files.** Every file named in `meta.json` exists as a zip entry.
5. **Texture capacity.** For each of `means_l`, `means_u`, `quats`, `scales`, `sh0` (version 2), read the WebP header, inflating up to the first 64 bytes when deflated, with the existing `readImageDimensions`. `width × height` must be ≥ count.
6. **Device ceiling.** On touch devices SplatLayer passes `maxSplats = TOUCH_SPLAT_DISABLE_MIN_SPLATS` (3M). This is the ceiling at which `getSplatDeviceTier` disables a splat when the byte-less loader is not in play, and SOG never uses that loader. A count above it is a hard stop, even if the size-based estimate let the download proceed. Desktop passes no ceiling, matching `getSplatDeviceTier`, which is always `'ok'` on desktop.

On failure, the gate throws `SogBundleError` with a user-facing reason. SplatLayer handles it through its existing Spark load-failure path (`failSplatLoading` plus the warning notification), with the message "This SOG file can't be opened: <reason>". No `SplatMesh` is created, and the WebGPU and Spark availability states are untouched. Other splats in the picker and the COLMAP scene keep working, whatever the existing failure path does with the failed selection.

`SogBundleInfo` (`version`, `count`, `shBands`) is available for logging and for the picker once a file is local.

### 4. Discovery and pre-download budget

- Hugging Face tree and directory-listing discovery pick up `.sog` through `isSplatFilePath`. `defaultClassifySplatUrl` accepts `.sog` without probing (count `null`); its stale comment is corrected.
- `SPLAT_BYTES_PER_SPLAT_ESTIMATE['.sog']` is set from a measured SH0-only `splat-transform` encode (the most compact case, so the count estimate is highest and the gate strictest). The measurement uses at least 3 sizes (10k, 100k, 500k); take the minimum bytes-per-splat and round down. The value and its method are recorded in a comment.
- `getSplatAutoLoadDecision`: for a `.sog` candidate on touch devices, auto-load additionally requires the estimated count to be under the touch ceiling. PLY/SPZ decisions are unchanged.
- Manifests: a listed `.sog` is loaded as a splat (it already passes through `findSplatFileSources` once the extension is listed).
- Publishing: `.sog` sources publish as `splats/<path>` unchanged. Recipients rediscover them through Hugging Face discovery.

### 5. UI and documentation

- Drop-zone hover card and panel copy list `.sog` (`dropZoneHoverCardViewModel.ts`, `dropZonePanelViewModel.ts`).
- README splat formats; `docs/splat-webgpu-migration.md`, which already describes a Spark-only format precedent; `docs/hugging-face-publishing.md` (publishing SOG and the pre-conversion command); 0.15.0 release notes.

## Error handling summary

| Situation | Behaviour |
| --- | --- |
| Invalid/corrupt `.sog` | Message with the reason; the scene and other splats keep working; no renderer state change |
| `.sog` over the device ceiling (exact count) | Refused on touch devices with a message naming the splat count and limit |
| Spark unavailable (preload failed) | Existing unavailable notice; SOG cannot display; PLY/SPZ on WebGPU unaffected |
| WebGPU forced + `.sog` | Renders with Spark; notice explains |
| Switching `.sog` ↔ `.ply` tiles | Resolution follows the active file; WebGPU state remains `ready` |

## Testing

**Unit tests:**
- File policy: extension list, `supportsWebGpuRenderer`, priority and size ordering.
- `resolveSplatBackend` and the three preload gates with a spark-only active splat, across WebGPU `unavailable`/`ready`/`failed`, Spark loaded/pending/failed, and requested `auto`/`webgpu`/`spark`. Also the NEED ⇔ resolution consistency.
- The store subscription updating `activeSplatRenderer`.
- WebGPU mount gate, byte-less gate and picker per-row ceiling.
- Budget estimate and auto-load decision for SOG.
- The worker's unknown-format throw.
- `validateSogBundle`:
  - valid fixture, version 2, stored;
  - a deflated `meta.json` variant;
  - version 1 `meta.json`;
  - missing texture;
  - malformed JSON;
  - oversized `meta.json`;
  - non-finite and out-of-range codebooks;
  - count vs texture capacity mismatch;
  - ZIP64 or truncated/garbage zip;
  - over-ceiling count on touch.
- SplatLayer shows the error path without mounting a mesh.

**Fixtures:**
- `e2e/fixtures/splats/sog-scene.sog`, a few thousand splats with SH degree 1, generated by `@playcanvas/splat-transform`.
- Its source `sog-scene.ply`.
- A generation script, `scripts/generate-sog-fixture.mjs`. It is a development-time tool that uses `npx`; it is not added as a dependency.
- Corrupt variants are derived inside tests by rewriting zip entries with `fflate`.

**E2E (Chromium):**
- A folder with sparse model + `.sog` renders through Spark (renderer status and a non-empty canvas).
- On a WebGPU-capable project: load a `.sog`, then a `.ply` in the same session. The `.ply` renders with WebGPU (no state poisoning).
- A corrupt `.sog` shows the error, and the viewer and COLMAP scene remain usable.
- Visual parity: the fixture as SOG vs PLY, both with `?splatBackend=spark`, compare at ≥ 35 dB PSNR.
- Existing guard: "auto mode does not download Spark" for PLY-only sessions still passes.

**Release gates:** `npm run lint`, `npm run test:run`, `tsc -b --force`, `npm run build`, `npx playwright test --workers=1` (Chromium and Firefox), `npm run test:pycolmap`.

## Risks

- **Spark decode correctness on real-world SOG** from other producers (SuperSplat, v1 files). Mitigation: validation gate; the v1 schema checked; parity test on the fixture.
- **Estimate too loose for SH-heavy SOG.** The estimate is intentionally from the SH0 case (strictest). After the file is local, the exact-count ceiling in the gate is the hard stop.
- **e2e module stubs** (`webgpu-psnr-app.spec.ts` stubs `gaussianCloudLoader.ts` exports). New capability code lives in `splatFilePolicy.ts`, so the stubs need no new exports.
