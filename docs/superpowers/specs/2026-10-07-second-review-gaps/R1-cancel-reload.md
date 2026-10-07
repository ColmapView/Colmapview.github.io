# R1: Cancel and Reload — fix spec (G2, G3, G5, E2, E6, C1)

**Date:** 2026-10-07
**Branch:** `fix/second-review-gaps` at e8a2a43. Line numbers are at e8a2a43.
**Inputs:** `findings.md` (same folder), the reviewer's scratch repros in `scratchpad/rev2/` (`verify_reload_cancel/`, `vt/src/hooks/zipCancelSettings.test.ts`).

## How this was verified

- I copied the repo's `src/`, `tests/colmapFixturePaths.ts` and configs to `scratchpad/rev3/r1/` and linked its `node_modules` to the repo's with a junction.
- I wrote every test below into that copy. I ran it with the e8a2a43 version of the file under test swapped in (RED), then with the fix (GREEN). Each finding's RED/GREEN record is in its Tests section. The logs are in `scratchpad/rev3/r1/logs/`.
- With every fix applied, these checks ran on the copy:
  - Full `npx vitest run`: 4628 passed. The 9 failures are in `gaussianToolboxPackaging.test.ts`, `sogBundle.fixture.test.ts` and `huggingface/auth.test.ts`. All three read `vendor/`, fixtures or `public/` outside `src/`, which the copy lacks. They pass in the repo at e8a2a43 (20/20).
  - `tsc -p` over `tsconfig.test.json` with the whole `src` (build info disabled): clean.
  - ESLint on every touched file: clean.
  - The touched test files print nothing to stdout or stderr.
- Mutation check: replacing G5's active-source resolution with a plain file comparison turns the byte-less test red.
- **Line endings.** `core.autocrlf=true`: the index holds LF and most working-tree files are CRLF. Keep each file's working-tree endings; git normalizes on commit.

## Summary

| ID | Status | Fix in one line | Effort (implementer / reviewer) |
|---|---|---|---|
| G2 | Confirmed (RED) | Reset the transform when the reloaded scene commits (`reloadFiles` → `onSceneReplaced`); the four entry points stop resetting up front | medium / high |
| G3 | Confirmed (RED) | A renderer-decode Cancel is None: `cancelLoading` no longer aborts the URL load or the parse job in that branch | high / max |
| G5 | Confirmed (RED) | The splat-only clear runs only when no other listed splat can be shown | medium / high (one task with G3) |
| E2 | Confirmed (RED) | New store action `dropFailedSplat(file)`; Spark's terminal failure makes the scene COLMAP only | medium / high |
| E6 | Confirmed (RED) | The startup plan's pre-load config leaves out the link's alignment; the loader applies it once the scene exists | low / medium |
| C1 | Confirmed (latent; type-level RED) | Remove `preserveZip` from `ClearReconstructionOptions` | low / low |

**Decision changes:** none.

**Refinements** (consistent with the deliberate decisions, which do not cover these cases):
- "Cancel loading" during the renderer's decode now behaves exactly like None. A URL load that is still settling the scene it committed (saved settings, Reload binding) goes on.
- The splat-only fallback still calls `clear()`, but only when nothing else is left to show (G5's brief).
- A terminal renderer failure joins the COLMAP-only transitions (E2).

---

## G2: A cancelled or failed Reload drops the saved alignment

### Verified

**The four entry points reset the transform before the asynchronous Reload has committed anything:**
- `TransformPanel.tsx:63-67`: `confirmReload()` → `resetTransform()` (:65) → `void reloadFiles(droppedFiles)`.
- `ExportPanel.tsx:202-207`: the same sequence (:205).
- `globalContextMenuActionExecutor.ts:285-290`: the same (:287).
- `transformGizmoContextMenuExecutor.ts:23-28`: the same (:25).

**Without edits there is no prompt to stop it.**
- `confirmReload` (`sessionActions.ts:59-68`) prompts only when `hasUnsavedReloadState(await getReloadBaseline())` is true.
- The baseline is the transform Reload re-applies (`:43-53`): the files' own `colmapview.yaml`, then the bound settings, then identity.
- A dataset showing its saved alignment T is therefore reset to identity without any confirmation.

**Only a committed scene puts T back:**
- `reloadFiles` (`useFileDropzone.ts:136-142`) calls the workflow.
- The workflow re-applies `viewerState` in `complete()` (`fileDropzoneWorkflow.ts:323-333`) → `applySavedViewerState` → `applyShareConfig(viewConfig(...))` (`useUrlState.ts:156-157`).
- `complete()` runs only after the scene commit (`:587-607`, `:631`).

**When the Reload ends early:**
- A Cancel during the parse goes `cancelLoading` → `cancelPendingReconstructionLoad`.
- A read failure (`NotReadableError`) ends in the catch at `:632-640`.
- Either way the workflow returns `false` before the commit, and the scene stays at identity.
- With applied edits the user confirms. A cancelled Reload then keeps the edits and the marks, because both are discarded only at the commit (`setReconstruction` without `edited`). It still loses T.

**The prompt state goes wrong as well.** After the failed Reload, the transform (identity) differs from the baseline (T), so the next Reload asks "Reload data?" although the user changed nothing.

**RED:** the new `useFileDropzone.test.ts` test goes through the gizmo menu's Reload, the real `reloadFiles` and the real workflow, and cancels or fails the parse. Both variants end at identity instead of T. The reviewer's `verify_reload_cancel/src/reloadCancel.test.ts` shows the same.

### Root cause

Reload discards edits, pending marks and the splat transform at the scene commit:
- edits and marks through `setReconstruction` without `edited` (`reconstructionStore.ts:313-326`);
- the splat transform through `setLoadedFiles`' non-switch branch (`:379-381`). A Reload always passes a new `imageFiles` map, so it is never a switch.

The scene transform is the one thing discarded up front, by the callers, before anything is known to have loaded.

### Fix (code)

**Recommended: move the reset into the Reload's commit.** Pass `onSceneReplaced` from `reloadFiles` and delete the four early resets.

**Why `onSceneReplaced` works:**
- The workflow calls it synchronously inside the commit on every path a Reload takes:
  - COLMAP: `:590`;
  - images-only: `:505`;
  - splat-only: `replaceWithSplatOnlyScene`, `:385`;
  - point-cloud-only: the `setLoadedFiles` callback of `runNewPointCloudOnlyLoad`, `:244`.
- It always runs before `complete()`.
- A Reload never takes the merge path: `updateLoadedSplatFile` is skipped when `reload` is set (`:434-435`, `:471-478`).
- `complete()` runs synchronously up to `applySavedViewerState`'s first transform write. Nothing can run between the reset and the re-applied alignment, so the reloaded scene is never shown at identity before T returns.

**Alternatives, rejected:**
- *A `resetTransform` dependency inside the workflow for `reload`.* It is more plumbing, and the workflow is store-free by design.
- *Reset the scene transform in every scene load* (`setReconstruction` without `edited`). That is a product change: a new dataset would stop inheriting the alignment on screen. Today's behaviour is recorded in `sessionActions.test.ts:164` ("A dataset without settings leaves the alignment on screen"). See Out of scope 1.

`src/hooks/useFileDropzone.ts`:
```diff
@@ imports
   useReconstructionStore,
   useSplatBackendStore,
+  useTransformStore,
   useUIStore,
 } from '../store';
@@ reloadFiles
     return processFiles(files, undefined, {
       reload: true,
       viewerState: useReconstructionStore.getState().getBoundSourceViewerState(files),
+      // The transform goes with the scene it was on, so a cancelled or failed Reload keeps it.
+      onSceneReplaced: () => useTransformStore.getState().resetTransform(),
     });
   }, [processFiles]);
```

`src/components/viewer3d/panels/TransformPanel.tsx` (the `resetTransform` destructure stays; the Reset button uses it):
```diff
   const reload = async () => {
     if (!droppedFiles || !await confirmReload()) return;
-    resetTransform();
     void reloadFiles(droppedFiles);
   };
```

`src/components/viewer3d/panels/ExportPanel.tsx`:
```diff
     transform: {
-      resetTransform,
       getTransform,
       getSplatTransform,
     },
@@
   const handleReload = useCallback(async () => {
     if (!droppedFiles) return;
     if (!await confirmReload()) return;
-    resetTransform();
     reloadFiles(droppedFiles);
-  }, [droppedFiles, confirmReload, resetTransform, reloadFiles]);
+  }, [droppedFiles, confirmReload, reloadFiles]);
```
`useExportPanelStoreFacade` keeps `transform.resetTransform`; its test pins it (`useExportPanelStoreFacade.test.ts:87`). Dropping it is optional cleanup, not part of this fix.

`src/components/viewer3d/contextMenu/globalContextMenuActionExecutor.ts` (the `'resetTransform'` action keeps its call):
```diff
     case 'reloadData':
       if (deps.droppedFiles && await deps.confirmReload()) {
-        deps.resetTransform();
         await deps.reloadFiles(deps.droppedFiles);
       }
       break;
```

`src/components/viewer3d/transformGizmoContextMenuExecutor.ts` (the `'reset'` action keeps its call):
```diff
     case 'reload':
       if (deps.droppedFiles && await deps.confirmReload()) {
-        deps.resetTransform();
         deps.reloadFiles(deps.droppedFiles);
       }
       break;
```

### Tests (code)

**`src/hooks/useFileDropzone.test.ts`.** Extend the store import and add two imports:
```ts
import { confirmReload, useNotificationStore, useReconstructionStore, useSplatBackendStore, useTransformStore, useUIStore } from '../store';
import { executeTransformGizmoContextMenuAction } from '../components/viewer3d/transformGizmoContextMenuExecutor';
import { applySavedViewerState } from './useUrlState';
```
Then add this block at the end of `describe('useFileDropzone')`. It reuses the file's `actualWorkflow`, `processFileDropzoneFilesMock`, `buildFile`, `buildReconstruction`, `createIdentityEuler`, `noopLogger` and `PublishedViewerState`.
```ts
  describe('Reload and the alignment on screen', () => {
    const alignment = { ...createIdentityEuler(), rotationY: 0.5, translationX: 2 };
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null, config: { transform: alignment } };
    const datasetFiles = () => new Map(['cameras.bin', 'images.bin', 'points3D.bin']
      .map((name): [string, File] => [name, buildFile(name)]));

    beforeEach(() => { useTransformStore.setState(useTransformStore.getInitialState(), true); });
    afterEach(() => { useTransformStore.setState(useTransformStore.getInitialState(), true); });

    /** The real workflow behind processFiles, with the parse stubbed. */
    function reloadThroughWorkflow(parseFiles: FileDropzoneWorkflowDeps['parseFiles']) {
      processFileDropzoneFilesMock.mockImplementationOnce((files, deps, options) => actualWorkflow.processFileDropzoneFiles(files, {
        ...deps, logger: noopLogger, clearCaches: vi.fn(), shouldPreloadSplatRuntime: () => false, delay: async () => undefined,
        parseFiles, buildReconstruction: async () => ({ reconstruction: buildReconstruction(), pointCount: 0 }),
      }, options));
    }

    const parsed = async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false });

    it.each(['cancelled', 'failed'] as const)('keeps the saved alignment, with nothing to ask next time, when a Reload is %s', async outcome => {
      const files = datasetFiles();
      // A URL dataset as the loader leaves it: settings retained beside its files, then applied.
      useReconstructionStore.getState().setDroppedFiles(files);
      useReconstructionStore.getState().setSourceViewerState(saved);
      await applySavedViewerState(saved, null);
      const scene = buildReconstruction();
      useReconstructionStore.setState({ reconstruction: scene });
      let parseStarted!: () => void;
      const parsing = new Promise<void>(resolve => { parseStarted = resolve; });
      reloadThroughWorkflow(({ signal }) => new Promise<never>((_resolve, reject) => {
        parseStarted();
        if (outcome === 'failed') reject(new DOMException('The requested file could not be read.', 'NotReadableError'));
        else signal?.addEventListener('abort', () => reject(signal.reason));
      }));
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { result } = renderHook(() => useFileDropzone());
      let reloading!: Promise<boolean>;
      await act(async () => {
        await executeTransformGizmoContextMenuAction('reload', {
          resetTransform: useTransformStore.getState().resetTransform, applyTransformToData: vi.fn(),
          setShowGizmo: vi.fn(), closeContextMenu: vi.fn(), droppedFiles: files, confirmReload,
          reloadFiles: reloadedFiles => { reloading = result.current.reloadFiles(reloadedFiles); },
        });
        await parsing;
      });

      if (outcome === 'cancelled') act(() => useReconstructionStore.getState().cancelLoading());
      await act(async () => { expect(await reloading).toBe(false); });

      expect(useReconstructionStore.getState().reconstruction).toBe(scene);
      expect(useTransformStore.getState().transform).toEqual(alignment);
      // Nothing changed, so the next Reload has nothing to lose and asks nothing.
      await expect(confirmReload()).resolves.toBe(true);
      expect(confirm).not.toHaveBeenCalled();
    });

    it('discards a hand-made alignment when the reloaded scene commits', async () => {
      const files = datasetFiles();
      useReconstructionStore.getState().setDroppedFiles(files);
      useTransformStore.getState().setTransform({ scale: 3 });
      reloadThroughWorkflow(parsed);
      const { result } = renderHook(() => useFileDropzone());

      await act(async () => { expect(await result.current.reloadFiles(files)).toBe(true); });

      expect(useTransformStore.getState().transform).toEqual(createIdentityEuler());
    });

    it('brings the saved alignment back over a hand-made one', async () => {
      const files = datasetFiles();
      useReconstructionStore.getState().setDroppedFiles(files);
      useReconstructionStore.getState().setSourceViewerState(saved);
      useTransformStore.getState().setTransform({ scale: 3 });
      reloadThroughWorkflow(parsed);
      const { result } = renderHook(() => useFileDropzone());

      await act(async () => { expect(await result.current.reloadFiles(files)).toBe(true); });

      expect(useTransformStore.getState().transform).toEqual(alignment);
    });
  });
```

**`src/components/viewer3d/transformGizmoContextMenuExecutor.test.ts`**, in "reloads dropped files only after confirmation and closes the menu". Replace `expect(deps.resetTransform).toHaveBeenCalledTimes(1);` with:
```ts
    // The reloaded scene's commit discards the transform, so a cancelled or failed Reload keeps it.
    expect(deps.resetTransform).not.toHaveBeenCalled();
```

**`src/components/viewer3d/contextMenu/globalContextMenuActionExecutor.test.ts`**, in "reloads dropped files only after confirmation". Replace `expect(confirmedDeps.resetTransform).toHaveBeenCalled();` with:
```ts
    // The reloaded scene's commit discards the transform, so a cancelled or failed Reload keeps it.
    expect(confirmedDeps.resetTransform).not.toHaveBeenCalled();
```

**`src/components/viewer3d/panels/TransformPanel.test.tsx`**, in "asks before Reload discards the transform ... (confirmed: %s)". In the `confirmed` branch, replace `expect(useTransformStore.getState().transform).toEqual(createIdentityEuler());` with:
```ts
      // Discarded only when the reloaded scene commits, which this stand-in never does.
      expect(useTransformStore.getState().transform).toEqual(transform);
```
`createIdentityEuler` is still used elsewhere in the file.

**`src/components/viewer3d/panels/ExportPanel.test.tsx`.** Add before "asks before a Reload that would discard a pending transform, and stays put when declined":
```ts
  it('leaves the transform to the reloaded scene to discard once confirmed', async () => {
    const droppedFiles = new Map([['sparse/0/cameras.bin', new File(['c'], 'cameras.bin')]]);
    const transform = { ...createIdentityEuler(), scale: 1.5 };
    useReconstructionStore.setState({ droppedFiles });
    useTransformStore.setState({ transform });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

    await waitFor(() => expect(reloadFilesMock).toHaveBeenCalledExactlyOnceWith(droppedFiles));
    expect(requestConfirmationMock).toHaveBeenCalledOnce();
    // This stand-in never commits a scene, so a cancelled or failed Reload would keep the transform.
    expect(useTransformStore.getState().transform).toEqual(transform);
  });
```

**RED/GREEN record:**
- RED at e8a2a43 (with the e8a2a43 store too): 7 failed, 37 passed across the 5 files. The failures are:
  - the two integration variants (transform identity, not T);
  - "discards a hand-made alignment…" (scale stays 3);
  - the four entry-point assertions.
- "brings the saved alignment back over a hand-made one" passes before and after. It guards that Reload still re-applies T.
- GREEN: `src/hooks/useFileDropzone.test.ts`, `transformGizmoContextMenuExecutor.test.ts`, `contextMenu/`, `panels/` and `useTransformGizmoStoreFacade.test.ts`: 44 files, 266 tests.

### Risks and interactions

- **Reload decisions.**
  - "Discards applied edits, transforms and pending marks on every path": kept. The transform is now discarded at the same commit as the rest.
  - "Keeps the on-screen splat": untouched.
  - "Announces what a first load announces": untouched; no new notifications.
- **Task 12 prompt baseline.** A cancelled or failed Reload changes nothing, so the next `confirmReload()` compares the same state. The integration test pins that it does not prompt. With edits or marks, the next Reload asks again because they are still there. That is correct.
- **A transform changed during the Reload's parse** (keyboard, or the gizmo under the overlay) is discarded at the commit, as the old early reset would have discarded it anyway.
- **Other areas.** R2 may touch `useFileDropzone.ts` for G6 (`cancelUrlLoad`/`beginLocalLoad`); this change is confined to `reloadFiles`. No R2 file is touched.

### Effort
**medium / high.** The edits are spelled out across six files. The review must confirm that every Reload path resets at its commit and before `complete()`, and that the prompt baseline stays consistent.

---

## G3: Cancelling a renderer decode also aborts the URL load that is still settling

### Verified

**`cancelLoading` (`reconstructionStore.ts:637-662`) stops everything in the decode branch:**
- It applies when the renderer owns the progress (`rendererOwnsSplatProgress`, `:56-58`) and the scene is more than splats.
- It still runs `urlLoadController?.abort()` (`:649`) and `cancelPendingReconstructionLoad()` (`:650`).
- It nulls `urlLoadActive`/`urlLoadController` (`:653`), then runs `showColmapOnly` (`:655-656`).

**The ZIP URL in the finding hits that branch while its load is still running:**
- `processFiles` commits the scene and hands the bundled splat to the renderer, keeping `urlLoading` on with renderer-owned progress (`fileDropzoneWorkflow.ts:368-379`, `:630`).
- `loadFromUrl` then awaits `applyOptionalSettingsBeside` (`useUrlLoader.ts:246-248`). That fetch rides the load's signal (`:73`, `:133-134`).
- Cancel aborts the signal, and the fetch rejects. `runLoad`'s catch (`:182-192`) sees `isCurrent()` false (`:108-109`) and returns `false` silently.
- `setSourceViewerState` (`:170`) and `applySavedViewerState` (`:171`) never run. The scene keeps identity and the default view, and nothing is bound for Reload.

**Choosing None in the same window** (`selectSplatSource('')` → `showColmapOnly`) leaves the controller alone, so the settings land.

**RED:**
- The new `useUrlLoader.test.ts` test drives the real workflow with a ZIP and its bundled splat, holding the beside-YAML response open. With "Cancel loading", `loadFromUrl` resolves `false` and the transform stays identity. The "None" control passes.
- The new store test sees the URL load's signal aborted.
- This matches the reviewer's `vt/src/hooks/zipCancelSettings.test.ts` (`transformX` 5 vs 0).

### Root cause

`cancelLoading` treats a decode cancel as "stop every load, then COLMAP only". The only load still running in that branch is the URL load that committed this very scene. It is settling what it already showed: its saved settings and the Reload binding. The user's Cancel is aimed at the splat named on the overlay.

### Fix (code)

**Recommended: in the decode branch, do exactly what None does, then return.** `showColmapOnly` plus a revision bump. Leave `urlLoadController`/`urlLoadActive` and the parse job alone.

**Why the smallest change is in the store:**
- The settings fetch, the restore and the Reload binding all run on the URL load's signal and `isCurrent` guard (`useUrlLoader.ts:108-134`).
- Keeping them alive after an abort would need a second lifecycle inside `runLoad`, which is R2's file.
- Not aborting is one branch in one function.

**Comparison with None:**
- The store transition is identical: `showColmapOnly` and `splatSelectionRevision + 1`, which `selectSplatSource('')` also performs.
- So the restore stays None:
  - `canRestoreSplatSelection()` is false (`useUrlState.ts:130`, `:160`, `:166`);
  - the display falls back without a splat (`:165`);
  - the picker is not offered (`useUrlLoader.ts:175-179`).

**Behaviour change.**
- At e8a2a43 a decode cancel also stopped any other pending load.
- The only way another load can be pending while the renderer owns the progress is a race:
  1. an old scene's splat decodes without the overlay;
  2. a new load starts;
  3. the old renderer's next phase update overwrites the new load's progress.
- Cancel then stops only the old decode, and the new load goes on.
  - A local load re-shows its overlay in `processFiles` (`fileDropzoneWorkflow.ts:407-410`).
  - A URL load, until then, continues without one.
- The overlay covers the viewer while it shows (`DropZone.tsx:257-258`, `absolute inset-0 … z-overlay`), so a new load cannot be started from under it. The race is not reachable through the normal UI.

`src/store/reconstructionStore.ts`, the interface doc:
```diff
   /**
-   * Stop the load in progress (URL load, splat download, parse or splat decode) and keep the scene on
-   * screen. A splat-only scene whose decode is cancelled has nothing left, so it returns to the landing page.
+   * Stop the load in progress (URL load, splat download or parse) and keep the scene on screen. Stopping
+   * the renderer's decode is choosing None: a URL load still settling the scene goes on, and a splat-only
+   * scene with no other splat to show returns to the landing page.
    */
   cancelLoading: () => void;
```

`cancelLoading`, in full. G5's helper is included; it is one task with G5.
```ts
  cancelLoading: () => {
    const { urlLoadController, loadedFiles, reconstruction, splatSelectionRevision } = get();
    // Cancelling the renderer's decode is the user's explicit "COLMAP only", exactly like choosing None
    // in the picker: a URL load still settling the scene (its saved settings) goes on.
    if (rendererOwnsSplatProgress(get()) && loadedFiles) {
      // A splat-only scene would be left empty, with the landing page hidden: go back to it.
      if (!hasSceneBesidesSplats(loadedFiles) && !hasOtherSplatToShow(loadedFiles)) {
        get().clear();
        clearUrlLoadRequestFromLocation();
        return;
      }
      showColmapOnly(set, loadedFiles, { splatSelectionRevision: splatSelectionRevision + 1 });
      return;
    }
    const cancelsSplatDownload = activeSplatController !== null;
    cancelPendingSplatLoad();
    urlLoadController?.abort();
    cancelPendingReconstructionLoad();
    // A startup or shared link that never produced a scene would keep the landing page hidden.
    if (!reconstruction) clearUrlLoadRequestFromLocation();
    set({ urlLoading: false, urlLoadActive: false, urlLoadController: null, urlProgress: null });
    // A splat point style kept for the download would hide the points it leaves without a splat.
    if (cancelsSplatDownload && get().reconstruction && !get().loadedFiles?.splatFile) restorePointDisplayWithoutSplat();
  },
```

Notes:
- `cancelPendingSplatLoad()` is not needed in the decode branch. `rendererOwnsSplatProgress` already requires `activeSplatController === null`.
- The splat-only clear still aborts the URL load through `clear()` (`:666`); nothing is left for it to settle.

### Tests (code)

**`src/store/reconstructionStore.test.ts`**, in `describe('reconstruction store loading cancellation')`, before "keeps the address bar when a scene is already loaded":
```ts
  it("lets a URL load that is still settling its scene run on when the renderer's decode is cancelled", () => {
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({ splatFile: fileA, splatFiles: [fileA],
      splatFileSources: [{ id: 'splats/a.ply', path: 'splats/a.ply', file: fileA }] }));
    // The URL load committed this scene and handed its splat to the renderer; its saved settings are on the way.
    const signal = useReconstructionStore.getState().tryStartUrlLoad()!;
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), urlLoading: true,
      urlProgress: getSplatLoadingProgress(fileA, { startPercent: 60 }) });

    useReconstructionStore.getState().cancelLoading();

    const state = useReconstructionStore.getState();
    // As choosing None does: the splat goes, and the load that applies the settings goes on.
    expect(state.loadedFiles?.splatFile).toBeUndefined();
    expect(state.urlLoading).toBe(false);
    expect(signal.aborted).toBe(false);
    expect(state.urlLoadActive).toBe(true);
    expect(state.urlLoadController?.signal).toBe(signal);
  });
```

**`src/hooks/useUrlLoader.test.ts`**, before "restores settings beside a direct splat file hosted outside Hugging Face". It uses the file's existing imports.
```ts
  it.each(['Cancel loading', 'None'] as const)("applies the settings beside an archive after %s stops its bundled splat's decode", async action => {
    vi.stubGlobal('Blob', NodeBlob);
    const alignment = { ...createIdentityEuler(), translationX: 5 };
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null, config: { transform: alignment } });
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin', 'scene.spz'].map(name => [name, new File(['x'], name)]));
    let respondSettings: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn((url: string | URL, init?: RequestInit) => String(url).endsWith('colmapview.yaml')
      ? new Promise<Response>((resolve, reject) => {
        respondSettings = resolve;
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      })
      : Promise.resolve(new Response(null, { status: 404 }))));
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) =>
      (await deps.processFiles(files, { start: 80, end: 100 }, { throwOnError: true, signal: deps.signal })) !== false);
    const state = useReconstructionStore.getState();
    processFilesMock.mockImplementationOnce(async (incoming, progressRange, options) => {
      await processFileDropzoneFiles(incoming, {
        addNotification: vi.fn(), getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
        getSplatSelectionState: () => ({ revision: useReconstructionStore.getState().splatSelectionRevision,
          sourceId: getShareActiveSplatSourceId(useReconstructionStore.getState().loadedFiles) ?? undefined }),
        getMinTrackLength: () => 1, getSourceInfo: () => ({ sourceType: 'zip', imageUrlBase: null }),
        getUrlLoading: () => useReconstructionStore.getState().urlLoading,
        clearCaches: vi.fn(), logger: noopLogger, resetView: vi.fn(), delay: async () => {},
        shouldPreloadSplatRuntime: () => false,
        parseFiles: async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false }),
        buildReconstruction: async () => ({ reconstruction: buildReconstruction(), pointCount: 0 }),
        setDroppedFiles: state.setDroppedFiles, setLoadedFiles: state.setLoadedFiles,
        setWasmReconstruction: state.setWasmReconstruction, setReconstruction: state.setReconstruction,
        setUrlProgress: state.setUrlProgress, setUrlLoading: state.setUrlLoading, setError: state.setError,
      }, { ...options, progressRange });
    });
    const { result } = renderHook(() => useUrlLoader({ logger: noopLogger }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.loadFromUrl('https://example.com/project/scene.zip'); });
    // The scene is committed and its splat is with the renderer while the settings beside the archive are on the way.
    await waitFor(() => expect(respondSettings).toBeDefined());
    expect(useReconstructionStore.getState().urlProgress?.currentFile).toBe('scene.spz');

    if (action === 'Cancel loading') act(() => useReconstructionStore.getState().cancelLoading());
    else await act(async () => { await useReconstructionStore.getState().selectSplatSource(''); });
    await act(async () => {
      respondSettings!(new Response(yaml));
      expect(await pending).toBe(true);
    });

    const { loadedFiles, sourceViewerState, droppedFiles } = useReconstructionStore.getState();
    expect(loadedFiles?.splatFile).toBeUndefined();
    expect(useTransformStore.getState().transform).toEqual(alignment);
    // Reload can bring them back as well.
    expect(sourceViewerState?.files).toBe(droppedFiles);
    expect(sourceViewerState?.state.config.transform).toEqual(alignment);
  });
```

**RED/GREEN record:**
- Store test: RED at e8a2a43 (the signal is aborted). GREEN with the fix.
- Loader test at e8a2a43: "Cancel loading" is RED (`expected false to be true`); "None" passes.
- With the fix both pass.
- `useUrlLoader.test.ts`, `fileDropzoneWorkflow.test.ts`, `useUrlState.test.ts`, `components/dropzone` and `useFileDropzone.test.ts` against the fixed store: 15 files, 280 tests passed.

### Risks and interactions

- **R2's G6 (the overlay leaves mid-load).**
  - After this fix, a decode Cancel in the settling window hides the overlay, as None does. The URL load settles in the background, and the alignment and view land up to 3 s later.
  - If R2 keeps an overlay up until the URL load finishes, it must treat this Cancel exactly like None.
  - If R2 instead fetches the beside settings before `processFiles` (as v0.15.4 did), the archive window closes. The loader test then stops reaching it, so rework or drop it. The store test still pins the behaviour.
- **R2's G12** (`runLoad`'s `finally` keeps `urlLoading` only for renderer progress). After this Cancel, `urlProgress` is null, so the `finally` clears `urlLoading`, which is already false. No conflict.
- **Deliberate decisions.**
  - "Cancel loading calls `cancelLoading`, never `clear()`": unchanged.
  - "`n` during a load": unchanged. `isDatasetLoadPending` checks only the parse job (`reconstructionLoadLifecycle.ts:28-30`), which has finished by the time the renderer decodes.
  - "Restore order": the settings now still land, through the same restore.
- Existing pins stay green, including "treats cancelling a splat the renderer is still decoding as choosing COLMAP only", "aborts a pending reconstruction parse" (non-renderer progress), and the splat-only landing tests.

### Effort
**high / max.** The diff is small, but it changes a cancel state machine that is shared with the URL-load lifecycle (R2), and it accepts a documented race.

---

## G5: The splat-only cancel fallback clears the scene even when other splats are listed

### Verified

- `cancelLoading` (`reconstructionStore.ts:640-646`) calls `clear()` and strips the URL request whenever the decode is the renderer's and `!hasSceneBesidesSplats(loadedFiles)`.
- `hasSceneBesidesSplats` (`:742-744`) never looks at the other splats.

**Scenario:**
1. Drop `a.spz` and `b.spz` with no COLMAP files. `runSplatOnlyLoad` builds a splat-only scene.
2. Press `n`. `selectSplatSource('b.spz')` activates the in-memory file (`:475-486`), and the renderer decodes b.
3. Cancel. `clear()` returns to the landing page, and a is lost too.

None, or a Cancel during a download, keeps the scene.

**RED:** two new store tests, local and remote. In both, `loadedFiles` is `null` after the Cancel.

### Root cause

The fallback asks only "is anything besides splats on screen?", not "is any other splat left to show?". It was written for "the only splat" (f301242), and every test used a single source.

### Fix (code)

**What "available" means:** what `selectSplatSource` accepts (`:454-457`), a listed source with its bytes (`file`) or a `url`.
- That is exactly what the picker rows, the Point Cloud panel's "Splat File" select and `n` can activate:
  - the panel's select shows whenever at least one source is listed (`PointCloudPanel.tsx:129`);
  - `n` uses `getNextSplatSourceId` over all sources (`useViewerControlsController.ts:163-174`).
- The splat being cancelled does not count. It is identified with `getActiveSplatSourceId`, which maps a byte-less placeholder (held by no source) back to its own source.
- Today every listed source has a file or a URL:
  - local sources keep their files;
  - remote ones keep URLs;
  - `clearActiveSplatFile` drops bytes only when a URL remains.

  So in practice this means "another listed source". Mirroring `selectSplatSource`'s rule keeps the helper right if that changes.

The `cancelLoading` change is shown under G3. Add the helper beside `hasSceneBesidesSplats`, and import `getActiveSplatSourceId`:
```diff
@@ imports from '../utils/splatFileSourcePolicy'
   clearActiveSplatFile,
   findSplatSourceById,
+  getActiveSplatSourceId,
   getLoadedFilesWithActiveSplatSource,
@@ after hasSceneBesidesSplats
+/** Another listed splat the picker, the Point Cloud panel or `n` can still show: its bytes, or a URL to fetch. */
+function hasOtherSplatToShow(files: LoadedFiles): boolean {
+  const activeId = getActiveSplatSourceId(files);
+  return (files.splatFileSources ?? []).some(source => source.id !== activeId && Boolean(source.file || source.url));
+}
```

### Tests (code)

**`src/store/reconstructionStore.test.ts`**, in `describe('reconstruction store loading cancellation')`, after G3's test:
```ts
  it('keeps a splat-only scene, with None, when cancelling a decode leaves other splats to show', async () => {
    window.history.replaceState(null, '', '/?url=https%3A%2F%2Fexample.com%2Fsplats.zip');
    const a = new File(['a'], 'a.spz');
    const b = new File(['b'], 'b.spz');
    useReconstructionStore.getState().setLoadedFiles({ imageFiles: new Map(), hasMasks: false, splatFile: a,
      splatFiles: [a, b], splatFileSources: [{ id: 'a.spz', path: 'a.spz', file: a }, { id: 'b.spz', path: 'b.spz', file: b }] });
    const reconstruction = buildReconstruction();
    useReconstructionStore.setState({ reconstruction });
    // `n` switches to b, and the renderer starts decoding it.
    await useReconstructionStore.getState().selectSplatSource('b.spz');
    useReconstructionStore.setState({ urlLoading: true, urlProgress: getSplatLoadingProgress(b, { startPercent: 60 }) });

    useReconstructionStore.getState().cancelLoading();

    const state = useReconstructionStore.getState();
    expect(state.reconstruction).toBe(reconstruction);
    expect(state.loadedFiles?.splatFile).toBeUndefined();
    expect(state.loadedFiles?.splatFileSources?.map(source => source.file)).toEqual([a, b]);
    expect(state.urlLoading).toBe(false);
    expect(hasUrlToLoad()).toBe(true);
  });

  it('keeps a splat-only scene whose other splat is a remote tile that can still be fetched', () => {
    const b = new File(['b'], 'b.spz');
    useReconstructionStore.getState().setLoadedFiles({ imageFiles: new Map(), hasMasks: false, splatFile: b, splatFiles: [b],
      splatFileSources: [{ id: 'a.spz', path: 'a.spz', url: 'https://x/a.spz', size: 10 }, { id: 'b.spz', path: 'b.spz', file: b }] });
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), urlLoading: true,
      urlProgress: getSplatLoadingProgress(b, { startPercent: 60 }) });

    useReconstructionStore.getState().cancelLoading();

    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources?.map(source => source.id)).toEqual(['a.spz', 'b.spz']);
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
  });

  it('returns to the landing page when the only splat is a byte-less tile whose renderer work is cancelled', () => {
    const placeholder = new File([], 'b.spz');
    useReconstructionStore.getState().setLoadedFiles({ imageFiles: new Map(), hasMasks: false, splatFile: placeholder, splatFiles: [],
      splatFileSources: [{ id: 'tiles/b.spz', path: 'tiles/b.spz', url: 'https://x/tiles/b.spz', size: 10 }] });
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), urlLoading: true,
      urlProgress: getSplatLoadingProgress(placeholder, { startPercent: 60 }) });

    useReconstructionStore.getState().cancelLoading();

    // The placeholder stands for the tile's own source, so no other splat is left to show.
    expect(useReconstructionStore.getState().loadedFiles).toBeNull();
  });
```

The existing single-splat tests stay as they are. They pin the landing-page path:
- "returns to the landing page when cancelling the decode empties a splat-only scene";
- "strips a shared #d= link when cancelling its splat-only decode…";
- "takes the warning down when cancelling returns to the landing page".

**RED/GREEN record:**
- The first two tests are RED at e8a2a43 (`loadedFiles` null). GREEN with the fix.
- The byte-less test passes before and after. It guards the helper's active-source resolution: comparing `source.file !== files.splatFile` instead turns it RED (mutation run).
- Whole store file: RED 6 failed / 94 passed (G3, G5 and E2's tests). GREEN 100/100.

### Risks and interactions

- **A kept splat-only scene with None draws nothing until the user picks a splat** (`n`, or the panel's select). That is the same state a Reload keeps when None is on screen (`fileDropzoneSplatOnly.ts:12`). The picker is not opened, per the deliberate decision that only `offerSplatPicker` opens it after restoration.
- **Touch devices.** The picker greys out "Too large for this device" rows, but `n` and the panel can still activate them, and `selectSplatSource` does not gate tiers. Those rows therefore count as available. Excluding them would add a device policy to the store; it is not needed for the reported defect.
- **With a URL load still settling** (a ZIP of splats only), the kept scene lets the load finish, as in G3.

### Effort
**medium / high, in the G3 task.** It is one helper, but "available" and the byte-less placeholder need care in review.

---

## E2: A failed splat decode leaves the points in the splat display

### Verified

**What `failSplatLoading` does:**
- In `SplatLayer.tsx:319-327`, it clears the loading notice, sets `urlLoading` false and warns "Failed to load splat".
- Spark reaches it on a terminal failure: a failed runtime preload (`:386-399`) or a failed decode or initialization (`:499-511`, including a refused SOG).

**What it leaves behind:**
- The store still lists the splat as on screen (`loadedFiles.splatFile`).
- The display keeps the splat preset that activation applied (`applySplatPointDisplayDefaults`, `reconstructionStore.ts:82-87`: `splatPoints`, size 1, opacity 0.2). That is 1-pixel points at 20 % opacity (the A3 analysis of the previous round).
- Every other transition to "no splat showing" restores the plain display:
  - `showColmapOnly` (`:74-79`);
  - a cancelled download (`:660`);
  - a restore with no splat (`useUrlState.ts:165`);
  - a splat-less load (`:371-378`).

**Why a display-only fix is not enough:**
- `selectSplatSource` decides activation visuals by whether a splat was *active* (`hadSplatBefore`, `:464`, `:483-485`).
- `restorePointDisplayWithoutSplat` calls `setShowSplats(false)` (`pointCloudStore.ts:55`).
- So after a display-only fix, switching to another splat counts as tile-to-tile: it keeps `showSplats: false`, and the next splat would stay hidden.
- The failure must make the store COLMAP only, as None does.

**RED:**
- Store tests: `dropFailedSplat` does not exist (TypeError).
- `SplatLayer.test.tsx`: the warning appears, but nothing leaves the scene.
- Facade test: the action is missing.

### Root cause

The renderer's terminal failure ends only the loading UI. The store keeps the splat as on screen, with its splat display.

### Fix (code)

**Recommended:**
- Add a store action that is a COLMAP-only transition for a splat no renderer will draw.
- Spark calls it from its failure path. Spark is the last renderer to try a splat in every configuration reachable without a URL parameter:
  - auto mode uses Spark only when WebGPU is unsupported or has failed (`splatBackendPolicy.ts:297-305`, `:353-358`, after `'ready'` returns WebGPU at `:278-286`);
  - SOG always renders with Spark;
  - a forced `spark` backend uses nothing else.
- The action reuses `showColmapOnly`, so A6's single transition stays single.

**What the action does:**
- It acts only on the file still on screen.
- It yields to a tile download in flight, because that newer choice replaces the failed splat. Restoring the display under it would leave the arriving tile hidden.
- It does not bump `splatSelectionRevision`, because a failure is not the user's choice. A URL load's restore can therefore still show the saved splat, as long as that is a different splat.

`src/store/reconstructionStore.ts`:
```diff
@@ interface ReconstructionState, after selectSplatSource
   selectSplatSource: (sourceId: string, options?: { restore?: boolean }) => Promise<void>;
+  /** No renderer is left to draw this splat: like None, the scene shows without it. */
+  dropFailedSplat: (file: File) => void;
@@ store body, before setShowSplatPicker
+  dropFailedSplat: (file) => {
+    const { loadedFiles } = get();
+    // A newer choice, on screen or still downloading, supersedes the splat that failed.
+    if (!loadedFiles || loadedFiles.splatFile !== file || activeSplatController !== null) return;
+    showColmapOnly(set, loadedFiles);
+  },
+
   setShowSplatPicker: (showSplatPicker) => set({ showSplatPicker }),
```

`src/components/viewer3d/PointCloud/SplatLayerStoreFacade.ts`:
```diff
   setUrlProgress: ReturnType<typeof useReconstructionStore.getState>['setUrlProgress'];
+  dropFailedSplat: ReturnType<typeof useReconstructionStore.getState>['dropFailedSplat'];
 }
@@
   const setUrlProgress = useReconstructionStore((s) => s.setUrlProgress);
+  const dropFailedSplat = useReconstructionStore((s) => s.dropFailedSplat);
@@ actions
       setUrlProgress,
+      dropFailedSplat,
     },
```

`src/components/viewer3d/PointCloud/SplatLayer.tsx`:
```diff
       setUrlProgress,
+      dropFailedSplat,
     },
   } = useSplatLayerStoreFacade();
@@ failSplatLoading
     clearSplatLoadingNotification(file);
     setUrlLoading(false);
     addNotification('warning', message ?? `Failed to load splat: ${file.name}`);
-  }, [addNotification, clearSplatLoadingNotification, ownsSparkSplatLoading, setUrlLoading]);
+    // Spark is the last renderer to try a splat: the points show again without it, as with None.
+    dropFailedSplat(file);
+  }, [addNotification, clearSplatLoadingNotification, dropFailedSplat, ownsSparkSplatLoading, setUrlLoading]);
```

**Placement.**
- The call sits after `failSplatLoading`'s ownership check. Spark drops the splat only when it owned the failed load, so it never resets another renderer's overlay through `showColmapOnly`.
- `dropFailedSplat` is a stable store function, so `failSplatLoading`'s identity, and the effects that depend on it, do not change.

### Tests (code)

**`src/store/reconstructionStore.test.ts`.** Add a new `describe` before "reconstruction store settings timeout warning":
```ts
describe('reconstruction store splat the renderer could not draw', () => {
  const a = new File(['a'], 'a.ply');
  const b = new File(['b'], 'b.ply');

  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({ splatFile: a, splatFiles: [a, b], splatFileSources: [
      { id: 'splats/a.ply', path: 'splats/a.ply', file: a },
      { id: 'splats/b.ply', path: 'splats/b.ply', url: 'https://x/ds/splats/b.ply', size: 20 },
    ] }));
  });

  afterEach(() => {
    useReconstructionStore.getState().clear();
    vi.unstubAllGlobals();
  });

  it('shows the points again without it, as None does, and shows the next splat as a fresh one', async () => {
    useReconstructionStore.setState({ urlLoading: true, urlProgress: getSplatLoadingProgress(a, { startPercent: 60 }) });
    expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'splatPoints', pointSize: 1, pointOpacity: 0.2 });

    useReconstructionStore.getState().dropFailedSplat(a);

    const state = useReconstructionStore.getState();
    expect(state.loadedFiles?.splatFile).toBeUndefined();
    expect(state.loadedFiles?.splatFileSources?.map(source => source.id)).toEqual(['splats/a.ply', 'splats/b.ply']);
    expect(state).toMatchObject({ urlLoading: false, urlProgress: null });
    expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'rgb', showSplats: false, pointSize: 2, pointOpacity: 1 });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['b']))));
    await useReconstructionStore.getState().selectSplatSource('splats/b.ply');

    expect(useReconstructionStore.getState().loadedFiles?.splatFile?.name).toBe('b.ply');
    expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'splatPoints', showSplats: true });
  });

  it('ignores a failure reported for a file that is not the splat on screen', () => {
    const shown = useReconstructionStore.getState().loadedFiles;

    // Same name, another file: an earlier attempt, superseded since.
    useReconstructionStore.getState().dropFailedSplat(new File(['a'], 'a.ply'));

    expect(useReconstructionStore.getState().loadedFiles).toBe(shown);
    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
  });

  it('leaves a tile download in flight to replace the splat that failed', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    })));
    void useReconstructionStore.getState().selectSplatSource('splats/b.ply');
    await vi.waitFor(() => expect(useReconstructionStore.getState().urlLoading).toBe(true));

    useReconstructionStore.getState().dropFailedSplat(a);

    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(a);
    expect(useReconstructionStore.getState().urlLoading).toBe(true);
    expect(usePointCloudStore.getState().colorMode).toBe('splatPoints');
  });
});
```

**`src/components/viewer3d/PointCloud/SplatLayer.test.tsx`.**
- In `createFacade`'s `actions`, add `dropFailedSplat: vi.fn(),`.
- Add before "refuses a damaged SOG with its reason and never creates a Spark mesh":
```ts
  it('leaves the scene without a splat Spark could not load, so its points show again', async () => {
    let failInit!: (error: Error) => void;
    const initialized = new Promise<void>((_resolve, reject) => { failInit = reject; });
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) { this.dispose = vi.fn(); });
    const { SplatMesh } = createSplatMeshConstructor(initialized);
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    const splatFile = new File(['splat'], 'scene.ply');
    const facade = createFacade({ splatFile });
    useSplatLayerStoreFacadeMock.mockReturnValue(facade);
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);

    try {
      render(<SplatLayer />);
      await waitFor(() => expect(SplatMesh).toHaveBeenCalledTimes(1));

      await act(async () => { failInit(new Error('decode failed')); });

      await waitFor(() => {
        expect(facade.actions.addNotification).toHaveBeenCalledWith('warning', 'Failed to load splat: scene.ply');
      });
      expect(facade.actions.dropFailedSplat).toHaveBeenCalledExactlyOnceWith(splatFile);
    } finally {
      warn.mockRestore();
    }
  });
```

**`src/components/viewer3d/PointCloud/SplatLayerStoreFacade.test.ts`.** Add before "routes splat loading notifications to the notification store":
```ts
  it('leaves the scene without a splat the renderer could not draw', () => {
    const splatFile = buildFile('scene.ply', 'splat');
    useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({ splatFile,
      splatFileSources: [{ id: 'scene.ply', path: 'scene.ply', file: splatFile }] }) });
    const { result } = renderHook(() => useSplatLayerStoreFacade());

    act(() => { result.current.actions.dropFailedSplat(splatFile); });

    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(1);
  });
```

**RED/GREEN record:**

| Test | At e8a2a43 | With the fix |
|---|---|---|
| Store tests (3) | RED (TypeError) | GREEN |
| `SplatLayer.test.tsx` | RED: 1 failed / 16 passed (`dropFailedSplat` never called) | GREEN 17/17; `PointCloud/` 6 files, 32 tests |
| Facade test | RED (`dropFailedSplat is not a function`) | GREEN 3/3 |

### Risks and interactions

- **Retry once.**
  - If the failed splat is also the saved choice of a URL load that has not restored yet (G3's window), the restore re-activates it once. The renderer tries again, fails again, and the splat is dropped again: two warnings.
  - Bumping the revision would prevent that, but it would also block a *different* saved splat that might work. Accepted.
- **URL state.** `showColmapOnly` also nulls `urlProgress` and `urlError`. The call runs only when Spark owned the failed load, so the overlay it clears was the failed splat's. A stale `urlError` and the lazy-download toast go, as with None.
- **R2.**
  - G7: `requestedSplatSourceId` is nulled through `showColmapOnly`, the same as None.
  - G13: the picker is not involved.
- **Residuals, not fixed here:**
  1. **Forced WebGPU** (`?splatBackend=webgpu`, a diagnostic URL parameter; no setter in the UI).
     - Its failures have no Spark fallback, and the splat stays "on screen" with the splat display.
     - Covering it needs Scene3D to pass the store action to `WebGpuSplatCanvasLayer` for the forced backend only, and to call it after `failSplatLoadingNotification`.
     - Auto mode must not drop on a WebGPU failure, or Spark would never try.
  2. **Auto mode where WebGPU failed and the Spark chunk download then fails.**
     - The progress is still tagged `webgpu` from the failed attempt, so `ownsSparkSplatLoading` is false and `failSplatLoading` returns before both the toast and the drop.
     - This is pre-existing: no Spark toast appears either.

### Effort
**medium / high.** The store action is small. The review has to reason about the renderer failure paths, ownership checks and the auto-mode fallback.

---

## E6: A startup link's transform carries into the next dataset after Cancel

### Verified

**Where it is applied.** App applies the link's config before the load starts (`App.tsx:81-85`). `applyShareConfig` writes the scene transform and the splat transform (`useUrlState.ts:191-195`, `:217-220`).

**What a Cancel before any scene leaves.**
- The Cancel strips the link and stops (`reconstructionStore.ts:652-653`). Nothing resets `useTransformStore`.
- The store is not persisted, but no scene load resets the scene transform either:
  - `setLoadedFiles` resets only the splat transform (`:379-381`);
  - `clear()` resets only the splat transform (`:700`).
- The next dataset the visitor drops commits with the link's scene transform. The splat transform is reset by that commit.

**Probe:** apply `{ transform: { scale: 2 } }`, Cancel, then drop a COLMAP dataset through the real workflow. The new scene commits with `scale` 2. (This was a throwaway scratch test, removed afterwards.)

**Same result for:**
- a startup load that fails;
- a declined crash-loop reload. The pre-apply runs before `runGuardedUrlLoad` (`App.tsx:99-103`).

**The pre-load alignment is redundant when the load succeeds.**
- `runLoad` decodes the same hash (App passes `applyUrlOverrides: true`).
- `applySavedViewerState(saved, shared)` applies the shared transform in its early phase (`useUrlState.ts:157`; `viewConfig` `:148-153`).
- `useUrlLoader.test.ts:947` pins this: "applies shared link settings after a load even when the dataset has no saved settings".
- A pre-applied splat transform is always wiped by the commit's `setLoadedFiles` anyway.

**RED:** the plan test (the config still carries the alignment) and the sequence test (`scale` 2 remains after Cancel).

### Root cause

A link's alignment belongs to the scene the link loads, but App applies it before that scene exists. When no scene follows, nothing removes it, and the next dataset inherits it invisibly.

### Fix (code)

**Recommended: the startup plan's pre-load config leaves out the alignment.**
- App is unchanged. It still applies display settings and the requested splat before the load, as its comment says.
- The loader applies the alignment with the link's other settings once the scene exists.
- This covers Cancel, failure and decline with one rule, and it touches neither `reconstructionStore.ts` nor `useUrlState.ts`, both of which R2 edits.

**Alternatives, rejected:**
- *Reset the transforms in `cancelLoading` when no scene exists.* It covers Cancel only, not failure or decline, and it lands in R2's file.
- *Reset the scene transform on every scene load.* That is a product change; see Out of scope 1.

`src/appStartupPolicy.ts`:
```diff
+/**
+ * What App applies before the load starts: display settings and the requested splat. A link's alignment
+ * belongs to the scene it loads, and the loader applies it with the link's other settings once that scene
+ * is there, so a load that is cancelled, fails or is declined leaves none for the next dataset.
+ */
+function getConfigBeforeLoad(config: ShareConfig | null): ShareConfig | null {
+  if (!config?.transform && !config?.splat?.transform) return config;
+  const beforeLoad: ShareConfig = { ...config };
+  delete beforeLoad.transform;
+  if (beforeLoad.splat?.transform) {
+    beforeLoad.splat = { ...beforeLoad.splat };
+    delete beforeLoad.splat.transform;
+  }
+  return beforeLoad;
+}
+
 export function getAppStartupLoadPlan({
   shareData,
   legacyManifestUrl,
 }: AppStartupLoadPlanOptions): AppStartupLoadPlan {
-  const config = shareData?.config ?? null;
+  const config = getConfigBeforeLoad(shareData?.config ?? null);
```

A `#d=` link that carries config but no dataset (plan kind `'none'`) no longer applies an alignment to whatever is dropped next. The app never generates such links: `buildShareableUrl` (`utils/shareUrl.ts:26-44`) writes `#d=` config only with a dataset source, and otherwise only a camera hash. The existing plan tests use a config without transforms and are unaffected.

### Tests (code)

**`src/appStartupPolicy.test.ts`.**

Imports:
```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ColmapManifest } from './types/manifest';
import type { DecodedShareData, ShareConfig } from './utils/shareDataCodec';
import { createIdentityEuler } from './utils/sim3dTransforms';
import { applyShareConfig } from './hooks/useUrlState';
import { useReconstructionStore, useTransformStore } from './store';
```
In `describe('app startup policy')`, before "ignores malformed selected image ids from shared config":
```ts
  it("leaves a link's alignment to the scene its load commits", () => {
    const alignment = { ...createIdentityEuler(), rotationY: 0.5, translationX: 2 };
    const plan = getAppStartupLoadPlan({
      shareData: buildShareData({ manifestUrl: 'https://example.com/scene.zip',
        config: { ...shareConfig, transform: alignment, splat: { activeSourceId: 'a.spz', transform: alignment } } }),
      legacyManifestUrl: null,
    });

    // Display settings and the requested splat apply before the load; the alignment waits for the scene.
    expect(plan.config).toEqual({ ...shareConfig, splat: { activeSourceId: 'a.spz' } });
  });
```
A new `describe` before `describe('getTouchModeAutoAction')`:
```ts
describe('a startup link cancelled before its scene loads', () => {
  const resetStores = () => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
  };
  beforeEach(resetStores);
  afterEach(() => {
    resetStores();
    window.history.replaceState(null, '', '/');
  });

  it('leaves no alignment behind for the next dataset', () => {
    const alignment = { ...createIdentityEuler(), scale: 2 };
    const plan = getAppStartupLoadPlan({
      shareData: buildShareData({ manifestUrl: 'https://example.com/scene.zip',
        config: { transform: alignment, splat: { transform: alignment } } }),
      legacyManifestUrl: null,
    });
    useReconstructionStore.setState({ urlLoading: true, urlProgress: { percent: 0, message: 'Initializing...' } });

    // What App does before it starts the load, which the visitor then cancels.
    if (plan.config) applyShareConfig(plan.config);
    useReconstructionStore.getState().cancelLoading();

    expect(useTransformStore.getState()).toMatchObject({ transform: createIdentityEuler(), splatTransform: createIdentityEuler() });
  });
});
```

**RED/GREEN record:**
- At e8a2a43: 2 failed / 11 passed. The plan still carries the alignment, and `scale` 2 survives the Cancel.
- With the fix: 13/13.

### Risks and interactions

- **R2's G11** ("an explicit None in a startup link is applied before any scene exists") concerns the same pre-load application.
  - This change keeps `splat.activeSourceId` in the plan's config, so R2 can still record a pending None from it.
  - If R2 changes what App applies before the load, it should keep this rule: no alignment before the scene exists.
- **The success path is unchanged.** The link's transform still lands in the restore's early phase, together with the view. The new scene is not shown with the link's alignment before the restore applies it. The camera view lands at the same time, so this adds no visible step.

### Effort
**low / medium.** It is one pure policy function. The review checks that the post-load restore still applies the link's alignment, which the existing loader test pins.

---

## C1: `clearReconstruction({ preserveZip })` cannot keep the ZIP

### Verified

- `clearReconstruction` (`store/actions/reconstructionActions.ts:40-54`) first calls `clearAllCaches({ preserveZip })`, which skips the ZIP cache.
- It then calls the store's `clear()` (`:48`).
- Since 5af7c3a, `clear()` calls `clearActiveZipArchive()` unconditionally (`reconstructionStore.ts:668`), which closes the archive.
- The option has no effect. `clearReconstruction` has no caller and no test. It appears only in exports (`store/index.ts:74`, `store/actions/index.ts:24`) and the doc example (`store/actions/index.ts:12`).

### Fix (code)

**Recommended: remove the option.** This is the smaller and safer change:
- no runtime behaviour changes, because nothing calls it;
- a future caller cannot ask for an archive kept open with no scene to serve.

**Alternative: honour it in `clear()`.** That would extend `clear()`'s signature (R2's file). It would also leave the archive open after the scene that used it is gone, until the next load closes it.

`src/store/actions/reconstructionActions.ts`:
```diff
+/** The ZIP archive always goes: the store's clear() releases it with the scene it served. */
 export interface ClearReconstructionOptions {
-  /** If true, preserves the ZIP archive cache for re-processing */
-  preserveZip?: boolean;
   /** If true, preserves the current view state (does not reset camera) */
   preserveView?: boolean;
 }
@@
 export function clearReconstruction(options?: ClearReconstructionOptions): void {
-  const { preserveZip = false, preserveView = false } = options ?? {};
+  const { preserveView = false } = options ?? {};
 
   // Clear caches first (before store clear which disposes WASM)
-  clearAllCaches({ preserveZip });
+  clearAllCaches();
```
`src/store/actions/index.ts`, the usage example:
```diff
- * clearReconstruction({ preserveZip: true });
+ * clearReconstruction({ preserveView: true });
```
`SetReconstructionOptions.preserveZip` (used by `setNewReconstruction`) is honoured. It never calls `clear()`, so it stays.

### Tests (code)

New file `src/store/actions/reconstructionActions.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearReconstruction } from './reconstructionActions';
import { useReconstructionStore } from '../reconstructionStore';
import { hasActiveZipArchive, setActiveZipArchive } from '../../utils/zipArchiveState';
import { appLogger } from '../../utils/logger';
import { buildArchiveReader, buildLoadedFiles, buildReconstruction } from '../../test/builders';

describe('clearReconstruction', () => {
  afterEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    vi.restoreAllMocks();
  });

  it('closes the ZIP archive with the scene it served, and offers no option to keep it', () => {
    // The cache manager reports each clear.
    vi.spyOn(appLogger, 'info').mockImplementation(() => undefined);
    const archive = buildArchiveReader();
    const close = vi.spyOn(archive, 'close');
    setActiveZipArchive(archive, new Map());
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), loadedFiles: buildLoadedFiles() });

    // @ts-expect-error The store's clear() releases the archive with the scene, so it cannot be kept.
    clearReconstruction({ preserveZip: true });

    expect(useReconstructionStore.getState().reconstruction).toBeNull();
    expect(close).toHaveBeenCalledOnce();
    expect(hasActiveZipArchive()).toBe(false);
  });
});
```

**RED/GREEN record.** The RED is the project's test type check: `npm run typecheck:tests`, or `tsc -b`, which builds `tsconfig.test.json`.
- At e8a2a43 the type check fails with exactly `reconstructionActions.test.ts(18,5): error TS2578: Unused '@ts-expect-error' directive.`
- With the fix it is clean.
- The runtime assertions pass before and after. They pin that the archive closes, and the test prints nothing.

### Risks and interactions
None. It is type-only, and the function has no caller.

### Effort
**low / low.** It removes an unused option, and the type check proves it.

---

## File ownership

| Repo file | Findings |
|---|---|
| `src/store/reconstructionStore.ts` | G3, G5 (`cancelLoading`, `hasOtherSplatToShow`, the `getActiveSplatSourceId` import, the `cancelLoading` doc); E2 (`dropFailedSplat` and its interface entry) |
| `src/store/reconstructionStore.test.ts` | G3, G5, E2 |
| `src/hooks/useUrlLoader.test.ts` | G3 (integration test only; `useUrlLoader.ts` is not changed) |
| `src/components/viewer3d/PointCloud/SplatLayer.tsx` | E2 |
| `src/components/viewer3d/PointCloud/SplatLayerStoreFacade.ts` | E2 |
| `src/components/viewer3d/PointCloud/SplatLayer.test.tsx` | E2 |
| `src/components/viewer3d/PointCloud/SplatLayerStoreFacade.test.ts` | E2 |
| `src/hooks/useFileDropzone.ts` | G2 (`reloadFiles` only) |
| `src/hooks/useFileDropzone.test.ts` | G2 |
| `src/components/viewer3d/panels/TransformPanel.tsx`, `TransformPanel.test.tsx` | G2 |
| `src/components/viewer3d/panels/ExportPanel.tsx`, `ExportPanel.test.tsx` | G2 |
| `src/components/viewer3d/transformGizmoContextMenuExecutor.ts`, `.test.ts` | G2 |
| `src/components/viewer3d/contextMenu/globalContextMenuActionExecutor.ts`, `.test.ts` | G2 |
| `src/appStartupPolicy.ts`, `src/appStartupPolicy.test.ts` | E6 |
| `src/store/actions/reconstructionActions.ts` | C1 |
| `src/store/actions/reconstructionActions.test.ts` (new) | C1 |
| `src/store/actions/index.ts` | C1 (doc example) |

**Exact functions changed in R2's shared files, for ordering:**
- `src/store/reconstructionStore.ts`:
  - `cancelLoading` and its `ReconstructionState` doc comment;
  - new `dropFailedSplat` (store member and interface entry);
  - new module function `hasOtherSplatToShow`;
  - the import list from `../utils/splatFileSourcePolicy`.

  Not changed: `showColmapOnly`, `rendererOwnsSplatProgress`, `selectSplatSource`, `setLoadedFiles`, `setRequestedSplatSourceId`, `clear`.
- `src/hooks/useUrlLoader.ts`: no change. One test is added to `useUrlLoader.test.ts`.
- `src/hooks/useUrlState.ts`: no change.

## Recommended task grouping and order

| # | Task | Findings | Files | Commit subject | Effort |
|---|---|---|---|---|---|
| R1-T1 | A splat decode Cancel is None | G3, G5 | `reconstructionStore.ts` (`cancelLoading`, `hasOtherSplatToShow`), `reconstructionStore.test.ts`, `useUrlLoader.test.ts` | Cancel a splat decode as None, keeping the URL load and any other splat | high / max |
| R1-T2 | A failed decode is COLMAP only | E2 | `reconstructionStore.ts` (`dropFailedSplat`), `SplatLayer.tsx`, `SplatLayerStoreFacade.ts` and the three test files | Show the points again when Spark cannot draw the splat | medium / high |
| R1-T3 | Reload discards the transform at its commit | G2 | `useFileDropzone.ts`, the four entry points, five test files | Discard the transform when the reloaded scene commits | medium / high |
| R1-T4 | Startup links keep their alignment for their own scene | E6 | `appStartupPolicy.ts` and its test | Leave a startup link's alignment to the scene it loads | low / medium |
| R1-T5 | Remove the ZIP option `clear()` cannot honour | C1 | `reconstructionActions.ts`, `actions/index.ts`, the new test | Drop clearReconstruction's ZIP option that clear() cannot honour | low / low |

**Order:**
- T1, then T2: they share `reconstructionStore.ts`, and T2 reuses the same COLMAP-only transition.
- T3, T4 and T5 are independent of T1 and T2 and of each other.
- T3's cancel test cancels during a parse, the non-decode branch, so it passes with or without T1.
- Suggested sequence: T1, T2, T3, T4, T5.
- T1 and T2 can land before or after R2's store tasks, because they touch different functions. Landing them first pins the cancel semantics that R2's G6 and G12 work must respect.

## Cross-area notes

**R2 (URL load lifecycle):**
- `src/store/reconstructionStore.ts`: see the function list above.
  - If R2 changes `showColmapOnly` (for G7 or G13), `cancelLoading`'s decode branch and `dropFailedSplat` inherit the change. That is intended: both are meant to equal None.
- `src/hooks/useUrlLoader.test.ts`: this area adds one `it.each` before "restores settings beside a direct splat file hosted outside Hugging Face".
  - If R2's G6 fetches the beside settings before `processFiles`, rework or drop that test; the store test keeps G3 pinned.
  - If R2 keeps an overlay up while the URL load settles, a decode Cancel must still behave like None.
- `src/appStartupPolicy.ts`: G11 may touch the startup pre-load path. Keep "no alignment before the scene exists", and keep `splat.activeSourceId` in the pre-load config.
- `src/hooks/useFileDropzone.ts`: R2 may touch `cancelUrlLoad` or `beginLocalLoad` for G6. This area touches only `reloadFiles`.

**R3, R4, R5:**
- No shared files.
- No user doc describes the behaviours changed here. `docs/google-drive-loading.md:15` ("Cancel loading aborts the active request and parser") still holds: the download and parse phases are unchanged.

## Out of scope (observations, no change proposed)

1. **A dataset's on-screen scene transform carries into the next dataset.** No scene load resets `useTransformStore.transform`; only the splat transform resets, in `setLoadedFiles`.
   - `sessionActions.test.ts:164` records this as current behaviour.
   - E6 removes the invisible case: an alignment the visitor never saw, from a startup link that never loaded.
   - Whether every new dataset should start at identity is a product decision. If chosen, it is one `resetTransform()` beside `clearPendingDeletions()` in `setReconstruction`'s scene-load branch, plus a sweep of the tests that set a transform before `setReconstruction`.
2. **E2 residuals.** Forced WebGPU (`?splatBackend=webgpu`) failures, and the stale `webgpu` progress tag that blocks Spark's report after a failed WebGPU attempt and a failed Spark chunk download. Both are described under E2.
3. **`useExportPanelStoreFacade` still exposes `transform.resetTransform`**, unused by `ExportPanel` after G2. Its facade test pins it.
4. **Pre-existing race.** A Spark failure for the old scene's splat while a new load runs before its commit still calls `setUrlLoading(false)` (`SplatLayer.tsx:325`) over the new load's overlay. The new load's `processFiles` re-shows the overlay; a URL load's download phase runs without it until then.
