# SOG Splat Format Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load and render PlayCanvas SOG bundles (`.sog`) as a third splat format next to PLY and SPZ, routed to Spark per file and gated by a defensive validator.

**Architecture:**
- A single file-policy helper decides whether our WebGPU decoders can read a file.
- The splat backend store carries the active splat's renderer requirement inside its existing `availability` object. That makes backend resolution and all three Spark preload gates file-aware without changing their call sites.
- Every `.sog` passes `validateSogBundle` at the one point where Spark receives files (`SplatLayer.loadSplat`) before Spark decodes it.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest (jsdom), Playwright, `@sparkjsdev/spark` 2.2, `fflate` 0.8 (already a dependency), `@playcanvas/splat-transform` 3.7 (dev-time fixture generation via `npx` only).

**Spec:** `docs/superpowers/specs/2026-09-28-sog-splat-format-design.md`

## Global Constraints

- **Scope:** no encoding in the app. Only bundled `.sog` is supported, not unbundled `meta.json` folders. SOG never uses the WebGPU renderer, GPU PSNR/SSIM, or the byte-less touch loader.
- **Default choice:** existing datasets choose exactly as today. `.sog` priority is 0, below `.ply` (1) and `.spz` (2).
- **Picker order:** rows are sorted by file size ascending, then by path.
- **SOG size estimate:** `SPLAT_BYTES_PER_SPLAT_ESTIMATE['.sog'] = 10`. The measured color-only SOG encodes were 14.42 / 12.39 / 11.60 B per splat at 10k / 100k / 500k splats. The minimum was rounded down with extra margin, because real captures compress better than the synthetic data.
- **Validator bounds:**
  - End-of-central-directory search window: 65,557 bytes.
  - No ZIP64.
  - At most 64 entries.
  - Compression methods: stored or deflate only.
  - `meta.json`: at most 1 MiB.
  - Splat count: 1 ≤ count ≤ 50,000,000.
  - Version 2: `means.mins`/`maxs` are 3 finite values in [-30, 30].
  - `scales.codebook` values: finite, in [-30, 20].
  - `shN.bands`: 1–3.
  - Texture check: `width × height ≥ count`.
- **Device ceiling:** on touch devices, SOG uses `TOUCH_SPLAT_DISABLE_MIN_SPLATS` (3,000,000).
- **User-facing error prefix:** `This SOG file can't be opened: `
- **Resolution reasons (exact strings):**
  - `SOG renders with Spark`
  - `The WebGPU renderer cannot read SOG; using Spark`
  - `Preparing Spark renderer for SOG`
  - `Spark renderer unavailable; SOG cannot be displayed`
- **Preparing state:** "Preparing" is an `unavailable` resolution with the preparing reason. This matches the existing WebGPU `Preparing WebGPU splat renderer` convention; there is no `pending` status.
- **Code rules:**
  - Components reach stores only through `*StoreFacade` modules.
  - No Tailwind; CSS is hand-written.
  - Only `src/utils/sparkSplatRuntime.ts` may import `@sparkjsdev/spark`.
  - Every file that calls `preloadSparkModule(` must also call `shouldStartSparkSplatRuntimePreload(` (enforced by `sparkImportBoundary.test.ts`).
- **Commits:** make commit steps only when the user has authorized commits for this work. Otherwise leave the changes staged-ready and continue.
- **Before release:** run `npm run lint`, `npx vitest run`, `npx tsc -b --force` and `npm run build`. Run `npx playwright test --workers=1` for the whole suite in Chromium and Firefox, and `npm run test:pycolmap`.

## Review Focus

1. **A `.sog` on a WebGPU-ready machine in auto mode.** It must render with Spark. Spark must download on demand. WebGPU availability must stay `ready`, and the next PLY must render with WebGPU (Tasks 2 and 6).
2. **A damaged `.sog`** (missing `meta.json`, truncated zip, garbage scales). The user must see the reason, and no `SplatMesh` may be created. The COLMAP scene and other splats keep working (Tasks 3, 4 and 6).
3. **A large `.sog` on a phone.** It must not auto-load when its estimated count exceeds 3M. After download, the exact `meta.json` count must stop it before Spark decodes (Tasks 3, 4 and 5).
4. **A dataset with both `bicycle.ply` and `bicycle.sog`.** The PLY stays the automatic choice, and the picker lists both by size (Task 5).
5. **Forced `?splatBackend=webgpu` with a `.sog`.** It must render with Spark and show an info note, not the forced-WebGPU failure warning (Task 2).

---

## File Structure

| File | Responsibility | Tasks |
| --- | --- | --- |
| `src/utils/splatFilePolicy.ts` | Extension list, priorities, `supportsWebGpuRenderer`, `getSplatRendererRequirement`, `isSogSplatPath` | 1, 5 |
| `src/components/viewer3d/WebGpuSplatCanvasLayerPolicy.ts` | WebGPU mount eligibility | 1 |
| `src/store/reconstructionStore.ts` | Byte-less gate; active-splat → backend sync subscription | 1, 2 |
| `src/components/modals/splatPickerViewModel.ts` | Per-row device tier, size-sorted rows | 1, 5 |
| `src/splat/gaussianCloudDecode.ts` (new) | Worker-side format dispatch with an explicit unknown-format throw | 1 |
| `src/splat/gaussianCloudLoader.worker.ts` | Uses `decodeGaussianCloudBuffer` | 1 |
| `src/utils/splatBackendPolicy.ts` | `activeSplatRenderer` in availability, Spark-only resolution, preload gates, reason constants | 2 |
| `src/store/stores/splatBackendStore.ts` | `setActiveSplatRenderer` | 2 |
| `src/components/viewer3d/splatBackendNoticePolicy.ts` | Spark-only notices | 2 |
| `src/hooks/useFileDropzone.ts`, `src/hooks/fileDropzoneWorkflow.ts` | File-aware drop-time Spark preload | 2 |
| `src/utils/imageDimensions.ts` (moved from `src/features/datasetPublishing/`) | WebP/PNG/JPEG header dimensions, shared | 3 |
| `src/splat/sogBundle.ts` (new) | `validateSogBundle`, `SogBundleError`, zip reader | 3 |
| `src/components/viewer3d/PointCloud/SplatLayer.tsx` | Validator gate before `SplatMesh`, failure reason | 4 |
| `src/hooks/urlLoaderPolicy.ts`, `src/hooks/urlLoaderManifestFetch.ts` | SOG estimate, touch auto-load count check, comment fix | 5 |
| `src/components/dropzone/dropZone*ViewModel.ts` | UI copy | 5 |
| `scripts/generate-sog-fixture.mjs`, `e2e/fixtures/splats/*`, `e2e/fixtures/splat-probe.ts`, `e2e/sog-splats.spec.ts`, `e2e/webgpu-sog.spec.ts`, `playwright.config.ts` | Fixture and browser coverage | 6 |
| `README.md`, `docs/splat-webgpu-migration.md`, `docs/hugging-face-publishing.md`, `CHANGELOG.md` | Documentation, release notes | 7 |

---

### Task 1: Renderer capability and the WebGPU-only gates

`.sog` is **not** added to `SPLAT_FILE_EXTENSIONS` yet. This task makes every WebGPU-only path reject formats our decoders can't read, so that adding the extension later (Task 5) cannot misroute.

**Files:**
- Modify: `src/utils/splatFilePolicy.ts`
- Modify: `src/components/viewer3d/WebGpuSplatCanvasLayerPolicy.ts:67-69`
- Modify: `src/store/reconstructionStore.ts:97-109` (`shouldActivateSplatSourceByteLess`)
- Modify: `src/components/modals/splatPickerViewModel.ts:85-106` (`getSplatPickerItems`)
- Create: `src/splat/gaussianCloudDecode.ts`
- Modify: `src/splat/gaussianCloudLoader.worker.ts:47-49`
- Test: `src/utils/splatFilePolicy.test.ts`, `src/components/viewer3d/WebGpuSplatCanvasLayer.test.tsx`, `src/store/reconstructionStore.test.ts`, `src/components/modals/splatPickerViewModel.test.ts`, `src/splat/gaussianCloudDecode.test.ts`

**Interfaces:**
- Produces:
  - `supportsWebGpuRenderer(path: string): boolean`
  - `type SplatRendererRequirement = 'any' | 'spark-only'`
  - `getSplatRendererRequirement(path: string | null | undefined): SplatRendererRequirement`
  - `isSogSplatPath(path: string): boolean`, all from `src/utils/splatFilePolicy.ts`
  - `decodeGaussianCloudBuffer(format: GaussianCloudFormat, buffer: ArrayBuffer): GaussianCloud` from `src/splat/gaussianCloudDecode.ts`

- [ ] **Step 1: Write the failing policy tests** (append to `src/utils/splatFilePolicy.test.ts`; add the three new names to its import)

```ts
  it('knows which formats the WebGPU decoders can read', () => {
    expect(supportsWebGpuRenderer('scene.PLY')).toBe(true);
    expect(supportsWebGpuRenderer('dir/scene.spz')).toBe(true);
    expect(supportsWebGpuRenderer('scene.sog')).toBe(false);
    expect(supportsWebGpuRenderer('scene.splat')).toBe(false);
  });

  it('marks SOG as renderable only by Spark', () => {
    expect(getSplatRendererRequirement('bicycle/splat_30000.SOG')).toBe('spark-only');
    expect(getSplatRendererRequirement('scene.ply')).toBe('any');
    expect(getSplatRendererRequirement(undefined)).toBe('any');
    expect(isSogSplatPath('a/b.sog')).toBe(true);
    expect(isSogSplatPath('a/b.ply')).toBe(false);
  });
```

- [ ] **Step 2: Write the failing gate tests**

Append to `src/components/viewer3d/WebGpuSplatCanvasLayer.test.tsx`, inside the `describe` that already tests `shouldMountWebGpuSplatCanvas` with a `.splat` file (around line 250). Reuse that describe's `readyWebGpuAvailability`:

```ts
  it('never mounts the WebGPU layer for a SOG, which only Spark can read', () => {
    expect(shouldMountWebGpuSplatCanvas('auto', readyWebGpuAvailability, new File(['x'], 'scene.sog'))).toBe(false);
    expect(shouldMountWebGpuSplatCanvas('webgpu', readyWebGpuAvailability, new File(['x'], 'scene.sog'))).toBe(false);
  });
```

Append to `src/store/reconstructionStore.test.ts`, inside `describe('reconstruction store byte-less oversized splat activation', …)`:

```ts
  it('keeps the byte-retaining path for an oversized SOG, which the WebGPU decoder cannot read', async () => {
    armTouchWebGpu();
    stubSplatBytesFetch();
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({
      splatFileSources: [
        { id: 'splats/big.sog', path: 'splats/big.sog', url: 'https://x/splats/big.sog', size: 150_000_000 },
      ],
    }));

    await useReconstructionStore.getState().selectSplatSource('splats/big.sog');

    const source = useReconstructionStore.getState().loadedFiles?.splatFileSources?.find((s) => s.id === 'splats/big.sog');
    expect(source?.file?.size).toBeGreaterThan(0);
    expect(loadGaussianCloudFromBytesMock).not.toHaveBeenCalled();
  });
```

Append to `src/components/modals/splatPickerViewModel.test.ts` (import `getSplatPickerItems` if not already imported):

```ts
  it('applies the raised byte-less ceiling only to formats the WebGPU decoder reads', () => {
    const items = getSplatPickerItems([
      { id: 'a.ply', path: 'a.ply', size: 40_000_000, splatCount: 3_500_000 },
      { id: 'b.sog', path: 'b.sog', size: 40_000_000, splatCount: 3_500_000 },
    ], { isTouchDevice: true, byteLessLoaderAvailable: true });
    expect(items.find((item) => item.id === 'a.ply')?.tier).not.toBe('disabled');
    expect(items.find((item) => item.id === 'b.sog')?.tier).toBe('disabled');
  });
```

Create `src/splat/gaussianCloudDecode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decodeGaussianCloudBuffer } from './gaussianCloudDecode';
import type { GaussianCloudFormat } from './gaussianCloud';

describe('worker-side Gaussian cloud decode dispatch', () => {
  it('refuses a format it cannot decode instead of treating it as PLY', () => {
    expect(() => decodeGaussianCloudBuffer('sog' as GaussianCloudFormat, new ArrayBuffer(8)))
      .toThrow('Unsupported Gaussian splat format: sog');
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/utils/splatFilePolicy.test.ts src/components/viewer3d/WebGpuSplatCanvasLayer.test.tsx src/store/reconstructionStore.test.ts src/components/modals/splatPickerViewModel.test.ts src/splat/gaussianCloudDecode.test.ts`

Expected:
- The policy tests FAIL on the missing exports.
- The decode test FAILS because the module is missing.
- The picker test FAILS: the explicit 3.5M count sits under the 4M byte-less ceiling, so `b.sog` is not `disabled`.
- The byte-less test FAILS: `.sog` takes the byte-less branch, whose PLY/SPZ decoder then throws.
- The mount test already PASSES, because `.sog` is not a splat extension yet. It stays as the guard that makes Task 5 safe.

- [ ] **Step 4: Implement the policy helpers** (append to `src/utils/splatFilePolicy.ts`)

```ts
/** Formats our WebGPU renderer, PSNR/SSIM evaluator and byte-less touch loader can decode. */
const WEBGPU_DECODABLE_EXTENSIONS = ['.ply', '.spz'] as const;

export type SplatRendererRequirement = 'any' | 'spark-only';

export function supportsWebGpuRenderer(path: string): boolean {
  const lower = path.toLowerCase();
  return WEBGPU_DECODABLE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function isSogSplatPath(path: string): boolean {
  return path.toLowerCase().endsWith('.sog');
}

/** SOG bundles decode only in Spark; everything else may use either renderer. */
export function getSplatRendererRequirement(path: string | null | undefined): SplatRendererRequirement {
  return path && isSogSplatPath(path) ? 'spark-only' : 'any';
}
```

- [ ] **Step 5: Apply the gates**

In `src/components/viewer3d/WebGpuSplatCanvasLayerPolicy.ts` replace the body of `isWebGpuGaussianCloudFile`:

```ts
export function isWebGpuGaussianCloudFile(file: File): boolean {
  return supportsWebGpuRenderer(file.name);
}
```

Update its import from `../../utils/splatFilePolicy` to `supportsWebGpuRenderer`. Drop `getSplatFileExtension` if it becomes unused.

In `src/store/reconstructionStore.ts`, `shouldActivateSplatSourceByteLess`, add as the first statement:

```ts
  // Byte-less activation seeds the WebGPU decode cache; formats only Spark reads keep their bytes.
  if (!supportsWebGpuRenderer(source.path)) {
    return false;
  }
```

(import `supportsWebGpuRenderer` from `../utils/splatFilePolicy`).

In `src/components/modals/splatPickerViewModel.ts`, `getSplatPickerItems`, replace `const tier = getSplatDeviceTier(source, options);` with:

```ts
    const tier = getSplatDeviceTier(source, {
      isTouchDevice: options.isTouchDevice,
      // The raised byte-less ceiling only applies where the WebGPU decoder serves the render.
      byteLessLoaderAvailable: Boolean(options.byteLessLoaderAvailable) && supportsWebGpuRenderer(source.path),
    });
```

Create `src/splat/gaussianCloudDecode.ts`:

```ts
import { loadPLYFromBuffer, loadSPZFromBuffer } from 'gs-toolbox';
import type { GaussianCloud, GaussianCloudFormat } from './gaussianCloud';

/** Decode dispatch for the worker; an unknown format must never fall through to the PLY parser. */
export function decodeGaussianCloudBuffer(format: GaussianCloudFormat, buffer: ArrayBuffer): GaussianCloud {
  switch (format) {
    case 'spz':
      return loadSPZFromBuffer(buffer);
    case 'ply':
      return loadPLYFromBuffer(buffer);
    default:
      throw new Error(`Unsupported Gaussian splat format: ${String(format)}`);
  }
}
```

In `src/splat/gaussianCloudLoader.worker.ts`:
- Replace the ternary at lines 47–49 with `const cloud = decodeGaussianCloudBuffer(request.format, request.buffer);`.
- Replace the `gs-toolbox` import with `import { decodeGaussianCloudBuffer } from './gaussianCloudDecode';`.

If `loadPLYFromBuffer`'s return type is not `GaussianCloud`, keep the worker's existing type and cast in one place inside `gaussianCloudDecode.ts`, mirroring how the worker used it.

- [ ] **Step 6: Run the tests to verify they pass**

Run: the Step 3 command, then `npx tsc -b`.

Expected: all PASS, and no type errors.

- [ ] **Step 7: Commit** (only if commits are authorized)

```bash
git add src/utils/splatFilePolicy.ts src/utils/splatFilePolicy.test.ts src/components/viewer3d/WebGpuSplatCanvasLayerPolicy.ts src/components/viewer3d/WebGpuSplatCanvasLayer.test.tsx src/store/reconstructionStore.ts src/store/reconstructionStore.test.ts src/components/modals/splatPickerViewModel.ts src/components/modals/splatPickerViewModel.test.ts src/splat/gaussianCloudDecode.ts src/splat/gaussianCloudDecode.test.ts src/splat/gaussianCloudLoader.worker.ts
git commit -m "splats: gate WebGPU-only paths on decodable formats"
```

---

### Task 2: File-aware backend resolution, preload gates and notices

**Files:**
- Modify: `src/utils/splatBackendPolicy.ts`
- Modify: `src/store/stores/splatBackendStore.ts`
- Modify: `src/store/reconstructionStore.ts` (subscription after the store is created)
- Modify: `src/components/viewer3d/splatBackendNoticePolicy.ts`
- Modify: `src/hooks/fileDropzoneWorkflow.ts:57,269,328`
- Modify: `src/hooks/useFileDropzone.ts:73-76`
- Test: `src/utils/splatBackendPolicy.test.ts`, `src/store/stores/splatBackendStore.test.ts`, `src/store/reconstructionStore.test.ts`, `src/components/viewer3d/splatBackendNoticePolicy.test.ts`, `src/hooks/fileDropzoneWorkflow.test.ts`

**Interfaces:**
- Consumes: `SplatRendererRequirement`, `getSplatRendererRequirement` (Task 1).
- Produces:
  - `SplatBackendAvailability.activeSplatRenderer?: SplatRendererRequirement`
  - Exported reason constants `SPARK_ONLY_FORMAT_REASON`, `SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON`, `PREPARING_SPARK_FOR_FORMAT_REASON`, `SPARK_ONLY_FORMAT_UNAVAILABLE_REASON`, `SPARK_ONLY_FORMAT_METRIC_REASON`
  - Store action `setActiveSplatRenderer(requirement: SplatRendererRequirement): void`
  - `ShouldPreloadSplatRuntime = (splatFile: File) => boolean`

- [ ] **Step 1: Write the failing policy tests** (append to `src/utils/splatBackendPolicy.test.ts`; import the new constants, `resolveSplatMetricCapability` and `type SplatBackendAvailability`)

```ts
describe('spark-only active splats (SOG)', () => {
  const sparkOnly = (overrides: Partial<SplatBackendAvailability> = {}): SplatBackendAvailability => ({
    webGpu: 'ready', webGpuFailureReason: null, spark: false, sparkPreloadFailed: false,
    activeSplatRenderer: 'spark-only', ...overrides,
  });

  it.each(['auto', 'webgpu', 'spark'] as const)('waits for Spark, not WebGPU, when %s is requested', (requested) => {
    expect(resolveSplatBackend(requested, sparkOnly())).toMatchObject({
      status: 'unavailable', backend: null, reason: PREPARING_SPARK_FOR_FORMAT_REASON,
    });
  });

  it('renders with Spark once it loads, explaining a forced WebGPU request', () => {
    expect(resolveSplatBackend('auto', sparkOnly({ spark: true }))).toMatchObject({
      status: 'resolved', backend: 'spark', gpuPsnr: false, reason: SPARK_ONLY_FORMAT_REASON,
    });
    expect(resolveSplatBackend('webgpu', sparkOnly({ spark: true }))).toMatchObject({
      status: 'resolved', backend: 'spark', reason: SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON,
    });
  });

  it('reports a failed Spark download as the reason SOG cannot display', () => {
    expect(resolveSplatBackend('auto', sparkOnly({ sparkPreloadFailed: true }))).toMatchObject({
      status: 'unavailable', reason: SPARK_ONLY_FORMAT_UNAVAILABLE_REASON,
    });
  });

  it.each(['unsupported', 'unavailable', 'ready', 'failed'] as const)(
    'needs, starts and awaits the Spark download whatever the WebGPU state (%s)', (webGpu) => {
      expect(shouldPreloadSparkSplatRuntime('auto', sparkOnly({ webGpu }))).toBe(true);
      expect(shouldStartSparkSplatRuntimePreload('auto', sparkOnly({ webGpu }))).toBe(true);
      expect(isSparkSplatRuntimePreloadPending('auto', sparkOnly({ webGpu }))).toBe(true);
      expect(shouldStartSparkSplatRuntimePreload('auto', sparkOnly({ webGpu, sparkPreloadFailed: true }))).toBe(false);
    });

  it('leaves PLY/SPZ routing unchanged', () => {
    expect(resolveSplatBackend('auto', sparkOnly({ activeSplatRenderer: 'any' }))).toMatchObject({ backend: 'webgpu' });
    expect(shouldPreloadSparkSplatRuntime('auto', { webGpu: 'unavailable', activeSplatRenderer: 'any' })).toBe(false);
  });

  it('explains that PSNR/SSIM is unavailable for SOG', () => {
    const resolution = resolveSplatBackend('auto', sparkOnly({ spark: true }));
    expect(resolveSplatMetricCapability({ webGpu: 'ready', webGpuFailureReason: null }, resolution))
      .toMatchObject({ gpuPsnr: false, reason: SPARK_ONLY_FORMAT_METRIC_REASON });
  });
});
```

- [ ] **Step 2: Write the failing store, subscription, notice and dropzone tests**

Append to `src/store/stores/splatBackendStore.test.ts` (import `PREPARING_SPARK_FOR_FORMAT_REASON`):

```ts
  it('resolves an active SOG with Spark while WebGPU stays ready, and returns to WebGPU for PLY', () => {
    useSplatBackendStore.setState({
      requestedBackend: 'auto',
      availability: { webGpu: 'ready', webGpuFailureReason: null, spark: false },
    });
    useSplatBackendStore.getState().setActiveSplatRenderer('spark-only');
    expect(useSplatBackendStore.getState().resolution).toMatchObject({ status: 'unavailable', reason: PREPARING_SPARK_FOR_FORMAT_REASON });

    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    expect(useSplatBackendStore.getState().resolution).toMatchObject({ status: 'resolved', backend: 'spark' });
    expect(useSplatBackendStore.getState().availability.webGpu).toBe('ready');

    useSplatBackendStore.getState().setActiveSplatRenderer('any');
    expect(useSplatBackendStore.getState().resolution).toMatchObject({ status: 'resolved', backend: 'webgpu' });
  });
```

Append to `src/store/reconstructionStore.test.ts`, as a new top-level `describe`:

```ts
describe('reconstruction store splat renderer sync', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
  });

  it('tells the splat backend when the active splat can only be drawn by Spark', () => {
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({ splatFile: new File(['x'], 'scene.sog') }));
    expect(useSplatBackendStore.getState().availability.activeSplatRenderer).toBe('spark-only');

    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({ splatFile: new File(['x'], 'scene.ply') }));
    expect(useSplatBackendStore.getState().availability.activeSplatRenderer).toBe('any');

    useReconstructionStore.getState().clear();
    expect(useSplatBackendStore.getState().availability.activeSplatRenderer).toBe('any');
  });
});
```

Append to `src/components/viewer3d/splatBackendNoticePolicy.test.ts` (import the four constants and `getWebGpuSplatBackendNotice`):

```ts
describe('spark-only (SOG) notices', () => {
  const notice = (
    requestedBackend: 'auto' | 'webgpu' | 'spark',
    resolution: SplatBackendResolution,
    sparkPreloadPending = false
  ) => getWebGpuSplatBackendNotice({
    requestedBackend, splatFile: { name: 'scene.sog' }, splatBackendResolution: resolution,
    webGpuSplatCanvasMounted: false, sparkPreloadPending,
  });
  const resolved = (requested: 'auto' | 'webgpu' | 'spark', reason: string): SplatBackendResolution =>
    ({ status: 'resolved', requested, backend: 'spark', gpuPsnr: false, reason });
  const unavailable = (requested: 'auto' | 'webgpu' | 'spark', reason: string): SplatBackendResolution =>
    ({ status: 'unavailable', requested, backend: null, gpuPsnr: false, reason });

  it('stays silent while Spark prepares or renders a SOG', () => {
    expect(notice('auto', unavailable('auto', PREPARING_SPARK_FOR_FORMAT_REASON), true)).toBeNull();
    expect(notice('webgpu', unavailable('webgpu', PREPARING_SPARK_FOR_FORMAT_REASON), true)).toBeNull();
    expect(notice('auto', resolved('auto', SPARK_ONLY_FORMAT_REASON))).toBeNull();
  });

  it('explains a forced WebGPU request that renders a SOG with Spark', () => {
    expect(notice('webgpu', resolved('webgpu', SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON)))
      .toMatchObject({ severity: 'info', message: expect.stringContaining('cannot read SOG') });
  });

  it('warns when Spark cannot load for a SOG, without WebGPU advice', () => {
    const result = notice('auto', unavailable('auto', SPARK_ONLY_FORMAT_UNAVAILABLE_REASON));
    expect(result).toMatchObject({ severity: 'warning' });
    expect(result?.message).not.toContain('WebGPU splat renderer unavailable');
  });
});
```

In `src/hooks/fileDropzoneWorkflow.test.ts`, change the existing test `'skips the spark runtime preload when the caller says the backend will not use it'`:
- Rename it to `'asks the preload gate about the incoming splat and skips the download when it says no'`.
- Replace `expect(deps.shouldPreloadSplatRuntime).toHaveBeenCalledTimes(1);` with `expect(deps.shouldPreloadSplatRuntime).toHaveBeenCalledExactlyOnceWith(spz);`.

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/utils/splatBackendPolicy.test.ts src/store/stores/splatBackendStore.test.ts src/store/reconstructionStore.test.ts src/components/viewer3d/splatBackendNoticePolicy.test.ts src/hooks/fileDropzoneWorkflow.test.ts`

Expected: FAIL. The constants, the `setActiveSplatRenderer` action and the subscription are missing, and the gate is called without arguments.

- [ ] **Step 4: Implement the policy** (`src/utils/splatBackendPolicy.ts`)

Add the import `import type { SplatRendererRequirement } from './splatFilePolicy';` and extend the interface and defaults:

```ts
export interface SplatBackendAvailability {
  // ...existing fields...
  /**
   * What the ACTIVE splat can be drawn with. 'spark-only' formats (SOG) resolve to
   * Spark and need its download whatever the WebGPU state; absent means 'any'.
   */
  activeSplatRenderer?: SplatRendererRequirement;
}
```

In `DEFAULT_SPLAT_BACKEND_AVAILABILITY` add `activeSplatRenderer: 'any',`.

Add constants next to `PREPARING_WEBGPU_SPLAT_RENDERER_REASON`:

```ts
// Shared with the notice policy, which keys off these exact strings.
export const SPARK_ONLY_FORMAT_REASON = 'SOG renders with Spark';
export const SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON = 'The WebGPU renderer cannot read SOG; using Spark';
export const PREPARING_SPARK_FOR_FORMAT_REASON = 'Preparing Spark renderer for SOG';
export const SPARK_ONLY_FORMAT_UNAVAILABLE_REASON = 'Spark renderer unavailable; SOG cannot be displayed';
export const SPARK_ONLY_FORMAT_METRIC_REASON = 'PSNR/SSIM needs the WebGPU renderer, which cannot read SOG';

function resolveSparkOnlySplatBackend(
  requested: SplatBackendPreference,
  availability: SplatBackendAvailability
): SplatBackendResolution {
  if (availability.spark) {
    return {
      status: 'resolved', requested, backend: 'spark', gpuPsnr: false,
      reason: requested === 'webgpu' ? SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON : SPARK_ONLY_FORMAT_REASON,
    };
  }
  return {
    status: 'unavailable', requested, backend: null, gpuPsnr: false,
    reason: availability.sparkPreloadFailed ? SPARK_ONLY_FORMAT_UNAVAILABLE_REASON : PREPARING_SPARK_FOR_FORMAT_REASON,
  };
}
```

At the top of `resolveSplatBackend`:

```ts
  // A format only Spark decodes never waits on, or touches, WebGPU state.
  if (availability.activeSplatRenderer === 'spark-only') {
    return resolveSparkOnlySplatBackend(requested, availability);
  }
```

In `shouldPreloadSparkSplatRuntime`:
- Widen the parameter to `availability: Pick<SplatBackendAvailability, 'webGpu' | 'activeSplatRenderer'>`.
- Prefix the return: `return availability.activeSplatRenderer === 'spark-only' || requested === 'spark' || (…existing…)`.
- Add a line to its doc comment: "A spark-only active splat (SOG) needs Spark regardless of WebGPU; resolveSplatBackend resolves it to Spark to match."

Widen the `Pick` types of `shouldStartSparkSplatRuntimePreload` and `isSparkSplatRuntimePreloadPending` to include `'activeSplatRenderer'`.

In `resolveSplatMetricCapability`, the Spark branch explains why SOG has no metrics. `useViewerControlsStoreFacade` shows this reason on the disabled PSNR/SSIM modes. The PSNR evaluator already runs only when the visible backend is WebGPU (`SplatPsnrEvaluator.tsx:237-239`), so it never decodes a SOG.

```ts
  if (resolution?.status === 'resolved' && resolution.backend === 'spark') {
    return {
      status: 'available',
      backend: 'spark',
      gpuPsnr: false,
      reason: resolution.reason === SPARK_ONLY_FORMAT_REASON || resolution.reason === SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON
        ? SPARK_ONLY_FORMAT_METRIC_REASON
        : 'Spark PSNR/SSIM metric capability is ready',
    };
  }
```

- [ ] **Step 5: Implement the store action and the sync**

In `src/store/stores/splatBackendStore.ts`:
- Add to `SplatBackendState`: `setActiveSplatRenderer: (activeSplatRenderer: SplatRendererRequirement) => void;` (import the type from `../../utils/splatFilePolicy`).
- Add to the store:

```ts
  setActiveSplatRenderer: (activeSplatRenderer) => set((state) =>
    (state.availability.activeSplatRenderer ?? 'any') === activeSplatRenderer
      ? state
      : resolveNextState(
        state.requestedBackend,
        { ...state.availability, activeSplatRenderer },
        state.metricAvailability
      )
  ),
```

In `src/store/reconstructionStore.ts`, directly after `export const useReconstructionStore = create<…>(…);`:

```ts
// Backend resolution is per active splat: a format only Spark decodes (SOG) must
// resolve to Spark the moment it becomes active, without waiting on React effects.
useReconstructionStore.subscribe((state, previous) => {
  const splatFile = state.loadedFiles?.splatFile;
  if (splatFile === previous.loadedFiles?.splatFile) return;
  useSplatBackendStore.getState().setActiveSplatRenderer(getSplatRendererRequirement(splatFile?.name));
});
```

Import `getSplatRendererRequirement` from `../utils/splatFilePolicy`.

- [ ] **Step 6: Implement the notices** (`src/components/viewer3d/splatBackendNoticePolicy.ts`)

Import the four constants. Add:

```ts
const SPARK_ONLY_REASONS = new Set([
  SPARK_ONLY_FORMAT_REASON,
  SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON,
  PREPARING_SPARK_FOR_FORMAT_REASON,
  SPARK_ONLY_FORMAT_UNAVAILABLE_REASON,
]);

/** SOG renders with Spark whatever was requested; the WebGPU chains below must never describe it. */
function getSparkOnlyFormatNotice({
  splatFile,
  splatBackendResolution,
  sparkPreloadPending,
}: SplatBackendNoticeOptions): SplatBackendNotice | null {
  const { reason } = splatBackendResolution;
  if (!splatFile || reason === SPARK_ONLY_FORMAT_REASON || reason === PREPARING_SPARK_FOR_FORMAT_REASON) {
    return null;
  }
  if (reason === SPARK_ONLY_FORMAT_FORCED_WEBGPU_REASON) {
    return { key: `${splatFile.name}:${reason}`, message: `${reason}.`, severity: 'info' };
  }
  // SPARK_ONLY_FORMAT_UNAVAILABLE_REASON: an outcome only once no download is in flight.
  return sparkPreloadPending
    ? null
    : { key: `${splatFile.name}:${reason}`, message: `${reason}. Reload to try again.`, severity: 'warning' };
}
```

In `getWebGpuSplatBackendNotice`, before the existing chain:

```ts
  if (SPARK_ONLY_REASONS.has(options.splatBackendResolution.reason)) {
    return getSparkOnlyFormatNotice(options);
  }
```

- [ ] **Step 7: Make the drop-time preload file-aware**

In `src/hooks/fileDropzoneWorkflow.ts`:
- Change `type ShouldPreloadSplatRuntime = () => boolean;` to `type ShouldPreloadSplatRuntime = (splatFile: File) => boolean;`.
- Change the default to `deps.shouldPreloadSplatRuntime ?? (() => true)` (unchanged shape; the parameter is ignored).
- Change the call to `if (splatFile && shouldPreloadSplatRuntime(splatFile)) {`.

In `src/hooks/useFileDropzone.ts`, replace the gate:

```ts
      shouldPreloadSplatRuntime: (splatFile) => {
        const { requestedBackend, availability } = useSplatBackendStore.getState();
        // The incoming file is not active yet, so state its renderer requirement explicitly.
        return shouldStartSparkSplatRuntimePreload(requestedBackend, {
          ...availability,
          activeSplatRenderer: getSplatRendererRequirement(splatFile.name),
        });
      },
```

Import `getSplatRendererRequirement` from `../utils/splatFilePolicy`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: the Step 3 command, then `npx vitest run src/utils/sparkImportBoundary.test.ts src/components/viewer3d src/hooks`, then `npx tsc -b`.

Expected: all PASS, and no type errors.

- [ ] **Step 9: Commit** (only if commits are authorized)

```bash
git add src/utils/splatBackendPolicy.ts src/utils/splatBackendPolicy.test.ts src/store/stores/splatBackendStore.ts src/store/stores/splatBackendStore.test.ts src/store/reconstructionStore.ts src/store/reconstructionStore.test.ts src/components/viewer3d/splatBackendNoticePolicy.ts src/components/viewer3d/splatBackendNoticePolicy.test.ts src/hooks/fileDropzoneWorkflow.ts src/hooks/fileDropzoneWorkflow.test.ts src/hooks/useFileDropzone.ts
git commit -m "splats: resolve the renderer per active file; SOG routes to Spark"
```

---

### Task 3: SOG bundle validator

**Files:**
- Move: `src/features/datasetPublishing/imageDimensions.ts` → `src/utils/imageDimensions.ts`, and its test to `src/utils/imageDimensions.test.ts`. Update the imports in `src/features/datasetPublishing/publicationPreview.ts` and in the moved test.
- Create: `src/splat/sogBundle.ts`
- Test: `src/splat/sogBundle.test.ts`

**Interfaces:**
- Consumes: `readImageDimensions(blob: Blob): Promise<{ width: number; height: number } | null>` from `src/utils/imageDimensions.ts`; `webpHeader` from `src/test/imageHeaders.ts` (tests).
- Produces:
  - `class SogBundleError extends Error`
  - `interface SogBundleInfo { version: 1 | 2; count: number; shBands: number }`
  - `validateSogBundle(file: Blob, options?: { maxSplats?: number }): Promise<SogBundleInfo>`

- [ ] **Step 1: Move the dimension reader**

```bash
git mv src/features/datasetPublishing/imageDimensions.ts src/utils/imageDimensions.ts
git mv src/features/datasetPublishing/imageDimensions.test.ts src/utils/imageDimensions.test.ts
```

If the files are untracked, use plain `mv`.

Then update the imports:
- `publicationPreview.ts`: `import { readImageDimensions } from '../../utils/imageDimensions';`
- The moved test: `'../test/imageHeaders'` and `'./imageDimensions'`.

Run `npx vitest run src/utils/imageDimensions.test.ts src/features/datasetPublishing/publicationPreview.test.ts`. Expected: PASS.

- [ ] **Step 2: Write the failing validator tests** (`src/splat/sogBundle.test.ts`)

```ts
import { Blob as NodeBlob } from 'node:buffer';
import { zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import { webpHeader } from '../test/imageHeaders';
import { SogBundleError, validateSogBundle } from './sogBundle';

const TEXTURES = ['means_l.webp', 'means_u.webp', 'scales.webp', 'quats.webp', 'sh0.webp'];
const codebook = (start: number, step: number) => Array.from({ length: 256 }, (_, index) => start + index * step);
const V2_META = {
  version: 2, count: 100,
  means: { mins: [-1.1, -0.5, -1.1], maxs: [1.1, 0.4, 1.1], files: ['means_l.webp', 'means_u.webp'] },
  scales: { codebook: codebook(-8, 0.02), files: ['scales.webp'] },
  quats: { files: ['quats.webp'] },
  sh0: { codebook: codebook(-2, 0.016), files: ['sh0.webp'] },
};
const V1_META = {
  means: { shape: [100, 3], dtype: 'float32', mins: [-2, -1, -2], maxs: [2, 1, 2], files: ['means_l.webp', 'means_u.webp'] },
  scales: { shape: [100, 3], dtype: 'float32', mins: [-8, -8, -8], maxs: [-2, -2, -2], files: ['scales.webp'] },
  quats: { shape: [100, 4], dtype: 'uint8', encoding: 'quaternion_packed', files: ['quats.webp'] },
  sh0: { shape: [100, 1, 4], dtype: 'float32', mins: [-2, -2, -2, -4], maxs: [2, 2, 2, 4], files: ['sh0.webp'] },
};

interface SogBuildOptions {
  meta?: object | string;
  size?: [number, number];
  omit?: string[];
  deflate?: boolean;
}

function buildSog({ meta = V2_META, size = [10, 10], omit = [], deflate = false }: SogBuildOptions = {}): Blob {
  const level = deflate ? 6 : 0;
  const files: Zippable = {};
  for (const name of TEXTURES) {
    if (!omit.includes(name)) files[name] = [webpHeader('VP8L', size[0], size[1]), { level }];
  }
  if (!omit.includes('meta.json')) {
    const text = typeof meta === 'string' ? meta : JSON.stringify(meta);
    files['meta.json'] = [new TextEncoder().encode(text), { level }];
  }
  return new NodeBlob([zipSync(files)]) as unknown as Blob;
}
const reason = (promise: Promise<unknown>) => promise.then(() => 'accepted', (error: unknown) =>
  error instanceof SogBundleError ? error.message : `unexpected ${String(error)}`);

describe('SOG bundle validation', () => {
  it('accepts a well-formed version 2 bundle and reports its count', async () => {
    await expect(validateSogBundle(buildSog())).resolves.toEqual({ version: 2, count: 100, shBands: 0 });
  });

  it('reads deflated entries (other producers compress) and version 1 metadata', async () => {
    await expect(validateSogBundle(buildSog({ deflate: true }))).resolves.toMatchObject({ count: 100 });
    expect(await reason(validateSogBundle(buildSog({ deflate: true, size: [5, 5] })))).toContain('holds 25 splats');
    await expect(validateSogBundle(buildSog({ meta: V1_META }))).resolves.toEqual({ version: 1, count: 100, shBands: 0 });
  });

  it.each([
    ['a file that is not a zip', () => new NodeBlob([new Uint8Array(200)]) as unknown as Blob, 'not a valid SOG bundle'],
    ['a missing meta.json', () => buildSog({ omit: ['meta.json'] }), 'meta.json is missing'],
    ['a missing texture', () => buildSog({ omit: ['quats.webp'] }), 'quats.webp is missing'],
    ['invalid JSON', () => buildSog({ meta: '{"version":2,' }), 'meta.json is not valid'],
    ['an unsupported version', () => buildSog({ meta: { ...V2_META, version: 3 } }), 'version 3'],
    ['a zero count', () => buildSog({ meta: { ...V2_META, count: 0 } }), 'splat count'],
    ['a non-finite position bound', () => buildSog({ meta: { ...V2_META, means: { ...V2_META.means, mins: [0, null, 0] } } }), 'position bounds'],
    ['garbage scales', () => buildSog({ meta: { ...V2_META, scales: { ...V2_META.scales, codebook: [...codebook(-8, 0.02).slice(1), 400] } } }), 'scale'],
    ['textures smaller than the count', () => buildSog({ size: [5, 5] }), 'holds 25 splats'],
  ])('rejects %s', async (_case, build, expected) => {
    expect(await reason(validateSogBundle(build()))).toContain(expected);
  });

  it('rejects an oversized meta.json without parsing it', async () => {
    const meta = { ...V2_META, padding: 'x'.repeat(1024 * 1024) };
    expect(await reason(validateSogBundle(buildSog({ meta })))).toContain('meta.json is too large');
  });

  it('stops a bundle with more splats than this device supports', async () => {
    expect(await reason(validateSogBundle(buildSog(), { maxSplats: 50 }))).toContain('100 splats');
    await expect(validateSogBundle(buildSog(), { maxSplats: 100 })).resolves.toMatchObject({ count: 100 });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/splat/sogBundle.test.ts`

Expected: FAIL, "Failed to resolve import ./sogBundle".

- [ ] **Step 4: Implement the validator** (`src/splat/sogBundle.ts`)

```ts
import { Inflate, inflateSync } from 'fflate';
import { readImageDimensions } from '../utils/imageDimensions';

/**
 * Checks a PlayCanvas SOG bundle before Spark decodes it. Reads only the zip's
 * directory, meta.json and the first bytes of each per-splat texture, so a
 * malformed or oversized bundle is refused without touching the GPU.
 */
export class SogBundleError extends Error {
  constructor(message: string) { super(message); this.name = 'SogBundleError'; }
}

export interface SogBundleInfo { version: 1 | 2; count: number; shBands: number }

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_SEARCH_BYTES = 65_535 + 22;
const MAX_ENTRIES = 64;
const MAX_META_BYTES = 1024 * 1024;
const MAX_SPLATS = 50_000_000;
const TEXTURE_PREFIX_BYTES = 64;

interface ZipEntry { name: string; method: number; compressedSize: number; size: number; localHeaderOffset: number }
interface ParsedMeta { version: 1 | 2; count: number; shBands: number; files: string[]; textures: string[] }

// A declaration (not a const arrow) so TypeScript's control flow treats calls as never returning.
function fail(message: string): never {
  throw new SogBundleError(message);
}
const read = async (file: Blob, start: number, end: number) => new Uint8Array(await file.slice(start, end).arrayBuffer());
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteArray = (value: unknown, length?: number): value is number[] =>
  Array.isArray(value) && value.length > 0 && (length === undefined || value.length === length)
  && value.every((item) => typeof item === 'number' && Number.isFinite(item));
const isFileList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.length > 0);
const inRange = (values: number[], min: number, max: number) => values.every((value) => value >= min && value <= max);

async function readDirectory(file: Blob): Promise<Map<string, ZipEntry>> {
  const tailStart = Math.max(0, file.size - EOCD_SEARCH_BYTES);
  const tail = await read(file, tailStart, file.size);
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let offset = tail.length - 22; offset >= 0; offset--) {
    if (tailView.getUint32(offset, true) === EOCD_SIGNATURE) { eocd = offset; break; }
  }
  if (eocd < 0) fail('it is not a valid SOG bundle (no zip directory).');
  if (eocd >= 20 && tailView.getUint32(eocd - 20, true) === ZIP64_LOCATOR_SIGNATURE) fail('ZIP64 bundles are not supported.');
  const count = tailView.getUint16(eocd + 10, true);
  const directorySize = tailView.getUint32(eocd + 12, true);
  const directoryOffset = tailView.getUint32(eocd + 16, true);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) fail('ZIP64 bundles are not supported.');
  if (count === 0 || count > MAX_ENTRIES) fail(`it lists ${count} files; a SOG bundle has at most ${MAX_ENTRIES}.`);
  if (directoryOffset + directorySize > tailStart + eocd) fail('its zip directory lies outside the file.');

  const directory = await read(file, directoryOffset, directoryOffset + directorySize);
  const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  const entries = new Map<string, ZipEntry>();
  let offset = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > directory.length || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) fail('its zip directory is damaged.');
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(directory.subarray(offset + 46, offset + 46 + nameLength));
    if (flags & 1) fail(`${name} is encrypted.`);
    if (method !== 0 && method !== 8) fail(`${name} uses an unsupported compression method.`);
    if (localHeaderOffset + 30 + compressedSize > directoryOffset) fail(`${name} lies outside the file.`);
    if (entries.has(name)) fail(`it contains ${name} twice.`);
    entries.set(name, { name, method, compressedSize, size, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function dataRange(file: Blob, entry: ZipEntry): Promise<[number, number]> {
  const header = await read(file, entry.localHeaderOffset, entry.localHeaderOffset + 30);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (header.length < 30 || view.getUint32(0, true) !== LOCAL_SIGNATURE) fail(`${entry.name} is damaged.`);
  const start = entry.localHeaderOffset + 30 + view.getUint16(26, true) + view.getUint16(28, true);
  const end = start + entry.compressedSize;
  if (end > file.size) fail(`${entry.name} lies outside the file.`);
  return [start, end];
}

async function readWholeEntry(file: Blob, entry: ZipEntry, limit: number): Promise<Uint8Array> {
  if (entry.size > limit) fail(`${entry.name} is too large (${entry.size} bytes).`);
  const [start, end] = await dataRange(file, entry);
  const data = await read(file, start, end);
  return entry.method === 0 ? data : inflateSync(data, { out: new Uint8Array(entry.size) });
}

async function readEntryPrefix(file: Blob, entry: ZipEntry, length: number): Promise<Uint8Array> {
  const [start, end] = await dataRange(file, entry);
  if (entry.method === 0) return read(file, start, Math.min(end, start + length));
  const chunks: Uint8Array[] = [];
  let received = 0;
  const inflater = new Inflate((chunk) => { chunks.push(chunk); received += chunk.length; });
  const compressed = await read(file, start, Math.min(end, start + 64 * 1024));
  inflater.push(compressed, start + compressed.length >= end);
  const joined = new Uint8Array(received);
  let at = 0;
  for (const chunk of chunks) { joined.set(chunk, at); at += chunk.length; }
  return joined.subarray(0, length);
}

function parseCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_SPLATS) {
    return fail(`its splat count (${String(value)}) is not between 1 and ${MAX_SPLATS.toLocaleString()}.`);
  }
  return value;
}

function section(meta: Record<string, unknown>, name: string): Record<string, unknown> {
  const value = meta[name];
  return isRecord(value) ? value : fail(`meta.json has no ${name} section.`);
}

function files(sectionValue: Record<string, unknown>, name: string): string[] {
  return isFileList(sectionValue.files) ? sectionValue.files : fail(`meta.json lists no ${name} textures.`);
}

function parseV2(meta: Record<string, unknown>): ParsedMeta {
  const count = parseCount(meta.count);
  const means = section(meta, 'means');
  const scales = section(meta, 'scales');
  const quats = section(meta, 'quats');
  const sh0 = section(meta, 'sh0');
  if (!isFiniteArray(means.mins, 3) || !isFiniteArray(means.maxs, 3)
    || !inRange(means.mins, -30, 30) || !inRange(means.maxs, -30, 30)) fail('its position bounds are invalid.');
  if (!isFiniteArray(scales.codebook) || !inRange(scales.codebook, -30, 20)) fail('its scale codebook holds invalid or extreme values.');
  if (!isFiniteArray(sh0.codebook)) fail('its colour codebook holds invalid values.');
  const textures = [...files(means, 'means'), ...files(scales, 'scales'), ...files(quats, 'quats'), ...files(sh0, 'sh0')];
  let shBands = 0;
  const shFiles: string[] = [];
  if (meta.shN !== undefined) {
    const shN = section(meta, 'shN');
    if (typeof shN.bands !== 'number' || !Number.isInteger(shN.bands) || shN.bands < 1 || shN.bands > 3) fail('its spherical-harmonic band count is invalid.');
    if (!isFiniteArray(shN.codebook)) fail('its spherical-harmonic codebook holds invalid values.');
    shBands = shN.bands as number;
    shFiles.push(...files(shN, 'shN'));
  }
  return { version: 2, count, shBands, textures, files: [...textures, ...shFiles] };
}

function parseV1(meta: Record<string, unknown>): ParsedMeta {
  const means = section(meta, 'means');
  const scales = section(meta, 'scales');
  const quats = section(meta, 'quats');
  const sh0 = section(meta, 'sh0');
  const count = parseCount(Array.isArray(means.shape) ? means.shape[0] : undefined);
  if (!isFiniteArray(means.mins, 3) || !isFiniteArray(means.maxs, 3)) fail('its position bounds are invalid.');
  if (!isFiniteArray(scales.mins) || !isFiniteArray(scales.maxs)
    || !inRange(scales.mins, -30, 20) || !inRange(scales.maxs, -30, 20)) fail('its scale range holds invalid or extreme values.');
  if (!isFiniteArray(sh0.mins) || !isFiniteArray(sh0.maxs)) fail('its colour range holds invalid values.');
  const textures = [...files(means, 'means'), ...files(scales, 'scales'), ...files(quats, 'quats'), ...files(sh0, 'sh0')];
  const shFiles = meta.shN === undefined ? [] : files(section(meta, 'shN'), 'shN');
  return { version: 1, count, shBands: 0, textures, files: [...textures, ...shFiles] };
}

export async function validateSogBundle(file: Blob, { maxSplats }: { maxSplats?: number } = {}): Promise<SogBundleInfo> {
  const entries = await readDirectory(file);
  const metaEntry = entries.get('meta.json') ?? fail('meta.json is missing.');
  if (metaEntry.size > MAX_META_BYTES) fail(`meta.json is too large (${metaEntry.size} bytes).`);
  let meta: unknown;
  try {
    meta = JSON.parse(new TextDecoder().decode(await readWholeEntry(file, metaEntry, MAX_META_BYTES)));
  } catch (error) {
    if (error instanceof SogBundleError) throw error;
    fail('meta.json is not valid JSON.');
  }
  if (!isRecord(meta)) return fail('meta.json is not a JSON object.');
  const parsed = meta.version === 2 ? parseV2(meta)
    : meta.version === undefined ? parseV1(meta)
    : fail(`SOG version ${String(meta.version)} is not supported.`);
  if (maxSplats !== undefined && parsed.count > maxSplats) {
    fail(`it has ${parsed.count.toLocaleString()} splats; this device supports up to ${maxSplats.toLocaleString()}. Open it on a desktop to view.`);
  }
  for (const name of parsed.files) if (!entries.has(name)) fail(`${name} is missing.`);
  for (const name of new Set(parsed.textures)) {
    const prefix = await readEntryPrefix(file, entries.get(name)!, TEXTURE_PREFIX_BYTES);
    const size = await readImageDimensions(new Blob([prefix]));
    if (!size) fail(`${name} is not a readable WebP image.`);
    else if (size.width * size.height < parsed.count) {
      fail(`${name} holds ${size.width * size.height} splats but the bundle declares ${parsed.count}.`);
    }
  }
  return { version: parsed.version, count: parsed.count, shBands: parsed.shBands };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/splat/sogBundle.test.ts src/utils/imageDimensions.test.ts src/features/datasetPublishing`, then `npx tsc -b`.

Expected: all PASS. If `new Blob([prefix])` in the validator produces a jsdom Blob without `arrayBuffer`, add `vi.stubGlobal('Blob', NodeBlob)` in the test's `beforeEach` (with `vi.unstubAllGlobals()` in `afterEach`); the browser path is unaffected.

- [ ] **Step 6: Commit** (only if commits are authorized)

```bash
git add src/splat/sogBundle.ts src/splat/sogBundle.test.ts src/utils/imageDimensions.ts src/utils/imageDimensions.test.ts src/features/datasetPublishing/publicationPreview.ts
git commit -m "splats: validate SOG bundles before rendering"
```

---

### Task 4: Validate every SOG before Spark decodes it

**Files:**
- Modify: `src/components/viewer3d/PointCloud/SplatLayer.tsx:315-323` (`failSplatLoading`), `:446-500` (`loadSplat` and its catch)
- Test: `src/components/viewer3d/PointCloud/SplatLayer.test.tsx`

**Interfaces:**
- Consumes: `validateSogBundle`, `SogBundleError` (Task 3); `isSogSplatPath` (Task 1); `TOUCH_SPLAT_DISABLE_MIN_SPLATS` from `src/hooks/urlLoaderPolicy.ts`; `detectTouchDevice` from `src/hooks/useIsTouchDevice.ts`.
- Produces: `failSplatLoading(file: File, message?: string)`.

- [ ] **Step 1: Write the failing tests** (`SplatLayer.test.tsx`)

Add to the hoisted mocks:

```ts
    validateSogBundleMock: vi.fn(),
```

(and destructure it). Add the mock:

```ts
vi.mock('../../../splat/sogBundle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../splat/sogBundle')>()),
  validateSogBundle: validateSogBundleMock,
}));
```

Add the import `import { SogBundleError } from '../../../splat/sogBundle';`. Then add the tests:

```ts
  it('refuses a damaged SOG with its reason and never creates a Spark mesh', async () => {
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) { this.dispose = vi.fn(); });
    const { SplatMesh } = createSplatMeshConstructor(Promise.resolve());
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    validateSogBundleMock.mockRejectedValue(new SogBundleError('meta.json is missing.'));
    const facade = createFacade({ splatFile: new File(['sog'], 'scene.sog') });
    useSplatLayerStoreFacadeMock.mockReturnValue(facade);

    render(<SplatLayer />);

    await waitFor(() => {
      expect(facade.actions.addNotification).toHaveBeenCalledWith('warning', "This SOG file can't be opened: meta.json is missing.");
    });
    expect(SplatMesh).not.toHaveBeenCalled();
  });

  it('hands a validated SOG to Spark and never validates PLY files', async () => {
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) { this.dispose = vi.fn(); });
    const { SplatMesh } = createSplatMeshConstructor(Promise.resolve());
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    validateSogBundleMock.mockResolvedValue({ version: 2, count: 100, shBands: 0 });
    useSplatLayerStoreFacadeMock.mockReturnValue(createFacade({ splatFile: new File(['sog'], 'scene.sog') }));
    const { unmount } = render(<SplatLayer />);
    await waitFor(() => expect(SplatMesh).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'scene.sog' })));
    expect(validateSogBundleMock).toHaveBeenCalledTimes(1);
    unmount();

    validateSogBundleMock.mockClear();
    useSplatLayerStoreFacadeMock.mockReturnValue(createFacade());
    render(<SplatLayer />);
    await waitFor(() => expect(SplatMesh).toHaveBeenCalledTimes(2));
    expect(validateSogBundleMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/viewer3d/PointCloud/SplatLayer.test.tsx`

Expected: FAIL. The notification is the generic `Failed to load splat: …` or absent, `SplatMesh` is constructed, and the validator is never called.

- [ ] **Step 3: Implement**

In `SplatLayer.tsx`:
- Extend the failure helper:

```ts
  const failSplatLoading = useCallback((file: File, message?: string) => {
    if (!ownsSparkSplatLoading(file)) {
      return;
    }

    clearSplatLoadingNotification(file);
    setUrlLoading(false);
    addNotification('warning', message ?? `Failed to load splat: ${file.name}`);
  }, [addNotification, clearSplatLoadingNotification, ownsSparkSplatLoading, setUrlLoading]);
```

- At the start of `loadSplat()` (before `getSplatMeshSourceOptions`):

```ts
      if (isSogSplatPath(sourceFile.name)) {
        // A malformed or oversized SOG must be refused before Spark decodes it onto the GPU.
        await validateSogBundle(sourceFile, {
          maxSplats: detectTouchDevice() ? TOUCH_SPLAT_DISABLE_MIN_SPLATS : undefined,
        });
        if (cancelled) {
          return;
        }
      }
```

- In `loadSplat().catch`, replace `failSplatLoading(sourceFile);` with:

```ts
        failSplatLoading(
          sourceFile,
          error instanceof SogBundleError ? `This SOG file can't be opened: ${error.message}` : undefined
        );
```

- Add the imports: `isSogSplatPath` from `../../../utils/splatFilePolicy`; `SogBundleError`, `validateSogBundle` from `../../../splat/sogBundle`; `detectTouchDevice` from `../../../hooks/useIsTouchDevice`; `TOUCH_SPLAT_DISABLE_MIN_SPLATS` from `../../../hooks/urlLoaderPolicy`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/viewer3d/PointCloud src/components/componentStoreBoundary.test.ts src/utils/sparkImportBoundary.test.ts`, then `npx tsc -b`.

Expected: all PASS.

- [ ] **Step 5: Commit** (only if commits are authorized)

```bash
git add src/components/viewer3d/PointCloud/SplatLayer.tsx src/components/viewer3d/PointCloud/SplatLayer.test.tsx
git commit -m "splats: refuse invalid or oversized SOG before Spark decodes it"
```

---

### Task 5: Enable `.sog` everywhere splats load

**Files:**
- Modify: `src/utils/splatFilePolicy.ts:1-8` (list and priority)
- Modify: `src/hooks/urlLoaderPolicy.ts:499-527` (auto-load decision and estimate)
- Modify: `src/hooks/urlLoaderManifestFetch.ts:173` (stale comment)
- Modify: `src/components/modals/splatPickerViewModel.ts` (size ordering)
- Modify: `src/components/dropzone/dropZoneHoverCardViewModel.ts:22`, `src/components/dropzone/dropZonePanelViewModel.ts:38`
- Test: `src/utils/splatFilePolicy.test.ts`, `src/hooks/urlLoaderPolicy.test.ts`, `src/components/modals/splatPickerViewModel.test.ts`, `src/utils/zipLoaderPolicy.test.ts`, `src/utils/fileClassification.test.ts`, `src/components/dropzone/dropZoneHoverCardViewModel.test.ts`, `src/components/dropzone/dropZonePanelViewModel.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: `SplatFileExtension` now includes `'.sog'`.

- [ ] **Step 1: Write the failing tests**

`src/utils/splatFilePolicy.test.ts`:

```ts
  it('accepts SOG but never prefers it over PLY or SPZ', () => {
    expect(getSplatFileExtension('bicycle/splat_30000.SOG')).toBe('.sog');
    expect(isSplatFilePath('scene.sog')).toBe(true);
    const tinyPly = { path: 'scene.ply', size: 10 };
    const hugeSog = { path: 'scene.sog', size: 1_000 };
    expect(compareSplatCandidates(tinyPly, hugeSog)).toBeGreaterThan(0);
    expect([hugeSog, { path: 'other.sog', size: 5 }].reduce(getPreferredSplatCandidate)).toBe(hugeSog);
  });
```

`src/hooks/urlLoaderPolicy.test.ts` (import `getSplatAutoLoadDecision`, `getEstimatedSplatCount` if not already imported):

```ts
describe('SOG budgets', () => {
  it('estimates SOG splat counts at 10 bytes per splat', () => {
    expect(getEstimatedSplatCount({ path: 'scene.sog', size: 25_000_000 })).toBe(2_500_000);
  });

  it('auto-loads a lone SOG on touch only when its estimated count fits the device', () => {
    const decide = (size: number, isTouchDevice: boolean) =>
      getSplatAutoLoadDecision([{ path: 'scene.sog', size, splatCount: null }], { isTouchDevice }).autoLoad;
    expect(decide(25_000_000, true)).toBe(true);   // ~2.5M splats
    expect(decide(40_000_000, true)).toBe(false);  // ~4M splats: over the 3M touch ceiling despite fitting 50 MB
    expect(decide(100_000_000, false)).toBe(true); // desktop keeps the 150 MB byte budget
  });

  it('keeps PLY auto-load decisions unchanged on touch', () => {
    expect(getSplatAutoLoadDecision([{ path: 'scene.ply', size: 40_000_000, splatCount: null }], { isTouchDevice: true }).autoLoad).toBe(true);
  });

  it('lists SOG files found in a Hugging Face tree', () => {
    expect(getHuggingFaceSplatPaths([
      { type: 'file', path: 'ds/scene.sog', size: 10 },
      { type: 'file', path: 'ds/readme.md', size: 1 },
    ] as never, 'ds').map((candidate) => candidate.path)).toEqual(['scene.sog']);
  });
});
```

(`getHuggingFaceSplatPaths` is exported from `src/hooks/urlLoaderPolicy.ts:434`; add it to the test's imports.)

`src/components/modals/splatPickerViewModel.test.ts`:

```ts
  it('lists splats by size, smallest first, so the user chooses between formats', () => {
    const items = getSplatPickerItems([
      { id: 'big.ply', path: 'big.ply', size: 300 },
      { id: 'small.sog', path: 'small.sog', size: 20 },
      { id: 'mid.spz', path: 'mid.spz', size: 90 },
      { id: 'unknown.ply', path: 'unknown.ply' },
    ], { isTouchDevice: false });
    expect(items.map((item) => item.id)).toEqual(['small.sog', 'mid.spz', 'big.ply', 'unknown.ply']);
  });
```

`src/utils/zipLoaderPolicy.test.ts`:

```ts
  it('extracts a SOG inside a dataset archive as a splat', () => {
    expect(isArchiveSplatPath('scene/splats/scene.sog')).toBe(true);
  });
```

`src/utils/fileClassification.test.ts` (uses the file's existing `buildFile(name, content)` and `fileMap` helpers):

```ts
  it('lists a SOG beside a PLY but keeps the PLY as the automatic choice, even when the SOG is larger', () => {
    const ply = buildFile('scene.ply', 'x');
    const sog = buildFile('scene.sog', 'xxxxxxxx');
    const files = fileMap([
      ['splats/scene.sog', sog],
      ['splats/scene.ply', ply],
    ]);

    expect(findPreferredSplatFile(files)).toBe(ply);
    expect(findSplatFiles(files)).toEqual([ply, sog]);
  });
```

`src/components/modals/splatPickerViewModel.test.ts`: the existing expectations assume input order and must change to size order.
- In `'uses the file basename and a formatted size'`, the expected array lists `inside.ply` (46 MB) first, then the 943 MB file.
- In `'maps sources to ok/hint/disabled tiers on touch hardware'`, the rows come back as `small.spz`, `mid.spz`, `huge.ply`. Assert by id rather than by index:

```ts
  it('maps sources to ok/hint/disabled tiers on touch hardware', () => {
    const items = getSplatPickerItems(sources, { isTouchDevice: true });
    const byId = new Map(items.map((item) => [item.id, item]));
    expect(items.map((i) => i.id)).toEqual(['c', 'b', 'a']);
    expect(byId.get('a')?.tier).toBe('disabled');
    expect(byId.get('a')?.disabledReason).toBe('Too large for this device (1.0 GB) - open on a desktop to view');
    expect(byId.get('b')?.warning).toBe("may exceed this device's memory");
    expect(byId.get('c')?.warning).toBeNull();
  });
```

Dropzone copy tests: update the expected strings to `(optional .spz/.ply/.sog)` and `splats (.spz, .ply, .sog)`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/utils/splatFilePolicy.test.ts src/hooks/urlLoaderPolicy.test.ts src/components/modals/splatPickerViewModel.test.ts src/utils/zipLoaderPolicy.test.ts src/utils/fileClassification.test.ts src/components/dropzone`

Expected: FAIL, because `.sog` is not a splat extension, the picker keeps insertion order, and the copy is unchanged.

- [ ] **Step 3: Implement**

`src/utils/splatFilePolicy.ts`:

```ts
export const SPLAT_FILE_EXTENSIONS = ['.spz', '.ply', '.sog'] as const;

const SPLAT_EXTENSION_PRIORITY: Record<SplatFileExtension, number> = {
  '.spz': 2,
  '.ply': 1,
  // Spark-only and without GPU PSNR: never the automatic choice when PLY/SPZ exist.
  '.sog': 0,
};
```

`src/hooks/urlLoaderPolicy.ts`:
- Add to `SPLAT_BYTES_PER_SPLAT_ESTIMATE`:

```ts
  // Measured colour-only SOG (the densest case): 14.42 / 12.39 / 11.60 B per splat at
  // 10k / 100k / 500k splats; rounded down with margin because real captures compress better.
  '.sog': 10,
```

- In `getSplatAutoLoadDecision`, after the size check and before `return { autoLoad: true, … }`:

```ts
  // SOG is 5-20x smaller per splat than PLY, so the byte budget alone would admit
  // scenes a phone cannot hold; on touch also require the estimated count to fit.
  if (isTouchDevice && isSogSplatPath(candidate.path)) {
    const estimated = getEstimatedSplatCount(candidate);
    if (estimated !== null && estimated > TOUCH_SPLAT_DISABLE_MIN_SPLATS) {
      return { autoLoad: false, budgetBytes, oversizedCandidate: candidate };
    }
  }
```

(import `isSogSplatPath`).

`src/hooks/urlLoaderManifestFetch.ts:173`: replace the stale comment `// Non-PLY splat formats (.spz / .splat) are always splats.` with `// Only .ply is ambiguous (splat vs point cloud); .spz and .sog are always splats.`

`src/components/modals/splatPickerViewModel.ts`, `getSplatPickerItems`: sort before mapping:

```ts
  const bySize = [...sources].sort((a, b) =>
    (a.size ?? Number.POSITIVE_INFINITY) - (b.size ?? Number.POSITIVE_INFINITY) || a.path.localeCompare(b.path));
  return bySize.map((source) => {
```

Dropzone copy: `(optional .spz/.ply/.sog)` and `splats (.spz, .ply, .sog)`.

- [ ] **Step 4: Run the tests to verify they pass, then the whole unit suite**

Run: the Step 2 command, then `npx vitest run` and `npx tsc -b --force`.

Expected: all PASS. The two `Record<SplatFileExtension, …>` maps now type-check with `.sog`. Any other failure from the broader suite is a real regression and must be fixed before continuing.

- [ ] **Step 5: Commit** (only if commits are authorized)

```bash
git add src/utils/splatFilePolicy.ts src/utils/splatFilePolicy.test.ts src/hooks/urlLoaderPolicy.ts src/hooks/urlLoaderPolicy.test.ts src/hooks/urlLoaderManifestFetch.ts src/components/modals/splatPickerViewModel.ts src/components/modals/splatPickerViewModel.test.ts src/utils/zipLoaderPolicy.test.ts src/utils/fileClassification.test.ts src/components/dropzone
git commit -m "splats: accept PlayCanvas SOG bundles"
```

---

### Task 6: Real SOG fixture and browser coverage

The e2e dataset (`e2e/fixtures/test-data`) has one camera at the origin looking down +Z and one point at (0, 0, 1). The existing splat specs place their Gaussian at (0, 0, 1), where the default view frames it. The fixture torus therefore sits at (0, 0, 1), ringed in the XY plane so it faces the camera. Splats are only drawn in the `Splats` point-cloud mode, and the P key cycles modes. A render is proven by the pixels that change between `Off` and `Splats` in the same view.

**Files:**
- Create: `scripts/generate-sog-fixture.mjs`
- Create: `e2e/fixtures/splats/sog-scene.ply`, `e2e/fixtures/splats/sog-scene.sog` (generated, committed)
- Create: `e2e/fixtures/splat-probe.ts`
- Create: `e2e/sog-splats.spec.ts`, `e2e/webgpu-sog.spec.ts`
- Modify: `playwright.config.ts:9` (`webGpuSoftwareSpec` includes `sog`)

**Interfaces:**
- Consumes:
  - The `?e2eProbe=1` API `window.__COLMAP_WEBVIEW_E2E__`: `getSplatBackendState()`, `getImageIds()`, `resetSession()` and `waitForRenderFrames(count)` (`src/components/viewer3d/Scene3DE2EProbe.tsx:94-129`).
  - `loadTestDataset(page, extraFiles)` and `TestDatasetFileEntry` from `e2e/fixtures/load-test-data.ts`.
  - The point-cloud button `button[aria-label^="Point Cloud:"]`, whose labels are `Point Cloud: Off (P)` and `Point Cloud: Splats (P)`.
- Produces: `e2e/fixtures/splat-probe.ts` helpers, used only by the two new specs. `webgpu-psnr-app.spec.ts` keeps its own copies, so that heavy spec is not churned.

- [ ] **Step 1: Write the fixture generator** (`scripts/generate-sog-fixture.mjs`)

```js
// Regenerates e2e/fixtures/splats/sog-scene.{ply,sog}: a deterministic 2,000-splat
// SH1 torus at (0, 0, 1), where the e2e dataset's camera looks, encoded with
// PlayCanvas's reference converter. Dev-time only:
//   node scripts/generate-sog-fixture.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = 'e2e/fixtures/splats';
const count = 2000;
const MAJOR = 0.15;
const MINOR = 0.04;
let seed = 42;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const SH_C0 = 0.28209479177387814;
const props = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', ...Array.from({ length: 9 }, (_, i) => `f_rest_${i}`),
  'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${count}\n${props.map((p) => `property float ${p}`).join('\n')}\nend_header\n`;
const body = new Float32Array(count * props.length);
for (let i = 0; i < count; i++) {
  const u = rand() * Math.PI * 2;
  const v = rand() * Math.PI * 2;
  const ring = MAJOR + MINOR * Math.cos(v);
  const [x, y, z] = [ring * Math.cos(u), ring * Math.sin(u), 1 + MINOR * Math.sin(v)];
  const rgb = [0.5 + 0.45 * Math.cos(u), 0.5 + 0.45 * Math.sin(u), 0.5 + 0.45 * Math.sin(v)];
  const q = [rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5];
  const n = Math.hypot(...q);
  body.set([
    x, y, z,
    ...rgb.map((c) => (c - 0.5) / SH_C0),
    ...Array.from({ length: 9 }, () => (rand() - 0.5) * 0.2),
    3,
    Math.log(0.006 + rand() * 0.004), Math.log(0.006 + rand() * 0.004), Math.log(0.002 + rand() * 0.002),
    ...q.map((c) => c / n),
  ], i * props.length);
}
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/sog-scene.ply`, Buffer.concat([Buffer.from(header, 'ascii'), Buffer.from(body.buffer)]));
execFileSync('npx', ['--yes', '@playcanvas/splat-transform@3.7.0', '-g', 'cpu', '-w', `${out}/sog-scene.ply`, `${out}/sog-scene.sog`],
  { stdio: 'inherit', shell: process.platform === 'win32' });
```

Run: `node scripts/generate-sog-fixture.mjs`.

Expected: both files are written; `sog-scene.sog` is under 150 KB.

Then confirm the output is a standard SOG: `npx @playcanvas/splat-transform@3.7.0 -g cpu e2e/fixtures/splats/sog-scene.sog --stats null`. Expected: `2K gaussians · 1 SH bands`.

- [ ] **Step 2: Add the shared probe helpers** (`e2e/fixtures/splat-probe.ts`)

```ts
import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { TestDatasetFileEntry } from './load-test-data';

export interface SplatBackendProbeState {
  requestedBackend: string;
  availability: { webGpu: string; spark: boolean; sparkPreloadFailed?: boolean; activeSplatRenderer?: string };
  resolution: { status: string; backend: string | null; reason: string };
}
interface Probe {
  getImageIds: () => number[];
  getSplatBackendState: () => SplatBackendProbeState;
  resetSession: () => void;
  waitForRenderFrames: (count?: number) => Promise<void>;
}
type ProbeWindow = Window & { __COLMAP_WEBVIEW_E2E__?: Probe };

export const SOG_FIXTURE = new URL('./splats/sog-scene.sog', import.meta.url);
export const PLY_FIXTURE = new URL('./splats/sog-scene.ply', import.meta.url);

export function splatEntry(fixture: URL, name: string, bytes: Uint8Array = readFileSync(fixture)): TestDatasetFileEntry {
  return { relativePath: `splats/${name}`, name, base64: Buffer.from(bytes).toString('base64') };
}

export async function waitForSceneProbe(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as ProbeWindow).__COLMAP_WEBVIEW_E2E__), null, { timeout: 10_000 });
}

export async function getSplatBackendState(page: Page): Promise<SplatBackendProbeState> {
  return page.evaluate(() => (window as ProbeWindow).__COLMAP_WEBVIEW_E2E__!.getSplatBackendState());
}

export async function getImageCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as ProbeWindow).__COLMAP_WEBVIEW_E2E__!.getImageIds().length);
}

export async function waitForSplatBackend(page: Page, backend: 'spark' | 'webgpu'): Promise<SplatBackendProbeState> {
  await expect.poll(async () => {
    const state = await getSplatBackendState(page);
    return `${state.resolution.status}:${state.resolution.backend}`;
  }, { timeout: 45_000 }).toBe(`resolved:${backend}`);
  return getSplatBackendState(page);
}

export async function waitForFrames(page: Page, count = 5): Promise<void> {
  await page.evaluate((frames) => (window as ProbeWindow).__COLMAP_WEBVIEW_E2E__!.waitForRenderFrames(frames), count);
}

export async function resetSession(page: Page): Promise<void> {
  await page.evaluate(() => (window as ProbeWindow).__COLMAP_WEBVIEW_E2E__!.resetSession());
  await expect(page.getByTestId('webgpu-splat-canvas')).toHaveCount(0, { timeout: 30_000 });
}

/** Cycle the point-cloud mode with P until the button reports `label` (e.g. 'Splats', 'Off'). */
export async function setPointCloudMode(page: Page, label: 'Off' | 'Splats'): Promise<void> {
  await page.keyboard.press('Tab'); // wake auto-hidden controls
  const button = page.locator('button[aria-label^="Point Cloud:"]').first();
  await expect(button).toBeVisible({ timeout: 10_000 });
  const wanted = `Point Cloud: ${label} (P)`;
  for (let attempt = 0; attempt < 7 && await button.getAttribute('aria-label') !== wanted; attempt += 1) {
    await page.keyboard.press('p');
    await page.waitForTimeout(50);
  }
  await expect(button).toHaveAttribute('aria-label', wanted);
}

export async function captureSceneCenter(page: Page): Promise<Buffer> {
  const box = (await page.getByTestId('scene-3d').boundingBox())!;
  const width = Math.floor(Math.min(320, box.width * 0.45));
  const height = Math.floor(Math.min(240, box.height * 0.45));
  return page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    clip: { x: Math.floor(box.x + box.width / 2 - width / 2), y: Math.floor(box.y + box.height / 2 - height / 2), width, height },
  });
}

/** Compares two same-size screenshots in the page: PSNR (dB) and the share of visibly different pixels. */
export async function compareScreenshots(page: Page, a: Buffer, b: Buffer): Promise<{ psnr: number; changedFraction: number }> {
  return page.evaluate(async ([first, second]) => {
    const pixels = async (base64: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const [x, y] = [await pixels(first), await pixels(second)];
    let squared = 0;
    let changed = 0;
    for (let i = 0; i < x.length; i += 4) {
      let pixelDelta = 0;
      for (let c = 0; c < 3; c += 1) {
        const d = x[i + c] - y[i + c];
        squared += d * d;
        pixelDelta += Math.abs(d);
      }
      if (pixelDelta > 30) changed += 1;
    }
    const mse = squared / ((x.length / 4) * 3);
    return { psnr: mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse), changedFraction: changed / (x.length / 4) };
  }, [a.toString('base64'), b.toString('base64')] as const);
}

/** Loads the e2e dataset plus one splat, and returns the Off vs Splats captures of the same view. */
export async function loadAndCaptureSplat(page: Page, splat: TestDatasetFileEntry, backend: 'spark' | 'webgpu') {
  await loadTestDataset(page, [splat]);
  await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45_000 });
  await setPointCloudMode(page, 'Off');
  await waitForFrames(page);
  const off = await captureSceneCenter(page);
  await setPointCloudMode(page, 'Splats');
  const state = await waitForSplatBackend(page, backend);
  await waitForFrames(page, 20);
  return { off, splats: await captureSceneCenter(page), state };
}
```

Add `import { loadTestDataset } from './load-test-data';` to the imports.

- [ ] **Step 3: Write the Spark specs** (`e2e/sog-splats.spec.ts`, which runs in the `chromium` and `firefox` projects)

```ts
import { unzipSync, zipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures/test-fixtures';
import { loadTestDataset } from './fixtures/load-test-data';
import {
  PLY_FIXTURE, SOG_FIXTURE, compareScreenshots, getImageCount, getSplatBackendState,
  loadAndCaptureSplat, resetSession, setPointCloudMode, splatEntry, waitForSceneProbe,
} from './fixtures/splat-probe';

test.describe('SOG splats', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?e2eProbe=1', { waitUntil: 'domcontentloaded' });
    test.skip(!await page.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2'))), 'WebGL2 is unavailable');
    await waitForSceneProbe(page);
  });

  test('render a SOG through Spark in auto mode', async ({ page }) => {
    const { off, splats, state } = await loadAndCaptureSplat(page, splatEntry(SOG_FIXTURE, 'sog-scene.sog'), 'spark');
    expect(state.availability.activeSplatRenderer).toBe('spark-only');
    expect((await compareScreenshots(page, off, splats)).changedFraction).toBeGreaterThan(0.02);
    await expect(page.getByText('Failed to load splat')).toHaveCount(0);
  });

  test('explain why a damaged SOG cannot open and keep the scene usable', async ({ page }) => {
    const entries = unzipSync(readFileSync(SOG_FIXTURE));
    delete entries['meta.json'];
    await loadTestDataset(page, [splatEntry(SOG_FIXTURE, 'damaged.sog', zipSync(entries, { level: 0 }))]);
    await expect(page.locator('text=Source:')).toBeVisible({ timeout: 45_000 });
    await setPointCloudMode(page, 'Splats');
    await expect(page.getByText("This SOG file can't be opened: meta.json is missing.")).toBeVisible({ timeout: 45_000 });
    expect(await getImageCount(page)).toBe(2);
    expect((await getSplatBackendState(page)).availability.webGpu).not.toBe('failed');

    await resetSession(page);
    const { off, splats } = await loadAndCaptureSplat(page, splatEntry(PLY_FIXTURE, 'sog-scene.ply'), 'spark');
    expect((await compareScreenshots(page, off, splats)).changedFraction).toBeGreaterThan(0.02);
  });

  test('match the source PLY when both render with Spark', async ({ page }) => {
    await page.goto('/?e2eProbe=1&splatBackend=spark', { waitUntil: 'domcontentloaded' });
    await waitForSceneProbe(page);
    const ply = await loadAndCaptureSplat(page, splatEntry(PLY_FIXTURE, 'sog-scene.ply'), 'spark');
    await resetSession(page);
    const sog = await loadAndCaptureSplat(page, splatEntry(SOG_FIXTURE, 'sog-scene.sog'), 'spark');
    expect((await compareScreenshots(page, ply.splats, sog.splats)).psnr).toBeGreaterThan(35);
  });
});
```

- [ ] **Step 4: Write the WebGPU routing spec** (`e2e/webgpu-sog.spec.ts`) and include it in the software WebGPU project

In `playwright.config.ts:9`, change the pattern to `const webGpuSoftwareSpec = /.*webgpu-(psnr|psnr-app|psnr-isolation|render|sog)\.spec\.ts/;`.

```ts
import { test, expect } from './fixtures/test-fixtures';
import {
  PLY_FIXTURE, SOG_FIXTURE, getSplatBackendState, loadAndCaptureSplat, resetSession, splatEntry, waitForSceneProbe,
} from './fixtures/splat-probe';

test('a SOG renders with Spark without disturbing WebGPU, and the next PLY uses WebGPU', async ({ page }) => {
  await page.goto('/?e2eProbe=1&splatBackend=auto', { waitUntil: 'domcontentloaded' });
  test.skip(!await page.evaluate(() => Boolean((navigator as Navigator & { gpu?: unknown }).gpu)), 'WebGPU is unavailable');
  await waitForSceneProbe(page);

  await loadAndCaptureSplat(page, splatEntry(PLY_FIXTURE, 'sog-scene.ply'), 'webgpu');
  await expect(page.getByTestId('webgpu-splat-canvas')).toBeVisible({ timeout: 30_000 });

  await resetSession(page);
  const sog = await loadAndCaptureSplat(page, splatEntry(SOG_FIXTURE, 'sog-scene.sog'), 'spark');
  expect(sog.state.availability.webGpu).toBe('ready');
  await expect(page.getByTestId('webgpu-splat-canvas')).toHaveCount(0);

  await resetSession(page);
  await loadAndCaptureSplat(page, splatEntry(PLY_FIXTURE, 'sog-scene.ply'), 'webgpu');
  expect((await getSplatBackendState(page)).availability.webGpu).toBe('ready');
});
```

(`resetSession` clears the reconstruction but not the splat backend store, so WebGPU `ready` carries across; this is what the test relies on.)

- [ ] **Step 5: Run the browser tests**

Run:
- `npx playwright test e2e/sog-splats.spec.ts --project=chromium --project=firefox --workers=1 --reporter=line`
- `npx playwright test e2e/webgpu-sog.spec.ts --project=chromium-webgpu --workers=1 --reporter=line`
- `npx playwright test e2e/webgpu-psnr-app.spec.ts --project=chromium-webgpu --workers=1 --reporter=line` (includes the existing "auto mode does not download Spark" guard)

Expected:
- `sog-splats`: 6 passed (3 tests × 2 projects).
- `webgpu-sog`: 1 passed.
- `webgpu-psnr-app`: passes unchanged.

Report any skip (no WebGL2, no WebGPU) as a skip, not as coverage.

If the Off→Splats change is under 2%, check a saved `splats` capture before touching thresholds. The torus must be visible at the center of the view. Fix the fixture's placement or size, not the assertion.

- [ ] **Step 6: Commit** (only if commits are authorized)

```bash
git add scripts/generate-sog-fixture.mjs e2e/fixtures/splats e2e/fixtures/splat-probe.ts e2e/sog-splats.spec.ts e2e/webgpu-sog.spec.ts playwright.config.ts
git commit -m "e2e: cover SOG rendering, validation errors and renderer routing"
```

---

### Task 7: Documentation and release notes

**Files:**
- Modify: `README.md:70`
- Modify: `docs/splat-webgpu-migration.md` (the Spark-only formats section, ~338–346)
- Modify: `docs/hugging-face-publishing.md` (splat files paragraph)
- Modify: `CHANGELOG.md` (`## [Unreleased]`)

- [ ] **Step 1: Update the docs**

`README.md` line 70: change `splats (\`.spz\`, \`.ply\`)` to `splats (\`.spz\`, \`.ply\`, or PlayCanvas \`.sog\`)`.

`docs/splat-webgpu-migration.md`, Spark-only formats section: add a paragraph:

> PlayCanvas SOG bundles (`.sog`) render only with Spark. When a SOG becomes the active splat, backend resolution routes it to Spark, which downloads on demand, whatever the WebGPU state. WebGPU availability is never changed by a SOG, so the next PLY/SPZ returns to WebGPU. Before Spark decodes a SOG, `validateSogBundle` (`src/splat/sogBundle.ts`) checks:
> - the zip structure;
> - `meta.json` (v1/v2), with finite bounds and scale codebook values in [-30, 20];
> - that every referenced texture exists and holds the declared count;
> - the exact count against the touch-device ceiling.
>
> GPU PSNR/SSIM is not available for SOG.

`docs/hugging-face-publishing.md`, after the sentence about splat files: `SOG bundles are published and reopened like other splats. ColmapView does not convert splats; to publish a smaller SOG, convert beforehand with \`npx @playcanvas/splat-transform scene.ply scene.sog\`.`

`CHANGELOG.md` under `## [Unreleased]`:

```markdown
### Added

- Load and render PlayCanvas SOG (`.sog`) splats from local files, folders, archives, URLs, manifests and Hugging Face datasets. SOG renders with Spark; PLY and SPZ keep the WebGPU renderer and GPU PSNR.

### Security

- Validate SOG bundles (structure, metadata, texture sizes and device splat limits) before rendering, so malformed or oversized files are refused with a reason instead of reaching the GPU.
```

- [ ] **Step 2: Run the release gates**

Run: `npm run lint`, `npx vitest run`, `npx tsc -b --force` and `npm run build`. Then run `npx playwright test --workers=1 --reporter=line` (the full suite) and `npm run test:pycolmap`.

Expected: all pass. Report any failure, including ones not caused by this work, by name.

- [ ] **Step 3: Commit** (only if commits are authorized)

```bash
git add README.md docs/splat-webgpu-migration.md docs/hugging-face-publishing.md CHANGELOG.md
git commit -m "docs: document SOG splat support"
```
