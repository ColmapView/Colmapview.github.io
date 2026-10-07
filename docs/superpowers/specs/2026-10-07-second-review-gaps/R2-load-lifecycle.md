# R2 — URL load lifecycle and splat choice (G6, G7, G11, G12, G13, E13)

Repo `colmap-webview`, branch `fix/second-review-gaps` @ `e8a2a43`. Line numbers are at `e8a2a43`.

| ID | Verdict | Fix in one line | Effort (implementer / reviewer) |
|---|---|---|---|
| **G6** | Confirmed | A URL load settles its splat list and saved settings after parsing and **before** its scene is committed; discovery gets a 30 s bound that starts after parsing. | max / max |
| **G7** | Confirmed | Every dataset load starts with only its own splat request; the restore stops re-arming one. | high / high |
| **G11** | Confirmed | The URL load records its share link's None for its own commit, and the store commits a requested None. | high / high (with G7) |
| **G12** | Confirmed | `runLoad`'s `finally` keeps the indicator while a tile download is pending. | medium / medium |
| **G13** | Confirmed | Closing the picker chooses None only while nothing shows; only the newest open dialog answers Escape. | medium / high |
| **E13** | Confirmed (latent) | Drop the trailing `commitSource()` from the manifest and splat loaders, as for archives. | low / low |

**No decision changes.** Two refinements, both inside the brief's recommendations:
- "Closing the picker keeps meaning COLMAP only" (load-path design, item 7) now holds while no splat shows.
- The window in which `n` is ignored ("while a dataset load is pending") now also covers a URL load's settle step. That step runs inside `processFiles`, so `isReconstructionLoadPending()` already reports it.

**How this was checked.**
- Two scratch trees under `scratchpad/rev3/r2/`:
  - `head/` holds `e8a2a43`'s `src`.
  - `fix/` holds `src` with every change below.
  - Both trees have the same test files and a `node_modules` junction.
- RED means a test fails in `head/`. GREEN means it passes in `fix/`.
- Every new test is RED for the intended assertion, and GREEN.
- The full suite, `tsc -p tsconfig.test.json`, `eslint`, one mutation check and three repeat runs all pass. See the Verification log at the end.
- The repo was never edited.

---

## G6 — Manifest and HF loads finish after the overlay is gone (regression from v0.15.4)

### Verified

**HEAD.** A URL load commits its scene first and only then waits for what it restores.
- `fileDropzoneWorkflow.ts:643-645`: `processFileDropzoneFiles`' `finally` runs `setUrlLoading(false)` right after the commit. Only a splat handed to the renderer keeps the loading state.
- `urlLoaderManifestSource.ts:142-143`: afterwards, `loadManifestSource` awaits:
  - `catalogTask`, which is unbounded (`:76`);
  - the optional settings (`getViewerState()`), up to 3 s after parsing.
- `useUrlLoader.ts:237` and `:247`: archives and direct splat files await `applyOptionalSettingsBeside` after processing.
- `useUrlLoader.ts:171`: the restore (`applySavedViewerState`) runs only then.
- `useUrlState.ts:156-159`: the restore applies the early fields. These are alignment, navigation and `selectedImageId`, plus `flyToState(view)`.

**What happens in that window:**
- **A dropped folder cancels the load.**
  - `handleDrop` checks only `urlLoading` (`useFileDropzone.ts:171`).
  - `loadDropPayload` then calls `cancelUrlLoad()` (`useFileDropzone.ts:24-27`), which runs `finishUrlLoad`.
  - The URL load's catalog, its saved alignment and view, and its Reload binding (`setSourceViewerState`, `useUrlLoader.ts:170`) never land.
  - `useFileDropzone.test.ts:53` pins this window ("cancels pending URL settings when local files are dropped").
- **A new URL load is refused with no message.** `tryStartUrlLoad` returns `null` while `urlLoadActive` (`reconstructionStore.ts:613-616`). `DropZone.prepareUrlLoad` then returns silently (`DropZone.tsx:51`).
- **The late restore overrides the user's orbit and selection.** The keyboard (WASD, `1`–`6`, `r`, `shift+←/→`, `n`) and the pointer both act on the visible scene. The late fly-to and `selectedImageId` then override them.

**Reproduced.** All three of these tests are in "Tests" below. Each one is RED at HEAD:
- `useUrlLoader.test.ts` › "keeps the overlay, its Cancel and the parsed scene back until they settle". At HEAD, once parsing is done and the settings request is still pending, `urlLoading` is `false` and `reconstruction` is already committed.
- `urlLoaderManifestSource.test.ts` › "parses COLMAP files while optional settings load, and shows the scene once they settle". At HEAD, the source is committed while the settings are pending.
- `useUrlLoader.test.ts` › "settles the settings beside an archive before handing its bundled splat to the renderer". At HEAD, the scene is committed and the splat is handed to the renderer while the settings beside the archive are still pending.

**v0.15.4** (`git show v0.15.4:src/hooks/urlLoaderManifestSource.ts`, `:58-61`, `:86-92`):
- Settings came from `Promise.all([fetchPublishedViewerState(...), fetchColmapFiles(...)])` before `processFiles`.
- Discovery ran inside `fetchManifestColmapFiles` (`withDiscoveredRemoteSplats`) under the "Discovering splat files..." overlay, also before `processFiles`.
- After `processFiles`, only synchronous work and `decodeShareData` were left, so there was no visible window.

### Root cause

The load-path fixes moved discovery and the optional settings off the critical path. That was right for transfer and parsing, but they also moved the **wait** for them to after the scene commit. `processFiles` ends the loading state at the commit because it assumes the commit is the end of the load. For URL loads it is not.

### Fix (code) — settle after parsing, before the commit

**Recommended design.** `processFileDropzoneFiles` gains an optional async `beforeSceneCommit` hook. It is awaited after parsing (and after the PLY parse on the point-cloud path), just before any scene replacement.
- **Manifest loads.** `loadManifestSource` passes a hook that settles the bounded catalog and the optional settings, which already run alongside the downloads.
- **Archives and direct files.** The URL loader passes a hook that settles the settings beside the URL.
- **Fallback.** Each loader keeps its post-`processFiles` await, memoized. A load that merged instead of replacing (no hook call), or a test double, still settles there.

**Why this design.** Nothing of the new scene is visible until its restore inputs are known. The restore then lands in the same tick as the commit. The only await left after the commit is the restored splat's download, which owns its own overlay and Cancel.
- **`n`** is ignored during the wait for free: the wait runs inside `processFiles`, so `isReconstructionLoadPending()` is true.
- **Drops** are ignored during the wait: `urlLoading` stays true, because `processFiles` has not reached its `finally`.

**Both decisions hold:**
- The settings deadline starts in the hook, after parsing.
- The picker is still offered only by `runLoad` after `applySavedViewerState`.

**Rejected alternatives:**
- **(a) Keep the commit first, and hold the overlay afterwards.** This means `processFiles` keeps `urlLoading` for URL loads, and the overlay and drop guards also read `urlLoadActive`. Three problems:
  - The keyboard still acts on the visible scene under the overlay (WASD, `1`–`6`, `shift+←/→`, `n` on bundled splats), and the late restore overrides it.
  - A renderer finishing a bundled splat, or a pick, clears `urlLoading` or `urlProgress` in the middle of the wait.
  - Cancel during the wait leaves a half-loaded scene, with no catalog, no settings and no Reload binding. That is G3's outcome.
- **(b) Await before `processFiles`, exactly as v0.15.4 did.** This starts the settings deadline before parsing, which contradicts the deliberate "after parsing" decision.

#### `src/hooks/fileDropzoneWorkflow.ts`
```diff
@@ export interface FileDropzoneWorkflowOptions {
   reload?: boolean;
   throwOnError?: boolean;
+  /**
+   * Awaited once parsing is done, just before these files replace the scene: a URL load settles what
+   * the new scene restores (saved settings, its splat list), so the scene never appears and then jumps.
+   */
+  beforeSceneCommit?: () => Promise<void>;
   onSceneReplaced?: () => void;
@@ async function runNewPointCloudOnlyLoad(
   log: (message: string) => void,
   signal?: AbortSignal,
   onSceneReplaced?: () => void,
+  beforeCommit?: () => Promise<void>,
 ): Promise<void> {
   await runPointCloudOnlyLoad({
     signal,
+    beforeCommit,
     pointCloudFile,
@@ export async function processFileDropzoneFiles(
     progressRange,
     replaceSplatScene = false,
     throwOnError = false,
+    beforeSceneCommit,
     onSceneReplaced,
     onViewerState = deps.onViewerState,
   } = normalizedOptions;
+  const settleBeforeCommit = async () => {
+    if (!beforeSceneCommit) return;
+    await beforeSceneCommit();
+    load.assertCurrent();
+  };
@@
     /** Replace the scene with a splat-only one; returns the splat shown until then. */
-    const replaceWithSplatOnlyScene = () => {
+    const replaceWithSplatOnlyScene = async () => {
+      await settleBeforeCommit();
       const current = deps.getLoadedFiles();
@@
           if (!updatedExistingSplat) {
-            splatShownBefore = replaceWithSplatOnlyScene();
+            splatShownBefore = await replaceWithSplatOnlyScene();
             startedNewSplatScene = true;
           }
         } else if (pointCloudFile) {
-          await runNewPointCloudOnlyLoad(files, pointCloudFile, deps, clearCaches, mapProgress, logger.info, load.signal, reportSceneReplacement);
+          await runNewPointCloudOnlyLoad(files, pointCloudFile, deps, clearCaches, mapProgress, logger.info, load.signal,
+            reportSceneReplacement, settleBeforeCommit);
           load.assertCurrent();
@@
       if (pointCloudFile && !splatFile) {
-        await runNewPointCloudOnlyLoad(files, pointCloudFile, deps, clearCaches, mapProgress, logger.info, load.signal, reportSceneReplacement);
+        await runNewPointCloudOnlyLoad(files, pointCloudFile, deps, clearCaches, mapProgress, logger.info, load.signal,
+          reportSceneReplacement, settleBeforeCommit);
         load.assertCurrent();
         return await complete();
       }
 
       if (hasImageFiles(files)) {
+        await settleBeforeCommit();
         const currentLoadedFiles = deps.getLoadedFiles();
@@
       if (splatFile) {
-        handOffCommittedSplat(replaceWithSplatOnlyScene());
+        handOffCommittedSplat(await replaceWithSplatOnlyScene());
         return await complete();
       }
@@
       await delay(200);
     }
     load.assertCurrent();
+    await settleBeforeCommit();
 
     const currentSelection = deps.getSplatSelectionState?.();
```
Notes:
- **COLMAP path.** The hook comes before the in-load choice block. A pick made during the wait is therefore judged at commit by the existing Task 16 rules.
- **Merge path.** `updateLoadedSplatFile` is not a replacement and calls no hook. No UI entry point loads a URL over an open scene, so a merge falls back to the loader's post-`processFiles` settle.
- **Aborts.** An abort during the hook surfaces as an `AbortError`. The existing `catch` then returns `false`, and the `finally` disposes the parsed snapshot.

#### `src/hooks/fileDropzonePointCloudOnly.ts`
```diff
 interface RunPointCloudOnlyLoadOptions {
   signal?: AbortSignal;
+  /** Awaited after parsing, before the point cloud replaces the scene. */
+  beforeCommit?: () => Promise<void>;
   pointCloudFile: File;
@@ export async function runPointCloudOnlyLoad({
   signal,
+  beforeCommit,
   pointCloudFile,
@@
   const points3D = await parsePointCloudFile(pointCloudFile);
   if (signal?.aborted) throw new DOMException('Reconstruction operation cancelled', 'AbortError');
+  await beforeCommit?.();
   const reconstruction = createPointCloudOnlyReconstruction(points3D);
```

#### `src/hooks/useFileDropzone.ts` (`processFiles` only; G7 adds one line to `beginLocalLoad`)
```diff
-    options: Pick<FileDropzoneWorkflowOptions, 'onSceneReplaced' | 'replaceSplatScene' | 'reload' | 'throwOnError' | 'onViewerState' | 'viewerState' | 'load' | 'signal' | 'initialSplatSelectionRevision'> = {}
+    options: Pick<FileDropzoneWorkflowOptions, 'beforeSceneCommit' | 'onSceneReplaced' | 'replaceSplatScene' | 'reload' | 'throwOnError' | 'onViewerState' | 'viewerState' | 'load' | 'signal' | 'initialSplatSelectionRevision'> = {}
@@
       }, {
         progressRange,
+        beforeSceneCommit: options.beforeSceneCommit,
         onSceneReplaced: options.onSceneReplaced,
```
`runLoad`'s `load.processFiles` wrapper spreads `...options`, so the hook reaches `processFiles` with no change to that wrapper.

#### `src/hooks/urlLoaderManifestSource.ts` (G6 hunks; the `commitSource()` removal belongs to E13)
```diff
 import { fetchDatasetResource } from '../utils/fetchDatasetResource';
+import { FETCH_TIMEOUT } from '../utils/fetchWithTimeout';
 import { detectTouchDevice } from './useIsTouchDevice';
 import { anySignal } from '../utils/abortSignals';
 
 export { OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS } from './urlLoaderViewerState';
 
+/**
+ * How long the parsed scene waits for a splat listing that is still running. Discovery starts with
+ * the downloads, so a listing unfinished this long after parsing is stalled; the scene then appears
+ * without it, as when discovery fails.
+ */
+export const SPLAT_DISCOVERY_TIMEOUT_MS = FETCH_TIMEOUT;
+
+const RESTORE_INPUTS_PROGRESS = { percent: 90, message: 'Looking for splats and saved settings...' };
+
 type ProcessFiles = (
   files: Map<string, File>,
   progressRange?: { start: number; end: number },
-  options?: { throwOnError?: boolean; signal?: AbortSignal; onSceneReplaced?: () => void }
+  options?: { throwOnError?: boolean; signal?: AbortSignal; onSceneReplaced?: () => void;
+    beforeSceneCommit?: () => Promise<void> }
 ) => Promise<void | boolean>;
@@
+/** Waits up to `ms` for work already running; the load's own cancellation still rejects. */
+async function settleWithin<T>(task: Promise<T>, ms: number, signal?: AbortSignal): Promise<{ value: T } | null> {
+  let timer: ReturnType<typeof setTimeout> | undefined;
+  let cancel: (() => void) | undefined;
+  const deadline = new Promise<null>((resolve, reject) => {
+    cancel = () => reject(signal?.reason ?? new DOMException('Dataset load cancelled', 'AbortError'));
+    if (signal?.aborted) { cancel(); return; }
+    signal?.addEventListener('abort', cancel, { once: true });
+    timer = setTimeout(() => resolve(null), ms);
+  });
+  try {
+    return await Promise.race([task.then(value => ({ value })), deadline]);
+  } finally {
+    clearTimeout(timer);
+    if (cancel) signal?.removeEventListener('abort', cancel);
+  }
+}
+
 export async function loadManifestSource(
@@
   const fetchImpl = deps.fetchImpl ?? ((url, init) => fetchDatasetResource(url, undefined, init));
+  const discoveryController = new AbortController();
+  const discoverySignal = deps.signal ? anySignal([deps.signal, discoveryController.signal]) : discoveryController.signal;
   const discover = deps.discoverSplatCatalog ?? ((target: ColmapManifest) => discoverManifestSplatCatalog(target, {
-    fetchImpl, log, isTouchDevice: deps.isTouchDevice,
+    fetchImpl: (url, init) => fetchImpl(url, { ...init, signal: discoverySignal }), log, isTouchDevice: deps.isTouchDevice,
   }));
   // Discovery and optional settings do not gate required file transfer or parsing.
   const catalogTask = discover(manifest).catch(() => [] as RemoteSplatCandidate[]);
+  let catalogSettled: Promise<RemoteSplatCandidate[]> | undefined;
+  /** The listing, given SPLAT_DISCOVERY_TIMEOUT_MS from the first call; a slower one is dropped like a failed one. */
+  const settleCatalog = () => catalogSettled ??= settleWithin(catalogTask, SPLAT_DISCOVERY_TIMEOUT_MS, deps.signal)
+    .then(result => {
+      if (result) return result.value;
+      discoveryController.abort(new DOMException('Splat discovery timed out', 'TimeoutError'));
+      log(`[URL Loader] Splat discovery took longer than ${SPLAT_DISCOVERY_TIMEOUT_MS / 1000} s after parsing; no splats are listed`);
+      return [];
+    });
@@
   const explicitViewerState = manifest.viewerStatePath === undefined ? null : await getViewerState();
+  let restoreInputs: Promise<[RemoteSplatCandidate[], PublishedViewerState | null]> | undefined;
+  /** What the new scene restores with it; their deadlines start with the first call, after parsing. */
+  const settleRestoreInputs = () => restoreInputs ??= Promise.all([settleCatalog(),
+    manifest.viewerStatePath === undefined ? getViewerState() : Promise.resolve(explicitViewerState)]);
   log(`[URL Loader] Downloaded ${files.size} COLMAP files:`, Array.from(files.keys()));
@@
   log('[URL Loader] Calling processFiles...');
+  // The scene appears with its splat list and saved settings, so its restore lands before anyone
+  // can move it; until then the overlay, its Cancel and the old scene stay.
   const processed = await deps.processFiles(files, { start: 80, end: 100 }, {
     throwOnError: true, signal: deps.signal, onSceneReplaced: commitSource,
+    beforeSceneCommit: async () => {
+      deps.setUrlProgress(RESTORE_INPUTS_PROGRESS);
+      await settleRestoreInputs();
+    },
   });
@@
-  const [catalog, viewerState] = await Promise.all([catalogTask,
-    manifest.viewerStatePath === undefined ? getViewerState() : explicitViewerState]);
+  const [catalog, viewerState] = await settleRestoreInputs();
   assertCurrent();
@@
   } finally {
     optionalSettings?.cancel();
     explicitSettingsController?.abort();
+    discoveryController.abort();
   }
```
- `getViewerState()` still sets `optionalSettingsTimedOut` and calls `onOptionalSettingsTimeout` exactly once, through the memo. The "no auto-load after a settings timeout" rule is unchanged.
- The timeout warning now appears just before the scene instead of just after it.

#### `src/hooks/urlLoaderZipSource.ts` and `src/hooks/urlLoaderSplatSource.ts` (pass the hook through)
```diff
 type ProcessFiles = (
   files: Map<string, File>,
   progressRange?: { start: number; end: number },
-  options?: { throwOnError?: boolean; signal?: AbortSignal; onSceneReplaced?: () => void }
+  options?: { throwOnError?: boolean; signal?: AbortSignal; onSceneReplaced?: () => void;
+    beforeSceneCommit?: () => Promise<void> }
 ) => Promise<void | boolean>;
@@ export interface LoadZipUrlSourceDeps {
   sourceUrl?: string;
+  /** Settled after parsing, before the archive's scene replaces the open one. */
+  beforeSceneCommit?: () => Promise<void>;
 }
@@
   const processed = await deps.processFiles(colmapFiles, { start: 80, end: 100 }, {
-    throwOnError: true, signal: deps.signal, onSceneReplaced: commitSource,
+    throwOnError: true, signal: deps.signal, onSceneReplaced: commitSource, beforeSceneCommit: deps.beforeSceneCommit,
   });
```
```diff
 type ProcessFiles = (
   files: Map<string, File>,
   progressRange?: { start: number; end: number },
-  options?: { replaceSplatScene?: boolean; throwOnError?: boolean; signal?: AbortSignal; onSceneReplaced?: () => void }
+  options?: { replaceSplatScene?: boolean; throwOnError?: boolean; signal?: AbortSignal; onSceneReplaced?: () => void;
+    beforeSceneCommit?: () => Promise<void> }
 ) => Promise<void | boolean>;
@@ export interface LoadSplatUrlSourceDeps {
   setUrlProgress: SetUrlProgress;
+  /** Settled before the file's scene replaces the open one. */
+  beforeSceneCommit?: () => Promise<void>;
 }
@@
   const processed = await deps.processFiles(files, { start: 80, end: 100 }, {
     replaceSplatScene: true,
     throwOnError: true,
     signal: deps.signal,
     onSceneReplaced: commitSource,
+    beforeSceneCommit: deps.beforeSceneCommit,
   });
```

#### `src/hooks/useUrlLoader.ts` (G6 hunks)
```diff
@@ async function applyOptionalSettingsBeside(url: string, load: UrlLoadContext): Promise<void> {
   if (settings.state) await load.onViewerState(settings.state);
 }
 
+/**
+ * The settings beside `url`, read once. The load asks for them just before its scene appears, so the
+ * restore lands with the scene, and again afterwards for a load that merged rather than replaced.
+ */
+function settingsBesideOnce(url: string, load: UrlLoadContext) {
+  let settled: Promise<void> | undefined;
+  const settle = () => settled ??= applyOptionalSettingsBeside(url, load);
+  return {
+    beforeSceneCommit: () => {
+      load.setUrlProgress({ percent: 90, message: 'Loading saved view settings...' });
+      return settle();
+    },
+    settle,
+  };
+}
@@ loadFromUrl
     if (isSplatUrl(normalizedUrl)) {
       load.clearCachesOnFailure = false;
       load.setUrlProgress({ percent: 0, message: 'Loading 3D file...' });
+      const settings = settingsBesideOnce(normalizedUrl, load);
       const loaded = await loadSplatUrlSource(normalizedUrl, {
         ...load,
         log: logInfo,
+        beforeSceneCommit: settings.beforeSceneCommit,
       });
       if (loaded) {
-        await applyOptionalSettingsBeside(normalizedUrl, load);
+        await settings.settle();
       }
       return loaded;
     }
 
     if (isArchiveUrl(normalizedUrl)) {
       load.setUrlProgress({ percent: 0, message: 'Loading archive...' });
       logInfo(getArchiveUrlDetectedLogMessage(normalizedUrl));
-      const loaded = await loadZipUrlSource(normalizedUrl, { ...load, log: logInfo });
+      const settings = settingsBesideOnce(normalizedUrl, load);
+      const loaded = await loadZipUrlSource(normalizedUrl, { ...load, log: logInfo,
+        // Known once processing starts: settings inside the archive are its own.
+        beforeSceneCommit: async () => { if (!load.hasEmbeddedViewerSettings) await settings.beforeSceneCommit(); } });
       if (loaded && !load.hasEmbeddedViewerSettings) {
-        await applyOptionalSettingsBeside(normalizedUrl, load);
+        await settings.settle();
       }
       return loaded;
     }
```
- `load.hasEmbeddedViewerSettings` is set by `runLoad`'s `processFiles` wrapper before the workflow runs, so the hook reads it correctly.
- The Drive branch has no settings beside it and is unchanged.

### The gap after the fix

The commit no longer opens a window. Two phases remain:
- **Settle:** after parsing, before the commit.
- **Restored-splat download:** unchanged, plus G12.

| Event | HEAD (commit first, then wait) | Settle (scene parsed, not committed) | Restored-splat download (scene committed) |
|---|---|---|---|
| **Dropped folder** | Accepted. It cancels the URL load, and the tiles, the saved alignment and view, and the Reload binding never land. | Ignored ("Ignoring drop during active loading"). `urlLoading` is still true. | Ignored, as at HEAD. The download holds `urlLoading`. |
| **New URL load** | Refused by `tryStartUrlLoad` with no message, while the viewer looks idle. | Not reachable. The overlay covers the viewer, and the landing panels and Load URL are hidden or disabled while `urlLoading`. `tryStartUrlLoad` still refuses. | Same. |
| **`n`** | Allowed. On bundled splats it clears the overlay. | Ignored. `isReconstructionLoadPending()` is true until `processFiles` returns. | Allowed, as designed. It is a choice for the new dataset: it wins over the saved or automatic splat, and the saved display still lands. With G12, its download keeps the overlay and Cancel. |
| **Orbit** | Free. The late fly-to overrides it. | The pointer is blocked by the overlay. Keyboard moves act on the previous scene or the empty canvas. The commit's `resetView` and the restore's fly-to then land in one tick; `useTrackballViewResets` runs before `useTrackballFlyTo`, so the fly-to wins. Nothing done to the new scene is overridden. | The pointer is blocked. Keyboard moves come after the early restore and stand. |
| **Selection** | The late `selectedImageId` overrides it. | There is nothing of the new scene to select. `selectedImageId` lands with the commit. | It comes after the early restore and stands. |
| **Cancel** | No Cancel: the overlay is gone. | Stops the load before its scene. The previous scene stays, or the landing page with the URL request stripped. Nothing is left half-loaded. | As at HEAD. The download stops, alignment, view, navigation and selection have already landed, and the settings are bound for Reload. |

Committing and restoring in the same tick is the path local projects with a `colmapview.yaml` already take, because `complete()` runs the restore right after the commit.

### Discovery bound: `SPLAT_DISCOVERY_TIMEOUT_MS = FETCH_TIMEOUT` (30 s), starting after parsing

- **The problem.** HEAD has no bound. A listing can run up to 50 sequential HF tree pages, or a directory crawl of 200 sequential listings and 200 `HEAD`s. Each request may idle up to `FETCH_TIMEOUT`. Once discovery holds the commit, it needs a cap.
- **When it starts.** Like the settings deadline (load-path design, item 10), the deadline starts when the result is needed, which is after parsing. Discovery already runs alongside the downloads and parsing, so slow connections are not penalized. The guard test below fails if the deadline starts with the downloads.
- **Why 30 s.** `FETCH_TIMEOUT` is the app's existing threshold for a stalled request. The scene therefore never waits on discovery longer than it would wait on one stalled request. A listing still running 30 s after parsing, having also had the whole download and parse time, is stalled or pathological. The bound is longer than the 3 s settings deadline because losing the listing hides the dataset's splats for the session, while losing settings only falls back to defaults.
- **On timeout.** Discovery's requests are aborted, and the scene appears without a catalog: no tiles, no auto-load and no picker. A log line says so. That is the same outcome as a failed discovery today (`.catch(() => [])` plus the "discovery skipped" logs). An optional follow-up is a persistent warning like the settings one. It is not part of this fix.

### Tests (code)

**`src/hooks/fileDropzoneWorkflow.test.ts`**: insert before `it('preserves the previous files, source and snapshot after a malformed point-cloud-only replacement'`. It reuses `workerLoadFixture` and `createDeps`.
```ts
  it('replaces the scene only once beforeSceneCommit settles after parsing', async () => {
    const fixture = workerLoadFixture();
    const order: string[] = [];
    let settle!: () => void;
    const deps = createDeps({
      parseFiles: vi.fn(async () => { order.push('parse'); return fixture.parseResult; }),
      buildReconstruction: vi.fn(async () => ({ reconstruction: fixture.reconstruction, pointCount: 0 })),
      setLoadedFiles: vi.fn(() => { order.push('commit'); }),
    });
    try {
      const pending = processFileDropzoneFiles(fixture.files, deps, {
        beforeSceneCommit: () => new Promise<void>(resolve => { order.push('settle'); settle = resolve; }),
      });
      await vi.waitFor(() => expect(order).toEqual(['parse', 'settle']));
      // The overlay stays up meanwhile: nothing has ended the loading state.
      expect(deps.setUrlLoading).not.toHaveBeenCalledWith(false);
      settle();
      expect(await pending).toBe(true);
      expect(order).toEqual(['parse', 'settle', 'commit']);
    } finally {
      fixture.service.dispose();
    }
  });

  it('keeps the previous scene when the load is cancelled while the new one settles', async () => {
    const fixture = workerLoadFixture();
    const controller = new AbortController();
    const deps = createDeps({
      parseFiles: vi.fn(async () => fixture.parseResult),
      buildReconstruction: vi.fn(async () => ({ reconstruction: fixture.reconstruction, pointCount: 0 })),
    });
    const dispose = vi.spyOn(fixture.snapshot, 'dispose');
    try {
      const pending = processFileDropzoneFiles(fixture.files, deps, {
        signal: controller.signal,
        beforeSceneCommit: () => new Promise<void>((_resolve, reject) => {
          controller.signal.addEventListener('abort', () => reject(controller.signal.reason));
          controller.abort();
        }),
      });
      expect(await pending).toBe(false);
      expect(deps.setLoadedFiles).not.toHaveBeenCalled();
      expect(deps.setReconstruction).not.toHaveBeenCalled();
      expect(dispose).toHaveBeenCalled();
    } finally {
      fixture.service.dispose();
    }
  });
```
RED at HEAD: `expected [ 'parse', 'commit' ] to deeply equal [ 'parse', 'settle' ]` and `expected true to be false`.

**`src/hooks/fileDropzonePointCloudOnly.test.ts`**: insert before `it('builds a reconstruction with points3D and no active splat file'`.
```ts
  it('installs the point cloud only once beforeCommit settles after parsing', async () => {
    const point = buildPoint3D({ point3DId: 1n });
    const order: string[] = [];
    let settle!: () => void;
    const loading = runPointCloudOnlyLoad({
      pointCloudFile: new File(['ply'], 'points.ply'),
      mapProgress: value => value,
      setUrlProgress: vi.fn(),
      setLoadedFiles: vi.fn(() => { order.push('commit'); }),
      clearSplatPsnr: vi.fn(),
      clearCaches: vi.fn(),
      setReconstruction: vi.fn(),
      resetView: vi.fn(),
      addNotification: vi.fn(),
      parsePointCloudFile: vi.fn(async () => { order.push('parse'); return new Map([[point.point3DId, point]]); }),
      log: vi.fn(),
      beforeCommit: () => new Promise<void>(resolve => { order.push('settle'); settle = resolve; }),
    });

    await vi.waitFor(() => expect(order).toEqual(['parse', 'settle']));
    settle();
    await loading;
    expect(order).toEqual(['parse', 'settle', 'commit']);
  });
```
RED at HEAD: `expected [ 'parse', 'commit' ] …`.

**`src/hooks/urlLoaderManifestSource.test.ts`**:
- Import `type RemoteSplatCandidate` from `./urlLoaderPolicy`, and `SPLAT_DISCOVERY_TIMEOUT_MS` alongside `OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MS`.
- `makeDeps`: the explicit return types let the tests below re-mock `fetchImpl` and `discoverSplatCatalog`. The `onSceneReplaced` call comes with E13.

```diff
+type ProcessOptions = { onSceneReplaced?: () => void; beforeSceneCommit?: () => Promise<void> };
+
 function makeDeps(files = makeFiles()) {
   return {
-    fetchImpl: vi.fn(async (_url: string, _init?: RequestInit) => new Response('', { status: 404 })),
+    fetchImpl: vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => new Response('', { status: 404 })),
     fetchColmapFiles: vi.fn(async () => files),
-    discoverSplatCatalog: vi.fn(async () => []),
+    discoverSplatCatalog: vi.fn(async (): Promise<RemoteSplatCandidate[]> => []),
     log: vi.fn(),
-    processFiles: vi.fn(async () => {}),
+    // Like processFiles: parse, settle what the scene restores, then report the scene it replaced.
+    processFiles: vi.fn(async (_files: Map<string, File>, _range?: unknown, options?: ProcessOptions): Promise<void | boolean> => {
+      await options?.beforeSceneCommit?.();
+      options?.onSceneReplaced?.();
+    }),
```
Replace `it('parses and displays COLMAP files while optional viewer settings are still loading', …)`, which pins the regression, with the first test below. Add the next two tests after it.
```ts
  it('parses COLMAP files while optional settings load, and shows the scene once they settle', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const deps = makeDeps();
    let respond!: (response: Response) => void;
    deps.fetchImpl.mockImplementationOnce(() => new Promise<Response>(resolve => { respond = resolve; }));
    const onViewerState = vi.fn();
    const loading = loadManifestSource(manifest, { type: 'manifest' }, { ...deps, onViewerState });

    await vi.waitFor(() => expect(deps.processFiles).toHaveBeenCalled());
    // Parsed, but the scene waits, behind the overlay, for what it restores.
    expect(deps.setSourceInfo).not.toHaveBeenCalled();
    expect(deps.setUrlProgress).toHaveBeenLastCalledWith({ percent: 90, message: 'Looking for splats and saved settings...' });
    respond(new Response('ui:\n  background_color: "#123456"\n'));

    await expect(loading).resolves.toBe(true);
    expect(deps.setSourceInfo).toHaveBeenCalledOnce();
    expect(onViewerState).toHaveBeenCalledWith(expect.objectContaining({ config: { ui: { backgroundColor: '#123456' } } }));
  });

  it('shows the scene without a splat listing still running SPLAT_DISCOVERY_TIMEOUT_MS after parsing, and stops it', async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const listingSignals: AbortSignal[] = [];
    deps.fetchImpl.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('colmapview.yaml')) return new Response('', { status: 404 });
      if (init?.signal) listingSignals.push(init.signal);
      return new Promise<Response>(() => {});
    });
    const onRemoteSplatCatalog = vi.fn();
    const onAutoSplatSource = vi.fn();
    let settled = false;
    // The real discovery: it classifies and sizes the listed splat through fetchImpl.
    const loading = loadManifestSource({ ...manifest, splats: ['splats/scene.ply'] }, { type: 'manifest' },
      { ...deps, discoverSplatCatalog: undefined, onRemoteSplatCatalog, onAutoSplatSource }).finally(() => { settled = true; });

    await vi.waitFor(() => expect(deps.processFiles).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(SPLAT_DISCOVERY_TIMEOUT_MS - 1_000);
    expect(settled).toBe(false);
    expect(deps.setSourceInfo).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(loading).resolves.toBe(true);
    expect(deps.setSourceInfo).toHaveBeenCalledOnce();
    expect(onRemoteSplatCatalog).not.toHaveBeenCalled();
    expect(onAutoSplatSource).not.toHaveBeenCalled();
    expect(listingSignals.length).toBeGreaterThan(0);
    expect(listingSignals.every(signal => signal.aborted)).toBe(true);
  });

  it('starts the splat listing deadline after parsing, not with the downloads', async () => {
    vi.useFakeTimers();
    let finishListing!: (catalog: RemoteSplatCandidate[]) => void;
    const deps = { ...makeDeps(), discoverSplatCatalog: vi.fn(() => new Promise<RemoteSplatCandidate[]>(resolve => { finishListing = resolve; })) };
    let finishDownload!: (files: Map<string, File>) => void;
    deps.fetchColmapFiles.mockImplementationOnce(() => new Promise<Map<string, File>>(resolve => { finishDownload = resolve; }));
    const onRemoteSplatCatalog = vi.fn();
    const loading = loadManifestSource(manifest, { type: 'manifest' }, { ...deps, onRemoteSplatCatalog });

    // The downloads alone outlast the deadline; the listing still gets its full time after parsing.
    await vi.advanceTimersByTimeAsync(SPLAT_DISCOVERY_TIMEOUT_MS * 2);
    finishDownload(makeFiles());
    await vi.advanceTimersByTimeAsync(SPLAT_DISCOVERY_TIMEOUT_MS - 1_000);
    finishListing([{ path: 'splats/scene.spz', size: 100 }]);

    await expect(loading).resolves.toBe(true);
    expect(onRemoteSplatCatalog).toHaveBeenCalledWith([{ path: 'splats/scene.spz', size: 100 }]);
  });
```
- **RED at HEAD.** The first two fail on `setSourceInfo` being called before the settings or listing settle.
- **The third is a guard.** It passes at HEAD, which has no deadline. A mutation that starts the deadline at load start (`void settleCatalog()` before the downloads) makes it fail: `expected "vi.fn()" to be called with arguments`. Keep it, because it pins the deliberate "after parsing" rule for the new deadline.

**`src/hooks/useUrlLoader.test.ts`**:
- Add `import { isReconstructionLoadPending } from '../wasm/reconstructionLoadLifecycle';`.
- Add the helper below after `hubEntries`. G11's test reuses it, so it lands with G6.
```ts
/** What processFiles does for a URL load: the real workflow over the real store, with parsing stubbed. */
function processWithStore(files: Map<string, File>, options?: Parameters<typeof processFileDropzoneFiles>[2]) {
  const state = useReconstructionStore.getState();
  return processFileDropzoneFiles(files, {
    addNotification: vi.fn(), getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
    getSplatSelectionState: () => ({ revision: useReconstructionStore.getState().splatSelectionRevision,
      sourceId: getShareActiveSplatSourceId(useReconstructionStore.getState().loadedFiles) ?? undefined }),
    getMinTrackLength: () => 1, getSourceInfo: () => ({ sourceType: 'url', imageUrlBase: null }),
    getUrlLoading: () => useReconstructionStore.getState().urlLoading,
    clearCaches: vi.fn(), logger: noopLogger, resetView: vi.fn(), delay: async () => {},
    shouldPreloadSplatRuntime: () => false,
    parseFiles: async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false }),
    buildReconstruction: async () => ({ reconstruction: buildReconstruction(), pointCount: 0 }),
    setDroppedFiles: state.setDroppedFiles, setLoadedFiles: state.setLoadedFiles,
    setWasmReconstruction: state.setWasmReconstruction, setReconstruction: state.setReconstruction,
    setUrlProgress: state.setUrlProgress, setUrlLoading: state.setUrlLoading, setError: state.setError,
  }, options);
}
```
Insert these tests before `it('surfaces a skipped oversized lone splat as a lazy source and opens the picker'`:
```ts
  describe('a dataset that settles its splat list and saved settings', () => {
    const baseUrl = 'https://huggingface.co/datasets/owner/wait/resolve/main/';
    const view: CameraViewState = { position: [1, 2, 3], target: [0, 0, 0], quaternion: [0, 0, 0, 1], distance: 4 };

    /** Starts a load whose saved settings answer only when `respond` is called. */
    function startLoadWithPendingSettings() {
      vi.stubGlobal('Blob', NodeBlob);
      let respond!: (response: Response) => void;
      vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).endsWith('colmapview.yaml')) return new Promise<Response>(resolve => { respond = resolve; });
        if (init?.method === 'HEAD') return new Response(null, { headers: { 'content-length': '100' } });
        if (String(url).includes('/api/datasets/')) return Response.json(hubEntries([{ path: 'splats/scene.spz', size: 100 }]));
        return new Response(new Uint8Array([1, 2, 3]));
      }));
      processFilesMock.mockImplementationOnce(async (files, _range, options) => { await processWithStore(files, options); });
      const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
      let pending!: Promise<boolean>;
      act(() => { pending = result.current.loadFromUrl(baseUrl); });
      return { pending, respond: (response: Response) => respond(response) };
    }

    it('keeps the overlay, its Cancel and the parsed scene back until they settle', async () => {
      const load = startLoadWithPendingSettings();
      // Parsed: what follows is the wait for the saved settings.
      await waitFor(() => expect(useReconstructionStore.getState().urlProgress?.percent).toBeGreaterThanOrEqual(90));
      // A drop or another load sees a load running, n waits for it, and nothing of the scene shows yet.
      expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true, urlLoadActive: true, reconstruction: null });
      expect(isReconstructionLoadPending()).toBe(true);

      const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: view,
        config: { splat: { activeSourceId: '' }, camera: { selectedImageId: 7 } } });
      await act(async () => {
        load.respond(new Response(yaml));
        expect(await load.pending).toBe(true);
      });
      const state = useReconstructionStore.getState();
      expect(state.reconstruction).not.toBeNull();
      expect(state.loadedFiles?.splatFileSources).toHaveLength(1);
      expect(state.urlLoading).toBe(false);
      expect(useCameraStore.getState().flyToViewState).toEqual(view);
      expect(useCameraStore.getState().selectedImageId).toBe(7);
    });

    it('leaves no half-loaded scene when cancelled while it settles', async () => {
      const load = startLoadWithPendingSettings();
      await waitFor(() => expect(useReconstructionStore.getState().urlProgress?.percent).toBeGreaterThanOrEqual(90));
      act(() => useReconstructionStore.getState().cancelLoading());
      await act(async () => { expect(await load.pending).toBe(false); });
      expect(useReconstructionStore.getState()).toMatchObject({ reconstruction: null, loadedFiles: null, urlLoading: false });
    });
  });

  it('settles the settings beside an archive before handing its bundled splat to the renderer', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const alignment = { ...createIdentityEuler(), translationX: 5 };
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null, config: { transform: alignment } });
    let respond: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn((url: string | URL) => String(url).endsWith('colmapview.yaml')
      ? new Promise<Response>(resolve => { respond = resolve; }) : Promise.resolve(new Response(null, { status: 404 }))));
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin', 'scene.spz'].map(name => [name, new File(['x'], name)]));
    // Like loadZipUrlSource, pass processing the hook the loader gave it.
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) =>
      (await deps.processFiles(files, undefined, { throwOnError: true, beforeSceneCommit: deps.beforeSceneCommit })) !== false);
    processFilesMock.mockImplementationOnce(async (incoming, _range, options) => { await processWithStore(incoming, options); });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl('https://example.com/project/scene.zip'); });
    await waitFor(() => expect(respond).toBeDefined());
    // Nothing decodes yet: a Cancel now stops the whole load instead of stranding its settings.
    expect(useReconstructionStore.getState()).toMatchObject({ reconstruction: null, urlLoading: true,
      urlProgress: expect.objectContaining({ message: 'Loading saved view settings...' }) });

    await act(async () => { respond!(new Response(yaml)); expect(await pending).toBe(true); });
    expect(useTransformStore.getState().transform.translationX).toBe(5);
    expect(useReconstructionStore.getState().urlProgress?.message).toBe('Preparing splat renderer...');
    // Cancelling the decode now only chooses None: the load and its restore are done.
    act(() => useReconstructionStore.getState().cancelLoading());
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useTransformStore.getState().transform.translationX).toBe(5);
    const { droppedFiles, getBoundSourceViewerState } = useReconstructionStore.getState();
    expect(getBoundSourceViewerState(droppedFiles!)?.config.transform).toEqual(alignment);
  });
```
RED at HEAD: all three fail because `reconstruction` is already committed (`… to match object { urlLoading: true, … }` / `{ reconstruction: null, … }`). The last test is also the G3 cross-check (see Cross-area notes).

### Risks and interactions

- **R1 / G3.** Once beside-settings settle before the commit, a bundled splat starts decoding only after the URL load has applied and recorded its settings. G3's scenario, a decode Cancel while beside-settings are pending, can no longer arise; the archive test above pins this. Land G6 before R1's G3 task, and re-scope that task to the regression test. A post-commit await must not come back.
- **R4 / G9** may start the beside-settings request earlier, alongside the download. Make that change inside `settingsBesideOnce`: start the request early, and settle it in `beforeSceneCommit`, so the deadline still starts after parsing.
- **A URL hash camera.** `useTrackballUrlCameraRestore` applies the hash camera when the first reconstruction appears.
  - For startup links, that camera is the same view the restore flies to.
  - For a session's first dataset loaded with a stale hash camera, the fly-to's animation target still ends on the restored view.
  - This is an edge case, with the same final pose.
- **Cancel during the settle** now leaves the previous state (usually the landing page), not a committed scene without its settings. `cancelLoading` is unchanged. It strips the URL request when no reconstruction exists (`reconstructionStore.ts:652`).
- **Test doubles that never call `beforeSceneCommit`** fall back to the post-`processFiles` settle. That is why most existing `useUrlLoader` tests pass unchanged.
- **Keep `useFileDropzone.test.ts:53` as it is** ("cancels pending URL settings when local files are dropped"). It builds an active URL load with `urlLoading` false by hand. During a URL load that state now lasts only microtasks, so no drop event can land in it, but the test still pins a sound fallback: a local drop wins over a URL load that holds no indicator.
- **Deliberate decisions:**
  - The early and late restore order is unchanged.
  - The picker is still offered only after restoration.
  - The deadline starts after parsing.
  - `n` is ignored while `processFiles` is pending.
  - `anySignal` is used, never `AbortSignal.any`.

### Effort
**max / max.** The fix changes async ordering across the workflow and three loaders, along with deadline and cancel semantics.

---

## G7 — `requestedSplatSourceId` survives across datasets

### Verified

Every place it is **set** at HEAD:

| Site | Value | Purpose |
|---|---|---|
| `reconstructionStore.ts:77`, `showColmapOnly` | `null` | None |
| `reconstructionStore.ts:385`, `setLoadedFiles` | `null` after resolving | consumed by a commit |
| `reconstructionStore.ts:416-432`, `setRequestedSplatSourceId` | id, or `null` for `''` | resolved now, or kept pending |
| `reconstructionStore.ts:478`, `:556`, `:577`, `selectSplatSource` (downloaded, byte-less, fetched) | `source.id` | **left set after every activation** |
| `reconstructionStore.ts:692`, `clear` | `null` | |
| `useUrlState.ts:167`, `applySavedViewerState` | restored id (`'' → null`) | **re-armed after every restore, including the automatic pick** |
| `useUrlState.ts:188`, `applyShareConfig` | share link id | a startup link's choice made before any scene (`App.tsx:84`) |

It is **read** in one place only, `setLoadedFiles` (`reconstructionStore.ts:351-354`), which re-picks by id, path or bare file name through `getLoadedFilesWithActiveSplatSource`.

Picking a splat on dataset A leaves its id set. Dataset B's commit then re-picks the same-named splat and overrides B's default. That contradicts `fileDropzoneWorkflow.ts:358` ("any other load shows the files' default").

**Reproduced** with RED tests through the real drop path and the URL loader:
- `useFileDropzone.test.ts` › "shows the next dropped dataset's own default after a splat was picked on the previous one". At HEAD, B shows its `scene.spz`, not its default `big.spz`.
- "starts a dropped load with no splat request left by the previous dataset" is RED with `'scene.spz'`.
- `useUrlLoader.test.ts` › "starts a URL load with no splat request left by an earlier dataset" is RED with `'scene.spz'`.

### Root cause

The request has no owner. It means "show this splat at the next commit", but activations and the restore leave it set after they have applied it. The next commit can belong to another dataset.

### Fix (code)

Every dataset load starts with only its own request:
- **Local loads.** The drop, browse and ZIP entry points all go through `beginLocalLoad`. They start with none.
- **URL loads.** `runLoad` starts with the viewer URL's choice (see G11), or none.
- **The restore** stops re-arming the request; it has already applied the choice itself.

Activations still record the active id. That keeps two existing behaviors:
- **Task 16 / 43cf83a, unchanged.** A pick made during a load still names an incoming splat by path or file name at its commit. A pick made during a load happens after that load's reset.
- **Reload.** Its re-commit re-picks the same splat. Reload is not a new dataset and passes through no reset.

Every scene replacement goes through `beginLocalLoad` or `runLoad`. A request can therefore no longer reach another dataset's commit.

`src/hooks/useFileDropzone.ts` (`beginLocalLoad`):
```diff
 function beginLocalLoad() {
   // A settings timeout warning describes the previous load.
   dismissOptionalSettingsTimeoutWarning();
+  // A splat chosen for the previous dataset must not pick one of these files' splats at their commit.
+  useReconstructionStore.getState().setRequestedSplatSourceId(null);
   const initialSplatSelectionRevision = useReconstructionStore.getState().splatSelectionRevision;
```
`src/hooks/useUrlLoader.ts`: a new module function, called in `runLoad` right after the share overrides are decoded. G11 relies on the same call.
```diff
+/**
+ * A load starts with only its own splat request: the viewer URL's choice, None included, which its
+ * commit applies. One left by the previous dataset would otherwise pick a same-named splat here. With
+ * a scene open the request would apply to that scene, so the restore applies the URL's choice instead.
+ */
+function requestSplatForLoad(shared: SharedViewerOverrides | null): void {
+  const store = useReconstructionStore.getState();
+  store.setRequestedSplatSourceId(store.loadedFiles ? null : shared?.config?.splat?.activeSourceId ?? null);
+}
@@ runLoad
       const shared = await decodeSharedViewerOverrides(initialHash);
       assertCurrent();
+      requestSplatForLoad(shared);
       const loaded = await work(load);
```
Also add `type SharedViewerOverrides` to the existing `./useUrlState` import.

`src/hooks/useUrlState.ts` (`applySavedViewerState`, last block):
```diff
-  if (sourceId !== undefined && canRestoreSplatSelection()) {
-    useReconstructionStore.getState().setRequestedSplatSourceId(sourceId || null);
-    if (sourceId === '' || useReconstructionStore.getState().loadedFiles?.splatFile) {
-      useReconstructionStore.getState().setShowSplatPicker(false);
-    }
+  if (sourceId !== undefined && canRestoreSplatSelection()
+    && (sourceId === '' || useReconstructionStore.getState().loadedFiles?.splatFile)) {
+    useReconstructionStore.getState().setShowSplatPicker(false);
   }
```
- **Why line 167 can go.** `activateSavedSplat` has already activated every downloaded saved source, so the re-resolution never shows anything new. What it leaves behind is a pending id for a skipped lazy tile (touch budget) or a missing one. Nothing in that dataset consumes that id; only the next dataset's commit would.
- **Reload remains correct.** `carryOverSplatState` keeps the on-screen splat.

`src/store/reconstructionStore.ts`: document the field. The `setRequestedSplatSourceId` doc and body changes are listed under G11.
```diff
+  /**
+   * The splat the next commit shows, by id, path or file name ('' for None). Every dataset load starts
+   * with only its own, so a choice never reaches another dataset's commit.
+   */
   requestedSplatSourceId: string | null;
```

**After the fix**, the request is set by:
- `beginLocalLoad`, to `null`;
- `runLoad`, to the URL's choice or `null`;
- `applyShareConfig`, at startup with no scene;
- activations, which set the active id and are reset by the next load;
- `showColmapOnly` and `clear`, to `null`.

It is still read only by `setLoadedFiles`. The restore no longer sets it.

### Tests (code)

**`src/hooks/useFileDropzone.test.ts`**: insert before `it('does not preload the spark runtime when webgpu is the resolved splat backend'`.
```ts
  it('starts a dropped load with no splat request left by the previous dataset', async () => {
    const shown = buildFile('scene.spz');
    useReconstructionStore.getState().setLoadedFiles({ ...buildLoadedFiles(), splatFile: shown, splatFiles: [shown],
      splatFileSources: [{ id: 'scene.spz', path: 'scene.spz', file: shown }] });
    await act(async () => { await useReconstructionStore.getState().selectSplatSource('scene.spz'); });
    let requestedWhenProcessing: string | null | undefined;
    processFileDropzoneFilesMock.mockImplementationOnce(async () => {
      requestedWhenProcessing = useReconstructionStore.getState().requestedSplatSourceId;
      return true;
    });
    const { result } = renderHook(() => useFileDropzone());
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: {
      types: ['Files'], items: [], files: [buildFile('cameras.bin')],
    } } as unknown as DragEvent<HTMLElement>;
    await act(async () => { await result.current.handleDrop(event); });
    expect(processFileDropzoneFilesMock).toHaveBeenCalledOnce();
    expect(requestedWhenProcessing).toBeNull();
  });

  it("shows the next dropped dataset's own default after a splat was picked on the previous one", async () => {
    // The real workflow over the store this hook wires up, with parsing stubbed.
    const realProcessing: typeof processFileDropzoneFiles = (files, deps, options) => actualWorkflow.processFileDropzoneFiles(files, {
      ...deps, logger: noopLogger, clearCaches: vi.fn(), delay: async () => {}, shouldPreloadSplatRuntime: () => false,
      parseFiles: async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false }),
      buildReconstruction: async () => ({ reconstruction: buildReconstruction(), pointCount: 0 }),
    }, options);
    processFileDropzoneFilesMock.mockImplementationOnce(realProcessing).mockImplementationOnce(realProcessing);
    const drop = (files: File[]) => ({ preventDefault: vi.fn(), stopPropagation: vi.fn(),
      dataTransfer: { types: ['Files'], items: [], files } }) as unknown as DragEvent<HTMLElement>;
    const colmap = () => ['cameras.bin', 'images.bin', 'points3D.bin'].map(name => buildFile(name));
    const { result } = renderHook(() => useFileDropzone());

    const firstScene = buildFile('scene.spz', 'first scene');
    await act(async () => { await result.current.handleDrop(drop([...colmap(), buildFile('other.spz', 'first default, larger'), firstScene])); });
    await act(async () => { await useReconstructionStore.getState().selectSplatSource('scene.spz'); });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(firstScene);

    const nextDefault = buildFile('big.spz', 'next default, larger again');
    await act(async () => { await result.current.handleDrop(drop([...colmap(), nextDefault, buildFile('scene.spz', 'next scene')])); });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(nextDefault);
  });
```
The default is the largest `.spz`.
- The pick clears the first drop's handed-off loading state (`selectSplatSource`'s downloaded branch), so the second drop is not ignored.
- `mockImplementationOnce` twice keeps the real workflow out of the file's other tests, because `mockClear` keeps implementations.

**`src/hooks/useUrlLoader.test.ts`**: insert before `it('surfaces a skipped oversized lone splat …'`.
```ts
  it('starts a URL load with no splat request left by an earlier dataset', async () => {
    // A startup link's choice whose load failed: nothing else is on screen.
    useReconstructionStore.getState().setRequestedSplatSourceId('scene.spz');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    let requested: string | null | undefined;
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) => {
      requested = useReconstructionStore.getState().requestedSplatSourceId;
      return (await deps.processFiles(new Map(), undefined, { throwOnError: true })) !== false;
    });
    processFilesMock.mockResolvedValueOnce();
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    await act(async () => { await result.current.loadFromUrl('https://example.com/scene.tar'); });
    expect(requested).toBeNull();
  });
```
**Existing assertion to update**, `useUrlLoader.test.ts` › "restores the saved remote splat with large-touch loading". It pins the re-armed request.
```diff
     if (mode === 'large-touch') {
-      expect(useReconstructionStore.getState().requestedSplatSourceId).toBe(expected);
+      // The picker offers the skipped splat; nothing stays requested for a later dataset to pick up.
+      expect(useReconstructionStore.getState().requestedSplatSourceId).toBeNull();
       expect(useReconstructionStore.getState().showSplatPicker).toBe(true);
```

### Risks and interactions

- **A pick made during DropZone's outer preparation** (`prepareUrlLoad`) is recorded, then reset by `runLoad`. Such a pick needs a scene behind the landing panel, so it cannot happen in the UI.
  - None is unaffected: it does not use the request.
  - If the case ever becomes reachable, the hardening is two lines. In the workflow's in-load block, resolve the pick with `splatFileSources.find(s => s.id === id) ?? findSplatSourceById({ splatFileSources }, id)` instead of relying on the store's re-pick.
- **A hand-crafted `#d=` link with config but no dataset** (startup plan `none`) still records a non-empty request through `App.tsx:84`. It is now dropped at the next load start, so it no longer leaks.
- **R1 / E6** (a startup link's transform carries into the next dataset after Cancel) is the transform analogue. If R1 resets startup state at load start, do it next to `requestSplatForLoad(shared)` in `runLoad` and in `beginLocalLoad`.

### Effort
**high / high.** A multi-file state lifecycle that must keep Task 16's in-load re-pick intact.

---

## G11 — An explicit None in a startup share link is applied before any scene exists

### Verified

- `App.tsx:81-85` runs `applyShareConfig(loadPlan.config)` before the load.
- `useUrlState.ts:185-187` then calls `selectSplatSource('', { restore: true })`, which returns immediately with no scene (`reconstructionStore.ts:451-453`) and records nothing.
- `setRequestedSplatSourceId('')` would map `''` to `null` anyway (`:417-419`).
- `runLoad` decodes the share overrides before any transfer (`useUrlLoader.ts:161`), but uses them only after the load (`:171`).
- So an archive with a bundled default splat commits it, and `handOffCommittedSplat` hands it to the renderer. Only then does the restore choose None, after the GPU and memory spike None exists to avoid.

**Reproduced:** `useUrlLoader.test.ts` › "commits a startup link's None without handing the archive's default splat to the renderer". It is RED at HEAD: `expected [ undefined, undefined, …(18) ] to not include 'default.spz'`. The store unit test is RED too: `expected null to be ''`.

### Root cause

A non-empty startup choice waits in `requestedSplatSourceId` for the first commit. None has no representation there.

### Fix (code)

Record a requested None as `''`, the way ids are recorded, and commit it as None. The load that owns the choice records it: `runLoad`, through `requestSplatForLoad(shared)` from G7, when no scene is open.

`src/store/reconstructionStore.ts`:
```diff
+  /** Applies to the scene on screen when it can; with no scene yet, it waits for the first commit ('' for None). */
   setRequestedSplatSourceId: (sourceId: string | null) => void;
@@ setLoadedFiles
     const requestedSplatSourceId = get().requestedSplatSourceId;
-    const resolvedLoadedFiles = requestedSplatSourceId
-      ? getLoadedFilesWithActiveSplatSource(loadedFiles, requestedSplatSourceId)
-      : loadedFiles;
+    // '' is a None requested before this scene existed: its default splat is never handed over.
+    const resolvedLoadedFiles = requestedSplatSourceId === '' ? clearActiveSplatFile(loadedFiles)
+      : requestedSplatSourceId ? getLoadedFilesWithActiveSplatSource(loadedFiles, requestedSplatSourceId)
+        : loadedFiles;
@@
     set({
       loadedFiles: resolvedLoadedFiles,
-      requestedSplatSourceId: requestedSplatSourceId ? null : get().requestedSplatSourceId,
+      requestedSplatSourceId: requestedSplatSourceId === null ? get().requestedSplatSourceId : null,
     });
@@ setRequestedSplatSourceId
   setRequestedSplatSourceId: (requestedSplatSourceId) => {
-    if (!requestedSplatSourceId) {
-      set({ requestedSplatSourceId: null });
-      return;
-    }
-
     const loadedFiles = get().loadedFiles;
+    // Before any scene exists, the choice waits for the first commit; '' asks it for None.
     if (!loadedFiles) {
       set({ requestedSplatSourceId });
       return;
     }
 
+    if (!requestedSplatSourceId) {
+      set({ requestedSplatSourceId: null });
+      return;
+    }
+
     set({ requestedSplatSourceId });
```
**Why recording happens in `runLoad`, not in `applyShareConfig`.** Recording None in `applyShareConfig` would also record it for a startup plan with no load (`kind: 'none'`). The user's first dropped dataset would then commit without its splat. `runLoad` records the choice only for the load it belongs to.

**Interactions:**
- **The bundled default.** The commit shows None. The default's source stays listed with its bytes, because archive sources have no `url` and so `clearActiveSplatFile` keeps them. `handOffCommittedSplat` reads the committed None, so nothing is handed to the renderer and `processFiles` ends its loading state. The restore then applies None again, which is a no-op (`showColmapOnly`). `offerSplatPicker` is not called, because the resolved choice is `''`.
- **Task 16 (8c27a8b, 43cf83a).** At startup there is no scene, so there is no in-load pick and no revision bump; the request goes straight to the commit. For a URL load over an open scene, `requestSplatForLoad` records `null`, and the in-load rules apply unchanged. A requested None never sets `ignoredSplatSelectionRevision`. The re-base only concerns picks made against the replaced scene.
- **A splat-URL startup link with None** commits an empty splat-only scene. That is HEAD's end state too, because the restore applies None; the difference is that no decode happens first.

### Tests (code)

**`src/store/reconstructionStore.test.ts`**: insert before `it('applies splat point defaults when a splat is added to an already loaded dataset'`.
```ts
  it('commits a None requested before its scene existed, without handing over the default splat', () => {
    const defaultSplat = new File(['default'], 'default.spz');
    useReconstructionStore.getState().setRequestedSplatSourceId('');
    expect(useReconstructionStore.getState().requestedSplatSourceId).toBe('');

    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({ splatFile: defaultSplat, splatFiles: [defaultSplat],
      splatFileSources: [{ id: 'default.spz', path: 'default.spz', file: defaultSplat }] }));

    const state = useReconstructionStore.getState();
    expect(state.loadedFiles?.splatFile).toBeUndefined();
    expect(state.loadedFiles?.splatFileSources?.[0].file).toBe(defaultSplat);
    expect(state.requestedSplatSourceId).toBeNull();
  });
```
**`src/hooks/useUrlLoader.test.ts`** (uses `processWithStore` from G6):
```ts
  it("commits a startup link's None without handing the archive's default splat to the renderer", async () => {
    window.history.replaceState(null, '', '/#' + encodeShareData('https://example.com/scene.tar', null,
      { splat: { activeSourceId: '' } }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin', 'default.spz']
      .map(name => [name, new File(['incoming'], name)]));
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) =>
      (await deps.processFiles(files, undefined, { throwOnError: true })) !== false);
    processFilesMock.mockImplementationOnce(async (incoming, _range, options) => { await processWithStore(incoming, options); });
    const shown: Array<string | undefined> = [];
    const progress: Array<string | undefined> = [];
    const unsubscribe = useReconstructionStore.subscribe(state => {
      shown.push(state.loadedFiles?.splatFile?.name);
      progress.push(state.urlProgress?.message);
    });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger, applyUrlOverrides: true }));
    try {
      await act(async () => { expect(await result.current.loadFromUrl('https://example.com/scene.tar')).toBe(true); });
    } finally { unsubscribe(); }
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(1);
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(shown).not.toContain('default.spz');
    expect(progress).not.toContain('Preparing splat renderer...');
    expect(useReconstructionStore.getState().requestedSplatSourceId).toBeNull();
  });
```

### Effort
**high / high.** Implement it together with G7: it is the same request lifecycle and the same `runLoad` call.

---

## G12 — A tile download started during the restore runs invisibly

### Verified

- **`n` works during the restore.** It is ignored only while `processFiles` is pending (`useViewerControlsController.ts:164-174`). A point-cloud panel pick works too.
- **What the pick does.** It cancels the restored download and starts tile X: `selectSplatSource`'s lazy branch sets `activeSplatController`, `urlLoading` and X's download progress (`reconstructionStore.ts:495-499`).
- **Why the indicator drops.** `runLoad`'s `finally` keeps the indicator only when `isSplatLoadingProgressForFile(urlProgress, loadedFiles.splatFile)` holds (`useUrlLoader.ts:196-200`). Nothing is active yet, so that check is false, and `setUrlLoading(false)` hides the overlay and its Cancel while X downloads.

**Reproduced:** "keeps the overlay and its Cancel for a tile picked while the restored splat downloads" is RED at HEAD with `urlLoading: false`.

### Root cause

The `finally` knows about the renderer's decode, but not about a pending tile download. Only the store knows about the download, through the module-private `activeSplatController`.

### Fix (code)

`src/store/reconstructionStore.ts`, next to `rendererOwnsSplatProgress`:
```diff
+/** A lazy tile download is in flight: the loading indicator and its Cancel are its own. */
+export function isSplatDownloadPending(): boolean {
+  return activeSplatController !== null;
+}
```
`src/hooks/useUrlLoader.ts`. Add `import { isSplatDownloadPending } from '../store/reconstructionStore';` and change `runLoad`'s `finally`:
```diff
       if (isCurrent()) {
         finishUrlLoad(signal);
         const state = useReconstructionStore.getState();
-        if (!isSplatLoadingProgressForFile(state.urlProgress, state.loadedFiles?.splatFile)) {
+        // A tile download started during the restore, or the renderer's decode, keeps the overlay and its Cancel.
+        if (!isSplatDownloadPending() && !isSplatLoadingProgressForFile(state.urlProgress, state.loadedFiles?.splatFile)) {
           setUrlLoading(false);
         }
       }
```
**How the indicator ends afterwards:**
- The download clears it on failure, and so does `cancelLoading`.
- On success, the activated file's renderer takes it over: `startSplatLoadingNotification`, then `finishSplatLoading`. The byte-less path clears it itself.

The restore's own download is awaited by `runLoad`, so it never reaches this `finally` while pending.

### Tests (code)

**`src/hooks/useUrlLoader.test.ts`**:
```ts
  it('keeps the overlay and its Cancel for a tile picked while the restored splat downloads', async () => {
    vi.stubGlobal('Blob', NodeBlob);
    const baseUrl = 'https://huggingface.co/datasets/owner/pick/resolve/main/';
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'splats/a.spz' } } });
    const downloads = new Map<string, AbortSignal>();
    vi.stubGlobal('fetch', vi.fn((url: string | URL, init?: RequestInit): Promise<Response> => {
      if (String(url).endsWith('colmapview.yaml')) return Promise.resolve(new Response(yaml));
      if (init?.method === 'HEAD') return Promise.resolve(new Response(null, { headers: { 'content-length': '100' } }));
      // Like fetch, a splat download rejects once its signal aborts.
      if (String(url).endsWith('.spz')) return new Promise<Response>((_resolve, reject) => {
        downloads.set(String(url).slice(baseUrl.length), init!.signal!);
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      });
      if (String(url).includes('/api/datasets/')) return Promise.resolve(Response.json(hubEntries([
        { path: 'splats/a.spz', size: 100 }, { path: 'splats/b.spz', size: 100 }])));
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
    }));
    processFilesMock.mockImplementationOnce(async () => { useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles()); });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl(baseUrl); });
    await waitFor(() => expect(downloads.has('splats/a.spz')).toBe(true));
    // What n does during the restore: pick the next tile, which cancels the restored download.
    act(() => { void useReconstructionStore.getState().selectSplatSource('splats/b.spz'); });
    await act(async () => { expect(await pending).toBe(true); });

    expect(downloads.get('splats/a.spz')?.aborted).toBe(true);
    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true,
      urlProgress: expect.objectContaining({ currentFile: 'b.spz' }) });
    act(() => useReconstructionStore.getState().cancelLoading());
    expect(downloads.get('splats/b.spz')?.aborted).toBe(true);
    expect(useReconstructionStore.getState().urlLoading).toBe(false);
  });
```

### Effort
**medium / medium.** A contained predicate and one store export.

---

## G13 — Closing the splat picker means choosing None

### Verified

- `SplatPickerModal.tsx:65`: `handleClose = () => handleSelect('')`, which is None. Every close path reaches it:
  - the X button (`:86`, titled "Skip (COLMAP only)" at `:88`);
  - the None row (`:97`);
  - Escape and the backdrop, through `ModalDialogShell`.
- **The picker stays open when `n` activates a tile.** `n` is a viewer hotkey, and the keyboard is not blocked.
- **Escape reaches every open dialog.** `ModalDialogShell` adds one document `keydown` listener per open dialog (`ModalDialogShell.tsx:86`).
  - Help opens with `i` (global scope, `hotkeys.ts:33-37`).
  - Escape meant for Help therefore also runs the picker's `handleClose`, which unloads the tile the user just activated and drops its downloaded bytes.
- In v0.15.4, closing the picker only hid it.

**Reproduced:**
- `SplatPickerModal.test.tsx` › "keeps a splat activated while it was open on Close / Escape / backdrop" is RED at HEAD. The Close case fails with `Unable to find … name "Close"`, the others with `expected undefined to be File`.
- `ModalDialogShell.test.tsx` › "lets only the most recently opened of stacked dialogs answer Escape" is RED: the lower dialog's `onClose` is called.

### Root cause

Two causes:
- Load-path design item 7 made closing mean "COLMAP only" without considering a splat chosen elsewhere while the picker is open.
- Every open shell answers every key.

### Fix (code) — the brief's recommended rule

- **Closing chooses None only while nothing shows.** When a splat shows, closing just hides the picker.
- **The None row stays an explicit None.**
- **A download started with `n` while the picker is open still shows nothing.** Closing then means None and cancels that download. That is the pinned behavior of the existing "%s cancels a pending HF PLY without replacing COLMAP data" test, which still passes.
- **Escape and the Tab trap go to the newest open dialog only.** One document listener dispatches to the top of a stack. Each shell keeps its place while its handlers change.

**Why one listener.** With one listener per dialog plus a "topmost" check, a browser can flush React's re-render and effect cleanup between two listeners of the same event: a discrete update flushes in a microtask, and the microtask checkpoint runs after each listener. The dialog underneath would then see itself on top and close on the same Escape. A single listener makes it structural: one key, one dialog.

`src/components/modals/useSplatPickerStoreFacade.ts`:
```diff
 export interface SplatPickerStoreFacade {
   showSplatPicker: boolean;
   splatFileSources: readonly SplatFileSource[];
+  /** A splat is on screen, for example one activated with `n` while the picker was open. */
+  splatShowing: boolean;
@@
   const splatFileSources = useReconstructionStore(
     (state) => state.loadedFiles?.splatFileSources ?? EMPTY_SPLAT_SOURCES
   );
+  const splatShowing = useReconstructionStore((state) => Boolean(state.loadedFiles?.splatFile));
@@
     showSplatPicker,
     splatFileSources,
+    splatShowing,
```
`src/components/modals/SplatPickerModal.tsx`:
```diff
- * (focus trap, Escape, backdrop). Closing the window keeps the COLMAP scene.
+ * (focus trap, Escape, backdrop). Closing the window chooses COLMAP only while no splat
+ * shows; a splat activated meanwhile (with `n`) stays and the window just closes.
@@
     showSplatPicker,
     splatFileSources,
+    splatShowing,
@@
-  const handleClose = () => handleSelect('');
+  const handleClose = () => (splatShowing ? setShowSplatPicker(false) : handleSelect(''));
@@
-          title="Skip (COLMAP only)"
+          title={splatShowing ? 'Close' : 'Skip (COLMAP only)'}
@@
-        <button onClick={handleClose} className={SPLAT_PICKER_NONE_ROW_CLASS}>
+        <button onClick={() => handleSelect('')} className={SPLAT_PICKER_NONE_ROW_CLASS}>
```
`src/components/ui/modalDialogShellPolicy.ts`:
```diff
+type ModalDialogKeyHandler = (event: KeyboardEvent) => void;
+
+// Open modal dialogs, oldest first. One listener hands each key to the newest, so a key that closes
+// it never reaches the dialog underneath, however soon React removes the closed one.
+const openModalDialogs: ModalDialogKeyHandler[] = [];
+
+function handleModalDialogKeyDown(event: KeyboardEvent): void {
+  openModalDialogs[openModalDialogs.length - 1]?.(event);
+}
+
+/** Opens a dialog above the others: only it answers keys until it closes. Returns the close. */
+export function openModalDialog(handleKeyDown: ModalDialogKeyHandler): () => void {
+  if (openModalDialogs.length === 0) document.addEventListener('keydown', handleModalDialogKeyDown);
+  openModalDialogs.push(handleKeyDown);
+  return () => {
+    const index = openModalDialogs.indexOf(handleKeyDown);
+    if (index >= 0) openModalDialogs.splice(index, 1);
+    if (openModalDialogs.length === 0) document.removeEventListener('keydown', handleModalDialogKeyDown);
+  };
+}
```
`src/components/ui/ModalDialogShell.tsx`: the key handler body (Escape, then the Tab trap) is unchanged. Only its registration moves. Change the import to `import { getModalDialogFocusableElements, openModalDialog } from './modalDialogShellPolicy';`, then replace the keydown `useEffect` with:
```tsx
  const dialogRef = useRef<HTMLDivElement>(null);
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);

  useFloatingDialogFocus(isOpen, dialogRef, initialFocusRef);

  useEffect(() => {
    keyHandlerRef.current = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (closeOnEscape) {
          event.preventDefault();
          onClose();
        }
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getModalDialogFocusableElements(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
  }, [closeOnEscape, onClose]);

  // Opened on top of any open dialog, it keeps that place while its handlers change.
  useEffect(() => (isOpen ? openModalDialog(event => keyHandlerRef.current(event)) : undefined), [isOpen]);
```
- **Effect order.** The handler-ref effect is declared before the open effect, so a freshly opened dialog registers its current handler.
- **Lint.** `eslint` (react-hooks v7) is clean.

### Tests (code)

**`src/components/modals/SplatPickerModal.test.tsx`**: a new `describe` before `describe('SplatPickerModal device-memory hint'`.
```tsx
describe('SplatPickerModal closing over an activated splat', () => {
  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    mockUseIsTouchDevice.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    useReconstructionStore.getState().clear();
  });

  function openPickerOverTwoTiles() {
    const a = new File(['a'], 'a.spz');
    useReconstructionStore.setState({
      showSplatPicker: true,
      loadedFiles: { imageFiles: new Map(), hasMasks: false, splatFiles: [a], splatFileSources: [
        { id: 'a.spz', path: 'a.spz', url: 'https://example.com/a.spz', file: a },
        { id: 'b.spz', path: 'b.spz', url: 'https://example.com/b.spz', size: 100 }] },
    });
    render(<SplatPickerModal />);
    return a;
  }

  it.each(['Close', 'Escape', 'backdrop'] as const)('keeps a splat activated while it was open on %s', async close => {
    const a = openPickerOverTwoTiles();
    // What n does with the picker open: show the next tile.
    await act(async () => { await useReconstructionStore.getState().selectSplatSource('a.spz'); });

    if (close === 'Close') fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    else if (close === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
    else fireEvent.click(screen.getByRole('dialog'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const state = useReconstructionStore.getState();
    expect(state.loadedFiles?.splatFile).toBe(a);
    expect(state.loadedFiles?.splatFileSources?.[0].file).toBe(a);
  });

  it('still chooses None from its None row while a splat shows', async () => {
    openPickerOverTwoTiles();
    await act(async () => { await useReconstructionStore.getState().selectSplatSource('a.spz'); });
    fireEvent.click(screen.getByRole('button', { name: 'None - COLMAP only' }));
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
  });
});
```
The None-row test is a guard and passes at HEAD. During this research it caught a first draft that left the None row on `handleClose`.

**`src/components/ui/ModalDialogShell.test.tsx`**: insert before `it('uses the full focusable selector for dialog descendants'`.
```tsx
  it('lets only the most recently opened of stacked dialogs answer Escape', () => {
    const closeLower = vi.fn();
    const closeUpper = vi.fn();
    function Stack({ upperOpen, lowerTitle }: { upperOpen: boolean; lowerTitle: string }) {
      return (
        <>
          <ModalDialogShell isOpen onClose={() => closeLower()} ariaLabelledBy="lower-title"
            overlayClassName="fixed inset-0" panelClassName="panel">
            <h2 id="lower-title">{lowerTitle}</h2>
          </ModalDialogShell>
          <ModalDialogShell isOpen={upperOpen} onClose={closeUpper} ariaLabelledBy="upper-title"
            overlayClassName="fixed inset-0" panelClassName="panel">
            <h2 id="upper-title">Upper</h2>
          </ModalDialogShell>
        </>
      );
    }

    const { rerender } = render(<Stack upperOpen={false} lowerTitle="Lower" />);
    rerender(<Stack upperOpen lowerTitle="Lower" />);
    // The dialog underneath re-renders, with a new close handler, after the upper one opened.
    rerender(<Stack upperOpen lowerTitle="Lower again" />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeUpper).toHaveBeenCalledOnce();
    expect(closeLower).not.toHaveBeenCalled();

    rerender(<Stack upperOpen={false} lowerTitle="Lower again" />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeLower).toHaveBeenCalledOnce();
    expect(closeUpper).toHaveBeenCalledOnce();
  });
```

### Risks and interactions

- **`ConfirmationHost`** keeps its own document listener (`ConfirmationHost.tsx:107`), so a confirmation opened over a `ModalDialogShell` still lets both answer Escape. That is pre-existing, and no flow opens a confirmation over the picker. To close it later, have `ConfirmationHost` register through `openModalDialog`.
- **The shared shell.** All six `ModalDialogShell` users get the stack: the URL dialog, the Drive and HF publish modals, Help, the picker, and `DatasetAccountButtons`. For a single open dialog, behavior is unchanged, and the full suite passes.

### Effort
**medium / high.** The component change is small, but the shared dialog shell's event dispatch deserves a careful review.

---

## E13 — The manifest and splat loaders end with an unconditional `commitSource()`

### Verified

- **The calls.** `urlLoaderManifestSource.ts:137` and `urlLoaderSplatSource.ts:112` install the URL's source info after any successful processing. Task 11 (e49dcad) removed the same call from `loadZipUrlSource`: "Only a scene this archive replaced installs it and its source."
- **Latent in production.** Manifest files always take the COLMAP commit, and splat URLs pass `replaceSplatScene: true`. Both report the replacement through `onSceneReplaced` first, so the trailing call is a no-op.
- **What it hides.** It masks test doubles that never report a replacement, and it would install a URL's source over an open scene if processing ever merged.

**Reproduced:** "leaves source metadata alone when processing keeps the open scene" (manifest and splat) is RED at HEAD: `setSourceInfo` is called.

### Decision

Yes: run `commitSource` only for a replaced scene, consistent with e49dcad. That gives all three URL loaders one rule.

### Fix (code)

```diff
# src/hooks/urlLoaderManifestSource.ts
   assertCurrent();
   if (processed === false) return false;
-  commitSource();
# src/hooks/urlLoaderSplatSource.ts
+  // Only the scene this file replaced installs its source, as for archives.
   const processed = await deps.processFiles(files, { start: 80, end: 100 }, {
@@
   if (processed === false) return false;
-  commitSource();
```

### Tests (code)

Test doubles must report the replacement, as `processFiles` does:
- **`urlLoaderManifestSource.test.ts` › `makeDeps`.** `processFiles` calls `options?.onSceneReplaced?.()`. The G6 version above also awaits `beforeSceneCommit`. If E13 lands first, use `vi.fn(async (_files: Map<string, File>, _range?: unknown, options?: { onSceneReplaced?: () => void }) => { options?.onSceneReplaced?.(); })`.
- **`urlLoaderSplatSource.test.ts` › "loads a direct splat URL through the file processing workflow".**
  ```diff
  -      processFiles: vi.fn(async () => {}),
  +      // Like processFiles: report the scene this file replaced.
  +      processFiles: vi.fn(async (_files: Map<string, File>, _range?: unknown, options?: { onSceneReplaced?: () => void }) => {
  +        options?.onSceneReplaced?.();
  +      }),
  ```
- **`useUrlLoader.test.ts` › "loads a private Hugging Face %s …".** Add before `renderHook`: `processFilesMock.mockImplementationOnce(async (_files, _range, options) => { options?.onSceneReplaced?.(); });` with the comment `// Like processFiles, report the scene this load committed.`
- **`useUrlLoader.test.ts` › "ignores a cleared download that later %ss …".** Replace `processFilesMock.mockResolvedValueOnce();` with the same `mockImplementationOnce`.

New tests. Manifest: insert after the G6 tests or anywhere in the `describe`.
```ts
  it('leaves source metadata alone when processing keeps the open scene', async () => {
    // A splat merged into the open scene: processing succeeds without reporting a replacement.
    const deps = { ...makeDeps(), processFiles: vi.fn(async () => true) };
    await expect(loadManifestSource(manifest, { type: 'manifest' }, deps)).resolves.toBe(true);
    expect(deps.setSourceInfo).not.toHaveBeenCalled();
  });
```
Splat: insert before `it.each(['failure', 'cancelled'] …`.
```ts
  it('leaves source metadata alone when processing keeps the open scene', async () => {
    // Processing that succeeds without reporting a replacement left the open scene in place.
    const deps = {
      fetchSplatFile: vi.fn(async () => buildFile('scene.spz')),
      log: vi.fn(), setSourceInfo: vi.fn(), setUrlProgress: vi.fn(),
      processFiles: vi.fn(async () => true),
    };
    await expect(loadSplatUrlSource('https://example.com/scene.spz', deps)).resolves.toBe(true);
    expect(deps.setSourceInfo).not.toHaveBeenCalled();
  });
```

### Effort
**low / low.** Mechanical, plus test doubles that must now report the replacement.

---

## File ownership

| Repo file | Findings |
|---|---|
| `src/hooks/fileDropzoneWorkflow.ts` | G6 |
| `src/hooks/fileDropzonePointCloudOnly.ts` | G6 |
| `src/hooks/useFileDropzone.ts` | G6 (`processFiles` passes `beforeSceneCommit`), G7 (`beginLocalLoad`) |
| `src/hooks/urlLoaderManifestSource.ts` | G6, E13 |
| `src/hooks/urlLoaderZipSource.ts` | G6 |
| `src/hooks/urlLoaderSplatSource.ts` | G6, E13 |
| `src/hooks/useUrlLoader.ts` | G6 (`settingsBesideOnce`, `loadFromUrl` splat and archive branches), G7/G11 (`requestSplatForLoad`, `runLoad` start), G12 (`runLoad` `finally`, import) |
| `src/hooks/useUrlState.ts` | G7 (`applySavedViewerState`, final block) |
| `src/store/reconstructionStore.ts` | G7/G11 (`setLoadedFiles`, `setRequestedSplatSourceId`, field docs), G12 (`isSplatDownloadPending` export) |
| `src/components/modals/SplatPickerModal.tsx` | G13 |
| `src/components/modals/useSplatPickerStoreFacade.ts` | G13 |
| `src/components/ui/ModalDialogShell.tsx` | G13 |
| `src/components/ui/modalDialogShellPolicy.ts` | G13 |
| `src/hooks/fileDropzoneWorkflow.test.ts` | G6 |
| `src/hooks/fileDropzonePointCloudOnly.test.ts` | G6 |
| `src/hooks/urlLoaderManifestSource.test.ts` | G6, E13 |
| `src/hooks/urlLoaderSplatSource.test.ts` | E13 |
| `src/hooks/useUrlLoader.test.ts` | G6, G7, G11, G12, E13 |
| `src/hooks/useFileDropzone.test.ts` | G7 |
| `src/store/reconstructionStore.test.ts` | G11 |
| `src/components/modals/SplatPickerModal.test.tsx` | G13 |
| `src/components/ui/ModalDialogShell.test.tsx` | G13 |

**Functions R1 also touches, for ordering:**
- `reconstructionStore.ts`: this area changes `setLoadedFiles` and `setRequestedSplatSourceId`, and adds `isSplatDownloadPending`. It does **not** change `cancelLoading`, `clear`, `selectSplatSource` or `showColmapOnly`.
- `useUrlLoader.ts`: this area changes `runLoad` (one call after the shared decode, and the `finally` predicate) and `loadFromUrl`'s splat and archive branches, and adds `settingsBesideOnce` and `requestSplatForLoad`. `applyOptionalSettingsBeside`, `loadFromManifest` and the Drive branch are unchanged.
- `useUrlState.ts`: only `applySavedViewerState`'s final block changes. `applyShareConfig` is unchanged.

## Recommended task grouping and order

1. **Task R2-A: E13.** *Install a URL's source only for the scene it replaced.*
   - Files: `urlLoaderManifestSource.ts`, `urlLoaderSplatSource.ts`, and the test-double updates in the manifest, splat and `useUrlLoader` tests.
   - Effort: low / low.
   - It goes first so the doubles report replacements before G6 relies on them.
2. **Task R2-B: G6.** *Show a URL dataset only once its splat list and saved settings are known.*
   - Files: the workflow, point-cloud-only, `useFileDropzone` (`processFiles`), the three URL sources, and `useUrlLoader` (`settingsBesideOnce` and its branches).
   - Tests: the G6 tests, including the `processWithStore` helper.
   - Effort: max / max.
   - Land it before R1's G3.
3. **Task R2-C: G7 + G11.** *Give each dataset load only its own splat request.*
   - Files: `reconstructionStore.ts` (`setLoadedFiles`, `setRequestedSplatSourceId`, docs), `useUrlLoader.ts` (`requestSplatForLoad`), `useFileDropzone.ts` (`beginLocalLoad`), `useUrlState.ts`.
   - Tests: the G7 and G11 tests, and the large-touch assertion.
   - Effort: high / high.
   - It depends on R2-B's `processWithStore` helper.
4. **Task R2-D: G12.** *Keep the overlay and Cancel for a tile picked during the restore.*
   - Files: `reconstructionStore.ts` (export) and `useUrlLoader.ts` (`finally`).
   - Effort: medium / medium.
   - It goes after R2-C, which edits the same two files.
5. **Task R2-E: G13.** *Close the splat picker without unloading a splat chosen meanwhile.*
   - Files: the picker, its facade, `ModalDialogShell`, and the policy.
   - Effort: medium / high.
   - It is independent and can run in parallel with any of the above.

## Cross-area notes

- **R1 (cancel and Reload)**
  - **G3.** After R2-B, the settings beside an archive or a direct file settle before the commit, so a bundled splat decodes only after the URL load has applied and bound its settings. G3's scenario cannot arise. R2-B's test "settles the settings beside an archive before handing its bundled splat to the renderer" pins the outcome: Cancel during the decode keeps alignment 5 and the Reload binding. The reviewer's `rev2/vt/src/hooks/zipCancelSettings.test.ts` asserts HEAD's window, which no longer exists.
    - Recommendation: land R2-B first, and re-scope R1's G3 to that regression test.
    - R1 must not reintroduce an await after the commit in `loadFromUrl`.
  - **E6** (startup transform). Use the same reset points as G7: `runLoad` right after `decodeSharedViewerOverrides`, and `beginLocalLoad`.
  - **G5 and C1** (`cancelLoading` and `clear`) do not overlap with R2's hunks in `reconstructionStore.ts`.
- **R4 (Hugging Face access and auth)**
  - **G9** (sequential settings candidates and the 3 s deadline after download) should start the beside-settings request inside `settingsBesideOnce`, and settle it in `beforeSceneCommit`.
  - **E14** changes `fetchWithTimeout.ts`. R2 imports `FETCH_TIMEOUT` from there and needs that constant to stay.
- **R3 and R5:** no shared files.

## Verification log

- **Scratch trees.** The trees are `scratchpad/rev3/r2/head` (`e8a2a43`'s `src`) and `scratchpad/rev3/r2/fix` (`src` plus every fix above).
  - Both have the same test files, the repo's `package.json`, `tsconfig*`, `vite.config.ts` and `viteLocalAliasPolicy.ts`.
  - Junctions point to the repo's `node_modules`, and for full-suite runs also to `tests`, `public`, `docs`, `scripts`, `e2e`, `.github` and `vendor`. All junctions were removed afterwards with `cmd /c rmdir`.
- **RED in `head/`.** Running the nine touched test files gives 20 new tests failing for the intended assertions (quoted per finding above), plus the updated large-touch assertion. The guards pass, as designed: "starts the splat listing deadline after parsing …" and "still chooses None from its None row …".
- **GREEN in `fix/`.**
  - The same files pass, 345 tests with `useUrlState.test.ts` included.
  - Three consecutive runs were identical.
  - The full suite gives 566 files passing and 3 failing. The 3 fail identically in `head/` because the scratch copy has no WASM build output or `package-lock.json`: `wasmParamParity`, `gaussianToolboxPackaging` and `reconstructionAuthority`.
- **Types and lint.**
  - `npx tsc -p tsconfig.test.json --noEmit` (incremental off) reports only the two baseline errors for the uncopied `tests/colmapFixturePaths`.
  - `npx eslint` on every touched source and test file is clean.
- **Mutation check.** Starting the discovery deadline at load start (`void settleCatalog()` before the downloads) fails the guard "starts the splat listing deadline after parsing, not with the downloads".
- **G3 cross-check.** The archive test passes in `fix/`. It is RED in `head/` with `expected { reconstruction: {…} } to match object { reconstruction: null, … }`.
