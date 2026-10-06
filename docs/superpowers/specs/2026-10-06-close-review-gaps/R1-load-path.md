# R1: Load-path follow-ups A1–A9, implementation spec

**Base:** `fix/load-path-review-findings` at `15f1b69`. Researched 2026-10-06 in read-only mode: no repository file was edited and no state-changing git command was run.

## How this was verified

- **Line references.** Every "Verified" claim cites `file:line` at `15f1b69`.
- **Trackball behavior (A1).** I measured it with a harness that runs the real trackball hooks in `TrackballControls` order: `scratchpad/exp-r1/pivot.test.tsx`, `sametick.test.tsx` and `worldup.test.ts`.
- **RED checks.** Every proposed test was run against `15f1b69` from the scratchpad (`exp-r1/red/*`).
  - Each behavior test fails, and for the stated reason.
  - Each "guard" test passes, as intended.
- **GREEN checks.** The fixes for A2–A9 were applied to a scratchpad copy of `src` (`exp-r1/repo`; patch `exp-r1/R1-verified-copy.diff`, CRLF-insensitive). With those fixes:
  - The proposed tests pass (`exp-r1/green/*`).
  - `tsc -p tsconfig.app.json --noEmit` is clean.
  - `eslint` on the changed files is clean.
  - The **full vitest suite passes: 562/566 files and 4407 tests.** The 4 failing files fail only because the copy lacks `tests/`, `e2e/fixtures` and `package-lock.json`. None of them imports a changed module.
- **Not GREEN-verified.** A1 and A3's re-application line were not applied to the copy, because the permission classifier blocked that one scratchpad edit. Their tests are RED-verified only. Treat that code as reviewed, not executed.

## Summary

| # | Real? | Severity | Main files | Evidence |
|---|---|---|---|---|
| A1 | Yes: horizonLock resets the view. The projection "pivot snap" does **not** reproduce. `axesCoordinateSystem` and `undistortionEnabled` must also move. | Important | `useUrlState.ts` | harness + 4 RED tests |
| A2 | Yes. In production it is reachable only through I2's cancel fallback. | Minor | `reconstructionStore.ts`, `optionalSettingsWarning.ts` | 2 RED, 1 guard; GREEN |
| A3 | Yes: the points draw at 1 px and 20 % opacity, blinking in one colour. This already happens today after "pick None". | Important (visibility) | `reconstructionStore.ts`, `useUrlState.ts` | 3 RED, 2 guards; store part GREEN |
| A4 | Yes, but latent: no UI path reaches it today. | Minor (hardening) | `useUrlLoader.ts` | 2 RED; GREEN |
| A5 | Yes. It needs a transient access-check status first. | Minor | `zipValidation.ts` | 2 RED; GREEN |
| A6 | Yes: the same transition is written twice. Cancel **should** clear `urlError`. | Refactor | `reconstructionStore.ts` | existing pins; GREEN |
| A7 | Yes: the same rule is written twice. The helper has identical semantics. | Refactor | `reconstructionStore.ts` | existing pins; GREEN |
| A8 | Yes, in three ways: a local pick is lost on the second Reload, a None is lost, and a project YAML switches the tile back. | Important (UX) | `splatFileSourcePolicy.ts`, `fileDropzoneWorkflow.ts`, `useFileDropzone.ts` | 5 RED, 1 guard; GREEN |
| A9 | Yes. | Minor | `TransformPanel.tsx`, its facade, `sessionActions.ts` | 2 RED; GREEN |

---

## A1: Navigation settings arrive after the early fly-to

### Verified

1. **Today's order** (`src/hooks/useUrlState.ts:118-133`):
   ```ts
   const alignmentConfig = (config: ShareConfig): ShareConfig => ({
     ...(config.transform ? { transform: config.transform } : {}),
     ...(config.splat?.transform ? { splat: { transform: config.splat.transform } } : {}),
   });
   ...
   if (saved) applyShareConfig(alignmentConfig(saved.config));
   if (shared?.config) applyShareConfig(alignmentConfig(shared.config));
   const view = saved ? shared?.viewState ?? saved.viewState : null;
   if (view) useCameraStore.getState().flyToState(view);
   if (sourceId !== undefined && canRestoreSplatSelection()) await activateSavedSplat(sourceId, assertCurrent);
   if (saved) applyShareConfig(restorationConfig(saved.config));      // whole camera + ui sections, after the download
   if (shared?.config) applyShareConfig(restorationConfig(shared.config));
   ```
   `applyShareConfig` writes each section whole: `useCameraStore.setState(config.camera)` at `:176-178` and `useUIStore.setState(config.ui)` at `:171-173`.

2. **Every published dataset carries every section.** `features/datasetPublishing/publicationSnapshot.ts:31` has `config: collectShareConfig()`. `buildShareConfigFromStoreStates` puts every persisted camera field (plus `selectedImageId` when set) into `camera` (`urlStateShareConfigPolicy.ts:86-90`). It also puts every persisted ui field into `ui`, including `axesCoordinateSystem` (`config/registry/definitions/ui.ts:126-131`, `persist: true`).

3. **Exact keys.** ShareConfig and YAML use *store* keys, via `getStoreKey` (`registry/index.ts:34-51` and `publishedViewerState.ts:22-26`). The camera section (`registry/definitions/camera.ts:20-259`) contains these keys:

   | Group | Store keys |
   |---|---|
   | Display | `showCameras`, `cameraDisplayMode`, `cameraScaleFactor`, `cameraScale`, `frustumColorMode`, `frustumSingleColor`, `frustumStandbyOpacity`, `frustumLineWidth`, `unselectedCameraOpacity` |
   | Navigation | `cameraMode` (registry key `mode`), `cameraProjection` (`projection`), `cameraFov` (`fov`), `horizonLock`, `autoRotateMode`, `autoRotateSpeed`, `flySpeed`, `wasdSpeed`, `flyTransitionDuration`, `pointerLock` |
   | Selection | `showSelectionHighlight`, `selectionColorMode`, `selectionColor`, `selectionAnimationSpeed`, `selectionPlaneOpacity`, plus `selectedImageId` |
   | Undistortion | `undistortionEnabled`, `undistortionMode` |
   | Other | `autoFovEnabled` |

   The task's suggested names (`cameraMode`, `cameraProjection`, `cameraFov`, `horizonLock`, `flyTransitionDuration`) are correct.

4. **How `flyToState` records its target.** It sets `flyToViewState`: `cameraStore.ts:207`, `flyToState: (flyToViewState) => set({ flyToViewState })`.
   - The trackball's view-state effect (`useTrackballFlyTo.ts:303-318`) reads `flyTransitionDuration` at that moment, builds the animation and clears the value.
   - Unit tests do not mount `TrackballControls`, so the value stays set. A store subscription therefore sees the exact navigation values present when the fly-to is requested.

5. **Hook order inside `TrackballControls.tsx`.** ViewResets (:172), ProjectionSync (:191), FlyTo (:202), U re-fly (:239-245), ModeSync (:247). React runs a component's passive effects in this order.

6. **Each camera field applied after a completed fly-to**, measured with the real hooks (`exp-r1/pivot.test.tsx`, `worldup.test.ts`):

   | Field | Effect when it changes after the fly-to | Evidence |
   |---|---|---|
   | `horizonLock` | **Resets the view.** The camera moves 7.8 units in the harness and the distance resets to the initial distance. | `useTrackballCameraLifecycle.ts:132-147`; harness |
   | `cameraProjection` | Swaps the camera object, copying the pose. ViewResets' target effect then moves the pivot to the scene centre (`:58-59`). ModeSync (camera dep) runs **after** it and re-derives the pivot from the pose (`trackballCameraLifecyclePolicy.ts:115-121`). Result in orbit mode: pose delta 0, pivot delta 0, first orbit update delta 0. **The reviewer's "pivot moves, first orbit snaps" does not reproduce.** Fly mode leaves the pivot at the scene centre; fly mode doesn't use it, and switching to orbit re-derives it. What remains: the camera type visibly switches after the download, and the orthographic frustum is sized from the restored distance (`trackballCameraLifecyclePolicy.ts:73-83`). | harness |
   | `cameraFov` | The FOV (zoom) jumps after the download. | `useTrackballProjectionSync.ts:68-70` |
   | `flyTransitionDuration` | The restore fly-to already ran with the visitor's duration, e.g. a publisher's 0 (instant) is ignored. | `useTrackballFlyTo.ts:303-318` |
   | `cameraMode` | No pose change in either order: ModeSync keeps the camera and re-derives the pivot. Applied late, it only switches controls under the user. | `useTrackballModeSync.ts:24-50` |
   | `autoRotateMode` / `autoRotateSpeed` | Auto-orbit starts after the download, so the view starts moving later, possibly while the user is interacting. | `useTrackballFrameLoop.ts:260-266` |
   | `undistortionEnabled` | Applied late in the same `setState` as `selectedImageId`, a U toggle with a selected panorama **flies to the panorama** and replaces the restored view. | `TrackballControls.tsx:231-245` |
   | `ui.axesCoordinateSystem` | Not a camera field, but it defines world up (`TrackballControls.tsx:84-92`). World up levels every horizon-locked fly-to frame, including the last one (`trackballFramePolicy.ts:80-100`). If `horizonLock` moves early but this stays late, the restored view comes out **rolled 180°** for, e.g., a `colmap` visitor viewing a +Y-up publication (harness). | `worldup.test.ts` |
   | `flySpeed`, `wasdSpeed`, `pointerLock` | Input handling only. | |
   | `autoFovEnabled` | Read only when the user flies to a camera (`useCameraFrustumNavigationHandlers.ts:183`). | |
   | `selectedImageId` alone; frustum, selection and `undistortionMode` display | No view change. | |

7. **The proposed order puts navigation in the same commit as the fly-to.** This was also the order before I1. It ends exactly at the saved view (`exp-r1/sametick.test.tsx`: position, quaternion and pivot deltas all 0). That holds for horizon lock on, for orthographic, and for orthographic + lock + fly mode. The reset effect runs before the fly-to effect, and the animation overwrites it.

8. **Who is affected.**
   - **Dataset links** (`?url=`, the URL dialog, Try-a-Toy) whose `colmapview.yaml` carries non-default navigation, when the restored splat downloads for longer than the fly-to.
   - **Not share links:** they apply their own config before the load (`App.tsx:81-85`).
   - **Navigation changed during the download:** the late re-application also reverts it. Turning horizon lock off during the download is undone, and the view resets again (RED test 3).

9. **RED at 15f1b69** (four tests):
   - `seen` = navigation was still at the visitor defaults at the fly-to;
   - `['off']` instead of `['flip']`;
   - `'on'` instead of `'off'`;
   - the loader cancel test sees `horizonLock: 'off'`.

### Root cause

I1 (`12d5ee2`) moved the fly-to ahead of the download. It left the fields the trackball reads to place, level and animate that view in the late, display-only phase, and it re-applies them a second time after the download.

### Fix

Apply navigation together with alignment, before the fly-to, and only once. The display phase skips the navigation fields.

**`src/hooks/useUrlState.ts`**

1. Import the A3 export:
   ```ts
   import { useCameraStore, useImageMetricsStore, useReconstructionStore, usePointCloudStore, useUIStore,
     useTransformStore, useRigStore, restorePointDisplayWithoutSplat } from '../store';
   ```
2. Add these module-level declarations above `resolveRestoredSplatSourceId`:
   ```ts
   /**
    * Settings the trackball reads while it places, levels or animates the restored view. Applied after
    * the fly-to, a horizon lock change resets the view to the default one, a U toggle with a selected
    * panorama flies to it, and the camera type, field of view, auto-orbit and world up change under it.
    */
   const VIEW_NAVIGATION_FIELDS: Readonly<Record<'camera' | 'ui', readonly string[]>> = {
     camera: ['cameraMode', 'cameraProjection', 'cameraFov', 'horizonLock', 'flyTransitionDuration',
       'autoRotateMode', 'autoRotateSpeed', 'undistortionEnabled'],
     ui: ['axesCoordinateSystem'],
   };

   /** The fields of a config section that are (keep) or are not (!keep) among `keys`; undefined when none. */
   function pickSectionFields(values: Record<string, unknown> | undefined, keys: readonly string[],
     keep: boolean): Record<string, unknown> | undefined {
     const picked = Object.entries(values ?? {}).filter(([key]) => keys.includes(key) === keep);
     return picked.length ? Object.fromEntries(picked) : undefined;
   }
   ```
3. In `applySavedViewerState`, replace `:111-133` (`restorationConfig` through the second late `applyShareConfig`):
   ```ts
     const restorationConfig = (config: ShareConfig): ShareConfig => {
       const restored: ShareConfig = {
         ...config,
         // Navigation went with the view; applying it again would undo a change made during the download.
         camera: pickSectionFields(config.camera, VIEW_NAVIGATION_FIELDS.camera, false),
         ui: pickSectionFields(config.ui, VIEW_NAVIGATION_FIELDS.ui, false),
       };
       if (config.splat) {
         // Apply the effective selection once, after merging saved and URL choices.
         restored.splat = { ...config.splat };
         delete restored.splat.activeSourceId;
       }
       return restored;
     };
     // Alignment, navigation and view must survive a cancelled splat download, and navigation must be in
     // place before the fly-to. Display waits for the splat: splat-tuned point styling on a scene left
     // without one can hide the points.
     const viewConfig = (config: ShareConfig): ShareConfig => ({
       ...(config.transform ? { transform: config.transform } : {}),
       ...(config.splat?.transform ? { splat: { transform: config.splat.transform } } : {}),
       camera: pickSectionFields(config.camera, VIEW_NAVIGATION_FIELDS.camera, true),
       ui: pickSectionFields(config.ui, VIEW_NAVIGATION_FIELDS.ui, true),
     });
     const sourceId = resolveRestoredSplatSourceId(saved, shared, autoSplatSourceId);
     assertCurrent();
     if (saved) applyShareConfig(viewConfig(saved.config));
     if (shared?.config) applyShareConfig(viewConfig(shared.config));
     const view = saved ? shared?.viewState ?? saved.viewState : null;
     if (view) useCameraStore.getState().flyToState(view);
     if (sourceId !== undefined && canRestoreSplatSelection()) await activateSavedSplat(sourceId, assertCurrent);
     // A choice made before or during activation wins over both saved and URL source selections.
     if (saved) applyShareConfig(restorationConfig(saved.config));
     if (shared?.config) applyShareConfig(restorationConfig(shared.config));
     // Display saved for a splat would hide the points of a scene that ended up without one.   (A3)
     if (!useReconstructionStore.getState().loadedFiles?.splatFile) restorePointDisplayWithoutSplat();
   ```
   The rest of the function (`if (sourceId !== undefined && canRestoreSplatSelection()) { … }`) is unchanged. `undefined` sections are harmless: `sanitizeShareConfig` skips non-records (`publishedViewerState.ts:80-82`).

4. **`src/store/index.ts`:** add `restorePointDisplayWithoutSplat,` to the `./reconstructionStore` export list (`:2-9`).

**Precedence.** Each phase applies saved then shared settings in one synchronous block, so the URL's navigation wins before the fly-to commits. Zustand notifies synchronously, and React renders once with the final values.

### Tests

**`src/hooks/useUrlState.test.ts`**, inside `describe('URL state sharing')`. It reuses `installSavedSplatSources`, `savedSplatState` and `viewState`, and existing imports cover everything.

```ts
  function stubPendingDownload() {
    let respond!: (response: Response) => void;
    // Like fetch: the restored splat's download rejects once its signal aborts.
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      respond = resolve;
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    })));
    return { respond: (response: Response) => respond(response) };
  }

  // flyToState writes flyToViewState; record what the trackball would read at that moment.
  function recordNavigationAtFlyTo() {
    const seen: Array<Record<string, unknown>> = [];
    const unsubscribe = useCameraStore.subscribe((state, previous) => {
      if (!state.flyToViewState || state.flyToViewState === previous.flyToViewState) return;
      const { cameraMode, cameraProjection, cameraFov, horizonLock, flyTransitionDuration, autoRotateMode,
        autoRotateSpeed, undistortionEnabled } = state;
      seen.push({ cameraMode, cameraProjection, cameraFov, horizonLock, flyTransitionDuration, autoRotateMode,
        autoRotateSpeed, undistortionEnabled, axesCoordinateSystem: useUIStore.getState().axesCoordinateSystem });
    });
    return { seen, unsubscribe };
  }

  it('applies the saved navigation settings before it flies to the saved view', async () => {
    installSavedSplatSources();
    stubPendingDownload();
    const saved = savedSplatState();
    saved.config.camera = { cameraMode: 'fly', cameraProjection: 'orthographic', cameraFov: 35, horizonLock: 'on',
      flyTransitionDuration: 0, autoRotateMode: 'cw', autoRotateSpeed: 1.5, undistortionEnabled: true, showCameras: false };
    saved.config.ui = { ...saved.config.ui, axesCoordinateSystem: 'opengl' };
    const { seen, unsubscribe } = recordNavigationAtFlyTo();
    try {
      const restoration = applySavedViewerState(saved, null);
      expect(seen).toEqual([{ cameraMode: 'fly', cameraProjection: 'orthographic', cameraFov: 35, horizonLock: 'on',
        flyTransitionDuration: 0, autoRotateMode: 'cw', autoRotateSpeed: 1.5, undistortionEnabled: true,
        axesCoordinateSystem: 'opengl' }]);
      // Frustum and point display still wait for the splat.
      expect(useCameraStore.getState().showCameras).toBe(true);
      expect(useUIStore.getState().backgroundColor).not.toBe('#123456');
      await useReconstructionStore.getState().selectSplatSource('');
      await restoration;
    } finally { unsubscribe(); }
  });

  it("lets the viewer URL's navigation win over the saved one at the fly-to", async () => {
    installSavedSplatSources();
    stubPendingDownload();
    const saved = savedSplatState();
    saved.config.camera = { horizonLock: 'on' };
    const { seen, unsubscribe } = recordNavigationAtFlyTo();
    try {
      const restoration = applySavedViewerState(saved, { config: { camera: { horizonLock: 'flip' } } });
      expect(seen.map(values => values.horizonLock)).toEqual(['flip']);
      await useReconstructionStore.getState().selectSplatSource('');
      await restoration;
      expect(useCameraStore.getState().horizonLock).toBe('flip');
    } finally { unsubscribe(); }
  });

  it('keeps a navigation change made while the restored splat downloads', async () => {
    installSavedSplatSources();
    const download = stubPendingDownload();
    const saved = savedSplatState();
    saved.config.camera = { horizonLock: 'on', showCameras: false };
    const restoration = applySavedViewerState(saved, null);
    useCameraStore.getState().setHorizonLock('off');
    download.respond(new Response(new Blob(['splat']), { status: 200 }));
    await restoration;
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeDefined();
    expect(useCameraStore.getState().horizonLock).toBe('off');
    // Display still lands once the splat is in.
    expect(useCameraStore.getState().showCameras).toBe(false);
  });
```

**`src/hooks/useUrlLoader.test.ts:615`**: extend `'keeps the saved alignment, view and Reload settings when the restored splat download is cancelled'`. Rename it to `'… alignment, navigation, view …'`.

```ts
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: view,
      config: { splat: { transform: alignment }, ui: { backgroundColor: '#123456' },
        camera: { horizonLock: 'on', cameraProjection: 'orthographic', showCameras: false } } });
    ...
    processFilesMock.mockImplementationOnce(async (files, _range, options) => {
      options?.onSceneReplaced?.();            // A4 needs this; harmless before A4
      useReconstructionStore.getState().setDroppedFiles(files);
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles());
    });
    ...
    // Navigation went with the view; frustum and point display waited for the splat.
    expect(useCameraStore.getState()).toMatchObject({ horizonLock: 'on', cameraProjection: 'orthographic', showCameras: true });
    expect(useUIStore.getState().backgroundColor).toBe(background);
```

All four tests are RED at 15f1b69. Copies are in `exp-r1/red/urlState.test.ts` and `exp-r1/red/urlLoaderCancel.test.ts`.

A `TrackballControls`-level regression test would need R3F. If wanted, the scratchpad harness (`renderHook` with `useTrackballViewResets` → `useTrackballProjectionSync` → `useTrackballFlyTo` → `useTrackballModeSync`) can pin "horizon lock in the same commit as the fly-to ends at the saved view" without a Canvas. I don't recommend it: it pins internal hook order.

### Risks/interactions

- **Spherical datasets with a saved panorama selection** behave differently from before I1. With `undistortionEnabled` early and the selection late, a differing U no longer re-flies to the panorama, so the saved view wins. Before I1, the image fly-to replaced it.
- **Orthographic frustum.** It is sized from the pre-fly-to distance again, as before I1. The scale-based ortho frustum was never reproduced exactly anyway: `orthoZoom` is not saved.
- **Navigation now survives a cancelled restore download** (like alignment and view), and **user changes made during the download stick.**
- **Share links.** They apply the link config at startup and again early; this is idempotent.
- **A3.** Its re-application line sits in the same block (same task).
- **A8.** Reload calls this with the splat choice stripped, so there is no await, and navigation and display land together.
- **`flySpeed`, `wasdSpeed`, `pointerLock`** stay in the late phase. They are input-only; adding them early would also be harmless.

---

## A2: The settings-timeout warning survives `clear()`

### Verified

- **The warning module.** `src/hooks/optionalSettingsWarning.ts:4-16` keeps a module-level `warningId`. `show` replaces any earlier warning, and `dismiss` removes it.
- **When it is dismissed.** Only when a load starts: `useUrlLoader.ts:103-104` (`runLoad`) and `useFileDropzone.ts:30-32` (`beginLocalLoad`).
- **`clear()` ignores it.** `reconstructionStore.ts:630-665` never touches the warning.
- **How production reaches `clear()`.** Only through I2's splat-only cancel fallback (`reconstructionStore.ts:606-611`). `resetSession` is called only by `Scene3DE2EProbe.tsx:503`, and `clearReconstruction` has no caller.
- **No race with the warning.** The warning is raised only after the scene commit: `urlLoaderManifestSource.ts:89-95`, where `settle()` runs after `processFiles`; and `useUrlLoader.ts:70-74`, after the splat or archive load. So a `clear()` can never pre-empt its own load's warning.
- **RED:** 2 tests (the warning is still listed). The guard test passes.

### Root cause

The warning's lifetime is tied to "the next load", not to the scene it describes.

### Fix

**`src/store/reconstructionStore.ts`**
```ts
import { dismissOptionalSettingsTimeoutWarning } from '../hooks/optionalSettingsWarning';
...
  clear: () => {
    cancelPendingSplatLoad();
    get().urlLoadController?.abort();
    cancelPendingReconstructionLoad();
    clearActiveZipArchive();
    // The warning describes the scene being cleared.
    dismissOptionalSettingsTimeoutWarning();
    ...
```

**Layering.**
- The store already imports leaf modules from `src/hooks` (`urlLoaderPolicy` and `useIsTouchDevice`, at `reconstructionStore.ts:31-35`), and no boundary test forbids `store → hooks`.
- `optionalSettingsWarning.ts` currently imports its message from `urlLoaderViewerState.ts`. That would pull zod, js-yaml, the config registry and the settings-fetch code into the store's import graph. I checked: it does **not** create a cycle.
- To keep the new edge a leaf, move the constant to the module that uses it.

**`src/hooks/optionalSettingsWarning.ts`**
```ts
import { useNotificationStore } from '../store/stores/notificationStore';

export const OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE =
  "This dataset's saved view settings (colmapview.yaml) did not load in time, so default settings are shown. Load the dataset again to retry.";

// The warning describes the dataset on screen, so the next load or clearing the scene takes it down.
let warningId: string | null = null;
```

**`src/hooks/urlLoaderViewerState.ts`:** delete `:12-13` (the constant).

**Test imports:** `useUrlLoader.test.ts:21`, `useFileDropzone.test.ts:11-12` and `optionalSettingsWarning.test.ts:3-4` now import `OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE` from `./optionalSettingsWarning`.

I considered and rejected an alternative: a store subscription inside `optionalSettingsWarning.ts`, which would keep the `hooks → store` direction. It adds more mechanism for one call site.

### Tests

**`src/store/reconstructionStore.test.ts`**: a new describe. Imports: `useNotificationStore` from `./stores/notificationStore`; `dismissOptionalSettingsTimeoutWarning`, `OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE` and `showOptionalSettingsTimeoutWarning` from `../hooks/optionalSettingsWarning`.

```ts
describe('reconstruction store settings timeout warning', () => {
  const timeoutWarnings = () => useNotificationStore.getState().notifications
    .filter(notification => notification.message === OPTIONAL_VIEWER_SETTINGS_TIMEOUT_MESSAGE);

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  afterEach(() => {
    useReconstructionStore.getState().clear();
    dismissOptionalSettingsTimeoutWarning();
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    window.history.replaceState(null, '', '/');
  });

  it('takes the warning down with the scene it describes', () => {
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), loadedFiles: baseLoadedFiles({}) });
    showOptionalSettingsTimeoutWarning();
    useReconstructionStore.getState().clear();
    expect(timeoutWarnings()).toEqual([]);
  });

  it('takes the warning down when cancelling returns to the landing page', () => {
    window.history.replaceState(null, '', '/?url=https%3A%2F%2Fexample.com%2Fscene.spz');
    const splat = new File(['a'], 'scene.spz');
    useReconstructionStore.getState().setLoadedFiles({ imageFiles: new Map(), hasMasks: false,
      splatFile: splat, splatFiles: [splat], splatFileSources: [{ id: 'scene.spz', path: 'scene.spz', file: splat }] });
    useReconstructionStore.setState({ reconstruction: buildReconstruction(), urlLoading: true,
      urlProgress: getSplatLoadingProgress(splat, { startPercent: 60 }) });
    showOptionalSettingsTimeoutWarning();
    useReconstructionStore.getState().cancelLoading();
    expect(useReconstructionStore.getState().loadedFiles).toBeNull();
    expect(timeoutWarnings()).toEqual([]);
  });

  it('keeps the warning while its scene stays on screen', () => {
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({ splatFile: fileA, splatFiles: [fileA],
      splatFileSources: [{ id: 'splats/a.ply', path: 'splats/a.ply', file: fileA }] }));
    useReconstructionStore.setState({ urlLoading: true, urlProgress: getSplatLoadingProgress(fileA, { startPercent: 60 }) });
    showOptionalSettingsTimeoutWarning();
    useReconstructionStore.getState().cancelLoading();
    expect(timeoutWarnings()).toHaveLength(1);
  });
});
```

The first two are RED at 15f1b69; the third is a guard. All three are GREEN on the patched copy.

### Risks/interactions

- **Test cleanup.** `afterEach` blocks that call `clear()` now also dismiss the warning. That is harmless.
- **A6.** It does not touch this path: `cancelLoading`'s fallback still calls `clear()`.
- **Regressions.** None: in the copy, 27 affected files (362 tests) and the full suite pass.

---

## A3: A splat-tuned display left on a scene with no splat

### Verified

**The visibility problem is real.**

- `pointCloudRenderPolicy.ts:30-48` still renders point geometry when `!splatFile`.
- For the overlay modes (`splatPoints` and `splatRainbowPoints`), `getPointGeometryLayerProps` (`:78-93`) turns off vertex colours and the depth test.
- `PointCloud.tsx:167-181` then uses:
  - `size={pointSize}` with `sizeAttenuation={false}`;
  - `opacity={pointOpacity}`;
  - a blinking `selectionColor`.
- With the splat preset (`reconstructionStore.ts:37-38,50-55`: size 1, opacity 0.2), the result is **1-pixel points at 20 % opacity in one blinking colour**. In `'splats'` mode they are RGB, but still 1 px at 0.2.

**The colour-mode fallback does not handle it.**

- `restorePointDisplayForSplatlessDataset` (`reconstructionStore.ts:68-75`) runs only from `setLoadedFiles`, and only when the dataset has no splat data at all (`:336-343`). Listed but inactive sources keep the mode by design (test `reconstructionStore.test.ts:257`).
- `selectSplatSource('')` (`:430-438`) and `cancelLoading`'s decode branch (`:622-626`) never touch the display.
- `setShowSplats(false)` would map the mode back (`pointCloudStore.ts:55-68`), but nothing calls it on these paths.
- `applySavedViewerState` re-applies the saved display (`useUrlState.ts:132-133`) whether or not a splat ended up active. That covers Reload (`useFileDropzone.ts:145-153` → workflow `complete()`), a failed restore download, and a restore skipped on touch.

**Scenarios:**
1. Pick None after a splat was active. This already happens today: every splat activation applies the preset.
2. Cancel the renderer's decode.
3. Reload with no splat on screen when the retained settings are splat-tuned.
4. The restore download fails, or touch skips it.

**RED:**
- `selectSplatSource('')` and the decode cancel leave `splatPoints/1/0.2`.
- `applySavedViewerState` leaves the saved `splatPoints/1/0.2`.
- The COLMAP-only guard passes.

### Root cause

The fallback rule exists only for "a dataset without any splat loads". The COLMAP-only transitions and the late re-application never apply it.

### Fix

**The rule:** *with no splat showing, a splat colour mode falls back to the plain display.* It applies in two places.

1. **The COLMAP-only transition.** The A6 helper `showColmapOnly` calls `restorePointDisplayWithoutSplat()` (code under A6). It covers None and the decode cancel.
2. **After `applySavedViewerState` applies display:** `if (!…loadedFiles?.splatFile) restorePointDisplayWithoutSplat();` (code under A1, step 3).

Rename the function and export it from `reconstructionStore.ts` with an updated doc comment. Update its call in `setLoadedFiles` (`:342`) as well.

```ts
/**
 * Inverse of applySplatPointDisplayDefaults, for a scene with no splat showing: a splat-less
 * dataset loads, the splat is deactivated (COLMAP only), or saved display settings land without
 * their splat. The splat preset — a splat color mode AND the shrunken point size/opacity (1 / 0.2),
 * persisted across sessions — would render the COLMAP points as tiny, near-invisible dots. Drops the
 * splat color mode back to RGB (setShowSplats(false) maps a splat mode to 'rgb' and keeps showSplats
 * in sync) and restores the plain point size/opacity defaults. No-op unless the current mode is
 * actually a splat mode, so a user's own non-splat size/opacity choices are preserved.
 */
export function restorePointDisplayWithoutSplat(): void { /* body unchanged */ }
```

Export it through `src/store/index.ts` (see A1, step 4).

**It never fights a saved COLMAP-only display:**
- Point (1) runs *before* the saved display is applied. `activateSavedSplat('')` precedes the display phase. `applyShareConfig`'s `''` branch calls `selectSplatSource` synchronously, before `config.pointCloud` is set (`useUrlState.ts:152-168`).
- Point (2) is a no-op for non-splat modes. The guard test `'keeps a saved COLMAP-only display'` passes before and after the fix.

**Rejected:** downgrading in `setLoadedFiles` whenever no splat is active. That would drop the visitor's splat mode during deferred auto-loads and the picker flow.

### Tests

**`src/store/reconstructionStore.test.ts`, in `describe('reconstruction store lazy splat source switching')`:**
```ts
  it('drops the splat point preset when None leaves the points without a splat', async () => {
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({ splatFile: fileA, splatFiles: [fileA],
      splatFileSources: [{ id: 'splats/a.ply', path: 'splats/a.ply', file: fileA }] }));
    expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'splatPoints', pointSize: 1, pointOpacity: 0.2 });

    await useReconstructionStore.getState().selectSplatSource('');

    expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'rgb', showSplats: false, pointSize: 2, pointOpacity: 1 });
  });

  it('keeps a non-splat point display when None is chosen', async () => {
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({ splatFile: fileA, splatFiles: [fileA],
      splatFileSources: [{ id: 'splats/a.ply', path: 'splats/a.ply', file: fileA }] }));
    usePointCloudStore.setState({ colorMode: 'error', showSplats: false, pointSize: 5, pointOpacity: 0.9 });

    await useReconstructionStore.getState().selectSplatSource('');

    expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'error', pointSize: 5, pointOpacity: 0.9 });
  });
```

**`src/store/reconstructionStore.test.ts`, in `describe('reconstruction store loading cancellation')`.** This test also pins A6's `urlError` decision.
```ts
  it("drops the splat point preset and a stale error when the renderer's decode is cancelled", () => {
    const fileA = new File(['a'], 'a.ply');
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({ splatFile: fileA, splatFiles: [fileA],
      splatFileSources: [{ id: 'splats/a.ply', path: 'splats/a.ply', file: fileA }] }));
    useReconstructionStore.setState({ urlLoading: true, urlProgress: getSplatLoadingProgress(fileA, { startPercent: 60 }),
      urlError: { type: 'network', message: 'Failed to load splat' } });

    useReconstructionStore.getState().cancelLoading();

    expect(useReconstructionStore.getState().urlError).toBeNull();
    expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'rgb', pointSize: 2, pointOpacity: 1 });
  });
```

**`src/hooks/useUrlState.test.ts`** (Task 2):
```ts
  it('falls back to the plain point display when saved splat display lands on a scene without a splat', async () => {
    installSavedSplatSources();
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { pointCloud: { colorMode: 'splatPoints', pointSize: 1, pointOpacity: 0.2 } } };
    await applySavedViewerState(saved, null);
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'rgb', pointSize: 2, pointOpacity: 1 });
  });

  it('keeps a saved COLMAP-only display', async () => {
    installSavedSplatSources();
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: '' }, pointCloud: { colorMode: 'error', pointSize: 4, pointOpacity: 0.7 } } };
    await applySavedViewerState(saved, null);
    expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'error', pointSize: 4, pointOpacity: 0.7 });
  });
```

**`src/hooks/fileDropzoneWorkflow.test.ts`** (Task 3, the Reload integration; it needs Tasks 1–3):
```ts
  it('shows the points normally when Reload re-applies splat-tuned display with no splat on screen', async () => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    const a = new File(['aa'], 'a.spz');
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, file(name)]));
    files.set('a.spz', a);
    useReconstructionStore.getState().setLoadedFiles(loadedFiles({ splatFile: a, splatFiles: [a],
      splatFileSources: [{ id: 'a.spz', path: 'a.spz', file: a }] }));
    await useReconstructionStore.getState().selectSplatSource('');
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { pointCloud: { colorMode: 'splatPoints', pointSize: 1, pointOpacity: 0.2 } } };
    const deps = createDeps({
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      setLoadedFiles: useReconstructionStore.getState().setLoadedFiles,
      parseFiles: vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false })),
      buildReconstruction: vi.fn(async () => ({ reconstruction: createReconstruction(), pointCount: 0 })),
    });
    try {
      await expect(processFileDropzoneFiles(files, deps, { reload: true, viewerState: saved,
        onViewerState: viewerState => applySavedViewerState(viewerState, null) })).resolves.toBe(true);
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
      expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'rgb', pointSize: 2, pointOpacity: 1 });
    } finally { useReconstructionStore.getState().clear(); }
  });
```

**Status:**
- The store tests: 2 RED + 1 guard at 15f1b69, all GREEN on the copy.
- The `useUrlState` tests: 1 RED + 1 guard at 15f1b69 (GREEN not run; see the header).

### Risks/interactions

- **Lost custom sizes.** A user who picks None while in a splat mode loses any custom point size or opacity; it resets to 2 / 1. This is the same rule as a splat-less load.
- **Activation after None.** Picking a splat after None applies the splat preset again. That is unchanged: activation visuals already did this.
- **Mid-restore cancel.** The saved display is still not applied when the restore download is cancelled (I1's deferral). Applying it earlier would not help: activation visuals override it when the splat arrives.
- **Existing expectations.** Loader tests that assert `pointSize` after a touch-skipped restore keep passing: the visitor's mode there is `rgb`, so the rule is a no-op. The copy ran them.
- **A6.** It hosts the helper. **A1** shares the function with the re-application line. **A8** keeps None on Reload, so the re-application rule is what makes that scene visible.

---

## A4: The URL loader records settings for a scene it didn't commit

### Verified

- **Unconditional recording** (`useUrlLoader.ts:161-164`):
  ```ts
  if (loaded) {
    useReconstructionStore.getState().setSourceViewerState(savedViewerState);
  ```
- **Binding to the current file map.** `setSourceViewerState` binds to the current `droppedFiles` (`reconstructionStore.ts:360-363`); `setDroppedFiles` drops the binding when the map changes (`:354-358`).
- **The merge path.** `updateLoadedSplatFile` (`fileDropzoneWorkflow.ts:120-148`) calls only `setLoadedFiles`: no `setDroppedFiles` and no `onSceneReplaced`.
  - It is reached at `:398-407` and `:438-445` when `!replaceSplatScene` and a scene is open.
  - Archive and Drive sources pass no `replaceSplatScene` (`urlLoaderZipSource.ts:96-98`).
  - Splat URLs pass `true` (`urlLoaderSplatSource.ts:104`).
  - Manifests never carry splat files (`deferSplatDownloads`).
- **Every commit that installs a new file map reports `onSceneReplaced`:**
  - COLMAP: `:549-550`;
  - images-only: `:454`, `:471`;
  - point-cloud-only: `:228-230`;
  - new splat-only: `:404-405`, `:479-480`.
- **Latent.** URL entry points render only when `!reconstruction` (`DropZone.tsx:231`, `:247`), and startup loads have no scene.
- **RED** in both cases: the binding is replaced by the merge's settings, or wiped (`null`).

### Root cause

Recording is keyed on "the load succeeded", not on "the load committed its own file map".

### Fix

**`src/hooks/useUrlLoader.ts`**
```ts
interface UrlLoadContext {
  ...
  remoteCatalogMerged: boolean;
  /** This load committed its own file map (not a splat merged into the open scene). */
  sceneReplaced: boolean;
}
...
          onSceneReplaced: guard(() => {
            clearAllCaches();
            load.clearCachesOnFailure = true;
            load.sceneReplaced = true;
            options?.onSceneReplaced?.();
          }),
...
      remoteCatalogMerged: false,
      sceneReplaced: false,
...
        // Reload re-reads the downloaded files; these settings are not among them. Recorded before
        // restoration so a cancelled splat download still leaves them to Reload. They bind to the
        // current file map, so only a load that committed its own may record them: a splat merged
        // into the open scene must neither take over nor drop that scene's settings.
        if (load.sceneReplaced) useReconstructionStore.getState().setSourceViewerState(savedViewerState);
```

I did not reuse `clearCachesOnFailure` as the flag, even though it currently has the same truth value: it serves a different concern.

### Tests

**`src/hooks/useUrlLoader.test.ts`.** Add `import type { PublishedViewerState } from '../utils/publishedViewerState';`. `archiveSource`, `buildLoadedFiles` and `NodeBlob` are already imported.

```ts
  it.each([
    ['its own settings', 'ui:\n  background_color: "#abcdef"\n'],
    ['no settings', null],
  ] as const)("leaves the open dataset's Reload settings alone when a load only merges into its scene (%s)", async (_label, yaml) => {
    vi.stubGlobal('Blob', NodeBlob);
    const openFiles = new Map([['sparse/0/cameras.bin', new File(['c'], 'cameras.bin')]]);
    const openSettings: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { ui: { backgroundColor: '#123456' } } };
    const store = useReconstructionStore.getState();
    store.setDroppedFiles(openFiles);
    store.setLoadedFiles(buildLoadedFiles());
    store.setSourceViewerState(openSettings);
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => yaml && String(url).endsWith('colmapview.yaml')
      ? new Response(yaml) : new Response(null, { status: 404 })));
    vi.spyOn(archiveSource, 'loadZipUrlSource').mockImplementation(async (_url, deps) =>
      (await deps.processFiles(new Map([['scene.spz', new File(['s'], 'scene.spz')]]), undefined, { throwOnError: true })) !== false);
    // Like updateLoadedSplatFile: the splat joins the open scene; no new file map, no onSceneReplaced.
    processFilesMock.mockImplementationOnce(async files => {
      const splat = files.get('scene.spz')!;
      const loaded = useReconstructionStore.getState().loadedFiles!;
      useReconstructionStore.getState().setLoadedFiles({ ...loaded, splatFile: splat, splatFiles: [splat] });
    });
    const { result } = renderHook(() => useUrlLoader({ logger: { info: vi.fn(), error: vi.fn() } }));

    await act(async () => { expect(await result.current.loadFromUrl('https://example.com/splats.zip')).toBe(true); });

    expect(useReconstructionStore.getState().droppedFiles).toBe(openFiles);
    expect(useReconstructionStore.getState().sourceViewerState).toEqual({ files: openFiles, state: openSettings });
  });
```

**Required edits to existing tests.** The `processFilesMock` implementations at `useUrlLoader.test.ts:636` and `:664` commit a file map without reporting it, which the real workflow never does. Change them to:
```ts
    processFilesMock.mockImplementationOnce(async (files, _range, options) => {
      options?.onSceneReplaced?.();
      useReconstructionStore.getState().setDroppedFiles(files);
      useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles());
    });
```
Without this change those two tests fail. That was verified: the loader suite then passes all 58 tests.

### Risks/interactions

- **Mocks.** A test mock that commits files without calling `onSceneReplaced` no longer records settings. Only the two mocks above exist.
- **Merge behaviour.** A merge that brings its own settings still applies them to the open scene, as today; it just isn't retained for Reload.
- **Sibling latent issue, out of scope.** `loadZipUrlSource` still runs `commitSource()` after a merge (`urlLoaderZipSource.ts:101`). That replaces the open scene's source info and active archive.
- **Test-file overlap.** `useUrlLoader.test.ts` is also touched by A1 and A2.

---

## A5: The size-check HEAD swallows `HfError`

### Verified

- **The swallowing catch.** `utils/zipValidation.ts:67-77` returns `{ valid: true }` for everything except an `AbortError`.
- **The HEAD request** goes through the token-aware fetch (`zipLoader.ts:279-282`, `fetchDatasetResource` → `fetchHuggingFaceDatasetRequest`).
- **What the HEAD sees.** `features/huggingface/datasetAccess.ts:26-30`: an authenticated `401` → `hfAuth.expire()` → `throw new HfError('Your Hugging Face connection expired. …', 401)`.
- **What the download sees after expiry.** An anonymous `401`, no token → `HfError('Sign in with Hugging Face to open private datasets, then retry the URL.')` (`:48-56`). So the user sees the wrong message.
- **Reachability.**
  - The access check runs first (`useUrlLoader.ts:216-221`) and would already surface the expiry.
  - It does not when it hit a transient 408/429/5xx (`datasetAccess.ts:91-94`), or when the token expires between the two requests.
  - The 403 and "Sign in" `HfError`s are also swallowed, but the download raises the same message again. Only the 401 expiry changes what the user sees.
- **RED:**
  - unit: `"promise resolved "{ valid: true }" instead of rejecting"`;
  - integration: the load went past the size check.

### Fix

**`src/utils/zipValidation.ts`.** There is precedent for `utils` importing `features/huggingface`: `utils/fetchDatasetResource.ts:1`.
```ts
import { HfError } from '../features/huggingface/http';
...
  } catch (err) {
    clearTimeout(timeoutId);
    options.signal?.throwIfAborted();
    // The signed-in account's answer (expired, denied, sign-in needed) decides the download too.
    if (err instanceof HfError) throw err;

    if (err instanceof Error && err.name === 'AbortError') {
      return { valid: false, error: 'Size check timed out' };
    }
    // On HEAD failure (CORS, etc.), allow the download attempt.
    return { valid: true };
  }
```

**Alternative (the ledger's):** "rethrow everything except TypeError/AbortError". I didn't choose it because it changes behaviour for unknown error kinds.

### Tests

**`src/utils/zipValidation.test.ts`.** Add `import { HfError } from '../features/huggingface/http';`.
```ts
  it('rethrows a Hugging Face account answer from the size check', async () => {
    const error = new HfError('Your Hugging Face connection expired. Sign in again to open private datasets.', 401);
    const fetchImpl = vi.fn<FetchImpl>().mockRejectedValue(error);
    await expect(validateZipUrl('https://huggingface.co/datasets/owner/private/resolve/main/a.zip', { fetchImpl }))
      .rejects.toBe(error);
  });
```
Keep `'allows URL downloads to proceed when HEAD fails for reasons other than timeout'` (TypeError) and the timeout test as they are.

**`src/utils/zipLoader.test.ts`**, in `describe('private Hugging Face archive URLs')`. It reuses `colmapEntries` and `buildArchiveReader`. With the mocks below, today's code *resolves*, which makes the RED unambiguous.
```ts
  it('reports an expired connection from the size check instead of downloading anonymously', async () => {
    const url = 'https://huggingface.co/datasets/owner/private/resolve/main/scene.zip';
    vi.spyOn(hfAuth, 'getSnapshot').mockReturnValue({ status: 'connected', identity: { username: 'owner' }, error: null });
    vi.spyOn(hfAuth, 'getReadAccessToken').mockReturnValue('expired-token');
    const expire = vi.spyOn(hfAuth, 'expire').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));
    vi.mocked(downloadZip).mockClear();
    vi.mocked(downloadZip).mockResolvedValue(new Blob(['archive']));
    vi.mocked(Archive.open).mockResolvedValue(buildArchiveReader({ getFilesArray: async () => colmapEntries() }));

    await expect(loadZipFromUrl(url, vi.fn())).rejects.toMatchObject({ name: 'HfError', status: 401,
      message: expect.stringContaining('connection expired') });
    expect(expire).toHaveBeenCalledOnce();
    expect(downloadZip).not.toHaveBeenCalled();
  });
```

Both tests are RED at 15f1b69 and GREEN on the copy. The four zip suites (51 tests) pass.

### Risks/interactions

None notable. The loader already classifies `HfError` messages (`urlLoaderErrorHandling.ts:75-77`). The Drive flow never takes this path: it supplies the size, so `validateArchiveSize` runs instead.

---

## A6: Two copies of the "COLMAP only" transition

### Verified

**The None branch** (`reconstructionStore.ts:430-438`):
```ts
if (!source) {
  set({ requestedSplatSourceId: null, loadedFiles: clearActiveSplatFile(loadedFiles),
    urlLoading: false, urlProgress: null, urlError: null });
  return;
}
```
The revision bump is separate (`:418`): `if (!options?.restore) set({ splatSelectionRevision: … + 1 })`.

**The cancel decode branch** (`:617-627`):
```ts
set({ urlLoading: false, urlLoadActive: false, urlLoadController: null, urlProgress: null,
  ...(cancelsRendererDecode && loadedFiles ? { loadedFiles: clearActiveSplatFile(loadedFiles),
    requestedSplatSourceId: null, splatSelectionRevision: splatSelectionRevision + 1 } : {}) });
```
This copy does **not** clear `urlError`.

### Fix

**`src/store/reconstructionStore.ts`.** Import `type StoreApi` from `zustand`. Add the helper next to A7's:
```ts
/**
 * "COLMAP only": the splat is deactivated (its source stays listed; re-fetchable bytes are
 * dropped), nothing is pending for it, and its loading state goes. The splat point preset goes
 * too: with no splat to draw it would hide the points.
 */
function showColmapOnly(set: StoreApi<ReconstructionState>['setState'], loadedFiles: LoadedFiles,
  patch: Partial<ReconstructionState> = {}): void {
  set({ ...patch, loadedFiles: clearActiveSplatFile(loadedFiles), requestedSplatSourceId: null,
    urlLoading: false, urlProgress: null, urlError: null });
  restorePointDisplayWithoutSplat();
}
```

**In `selectSplatSource`:**
```ts
    // Empty selection -> "COLMAP only". Clearing the indicator too keeps a superseded lazy
    // fetch from leaving the loading overlay stuck (nothing is left to render that would reset it).
    if (!source) {
      showColmapOnly(set, loadedFiles);
      return;
    }
```

**In `cancelLoading`**, which keeps one `set` per path:
```ts
    const stopped = { urlLoading: false, urlLoadActive: false, urlLoadController: null, urlProgress: null };
    // The user's explicit "COLMAP only", exactly like choosing None in the picker.
    if (cancelsRendererDecode && loadedFiles) {
      showColmapOnly(set, loadedFiles, { ...stopped, splatSelectionRevision: splatSelectionRevision + 1 });
    } else {
      set(stopped);
    }
```
(`urlProgress` is no longer destructured in `cancelLoading`; A7 reads it.)

**Decision: cancel clears `urlError`.**
- **Same intent.** It is the same transition and the same user intent as the picker's None, which clears it.
- **The value could only be stale.** While the renderer decodes, the slot can hold only a stale value:
  - renderer failures are notifications, not `urlError` (`SplatLayer.tsx:319-327`);
  - download failures set `urlLoading: false`, so they cannot overlap a decode overlay (`:557-566`);
  - URL loads clear the slot at start (`useUrlLoader.ts:151`).
  - However, local loads never clear it, so a stale "Failed to load splat" from an earlier tile can survive into a local drop's decode.
- **No visible downside.** The only reader is `useDropZoneStoreFacade.ts:34` (`hasUrlLoadRequest = hasUrlToLoad() && !urlError`). It gates landing panels that render only without a scene.
- **Pinned by** the A3 cancel test (`urlError` → `null`).

### Tests

The existing pins cover it, and all pass on the copy:
- `reconstructionStore.test.ts:742` (None);
- `:707` (None supersedes a download);
- `:1321` (the decode cancel, including the revision bump and `requestedSplatSourceId`);
- `:1370` and `:1387` (the splat-only fallback, and the gallery / point-cloud kept);
- `:536` (revision bookkeeping).

New: the A3 tests, which also assert `urlError`.

### Risks/interactions

- **Two notifications.** `showColmapOnly` writes to a second store (point cloud) after `set`, so subscribers see two notifications. React batches them, and no subscriber depends on the pair.
- **A3 lives in this helper.** A7 shares the function bodies (same task).

---

## A7: Two copies of the "renderer owns the progress" rule

### Verified

- **In `selectSplatSource`** (`reconstructionStore.ts:419-421, 444-446`):
  ```ts
  const hadPendingDownload = activeSplatController !== null;
  cancelPendingSplatLoad();
  ...
  const rendererOwnsProgress = !hadPendingDownload && source.file === loadedFiles.splatFile
    && isSplatLoadingProgressForFile(get().urlProgress, source.file);
  ```
- **In `cancelLoading`** (`:604-605`, computed before `cancelPendingSplatLoad()` at `:612`):
  ```ts
  const cancelsRendererDecode = !activeSplatController && isSplatLoadingProgressForFile(urlProgress, loadedFiles?.splatFile);
  ```

### Fix

```ts
/**
 * With no tile download pending, splat-loading progress for the active file is the renderer's: it is
 * still decoding that file. A pending download's progress never is, even for a same-named file, so
 * ask before cancelPendingSplatLoad() forgets the download.
 */
function rendererOwnsSplatProgress({ urlProgress, loadedFiles }: Pick<ReconstructionState, 'urlProgress' | 'loadedFiles'>): boolean {
  return activeSplatController === null && isSplatLoadingProgressForFile(urlProgress, loadedFiles?.splatFile);
}
```

**In `selectSplatSource`:**
```ts
    if (!options?.restore) set({ splatSelectionRevision: get().splatSelectionRevision + 1 });
    const rendererDecoding = rendererOwnsSplatProgress(get());
    cancelPendingSplatLoad();
    ...
      const rendererOwnsProgress = rendererDecoding && source.file === loadedFiles.splatFile;
```

**In `cancelLoading`:**
```ts
    // Cancelling the renderer's decode leaves the scene without the splat (COLMAP only).
    const cancelsRendererDecode = rendererOwnsSplatProgress(get());
```

**Why the semantics are identical:**
- Both reads happen before `cancelPendingSplatLoad()`.
- The only write in between is the `splatSelectionRevision` bump, which touches neither `urlProgress` nor `loadedFiles`.
- The original's post-cancel `get().urlProgress` sees the same value: `cancelPendingSplatLoad()` only aborts, and `onDownloadProgress` ignores aborted signals.
- Together with `source.file === loadedFiles.splatFile`, `isSplatLoadingProgressForFile(p, loadedFiles.splatFile)` ≡ `isSplatLoadingProgressForFile(p, source.file)`.

### Tests

The existing pins, all passing on the copy:
- `reconstructionStore.test.ts:464` ("keeps the renderer progress when the restored splat is the one already decoding");
- `:479` ("still clears a superseded download indicator…");
- `:496` ("clears the indicator of a download it cancels, even when the file names match");
- `:1342` ("cancels a same-named tile download without dropping the splat on screen");
- `:1321`.

Suggested mutation check: drop `activeSplatController === null` from the helper. `:496` and `:1342` must fail.

### Risks/interactions

None beyond A6: same functions, same task.

---

## A8: Reload should keep the splat state that is on screen

### Verified

- **The workflow's default.** It picks `splatFiles[0]` (`fileDropzoneWorkflow.ts:335`). The only Reload-aware step is `carryOverRemoteSplatSources` (`:539-543`; `splatFileSourcePolicy.ts:270-289`), and it keeps the active splat only when it is a carried *remote* tile.
- **A local pick is lost on the second Reload.**
  - Picking a local splat sets `requestedSplatSourceId` (`reconstructionStore.ts:447-451`).
  - The first Reload commit re-picks it via `getLoadedFilesWithActiveSplatSource` and clears it (`:316-319`, `:348-351`).
  - The second Reload commits `splatFiles[0]` and hands it to the renderer (`fileDropzoneWorkflow.ts:595-597`).
- **None with local splats.** The workflow default `splatFiles[0]` wins.
- **A project's own `colmapview.yaml` switches the tile back.**
  - The workflow re-parses the YAML from the files (`:370-385`) and applies it in `complete()` (`:307-312`), including `activeSourceId`.
  - `withoutSplatChoice` strips only the *retained URL* state (`useFileDropzone.ts:43-49, 151`).
  - Archive URL datasets with an embedded YAML have the same problem: the YAML is among `droppedFiles`.
- **RED** for all of these:
  - the policy keeps `b`, keeps None with local splats;
  - the workflow keeps `b` / None across two reloads;
  - the YAML doesn't switch the tile;
  - the retained choice is stripped at the workflow.
  - The "gone → default" guard passes today.

### Root cause

The carry-over models only remote tiles. The selection on screen is otherwise reconstructed from the files' default, or from a `requestedSplatSourceId` that the previous commit consumed. And the splat choice is stripped from only one of the two settings sources.

### Fix

**The policy** (`src/utils/splatFileSourcePolicy.ts`). Widen `findSplatSourceById`'s parameter to `Pick<LoadedFiles, 'splatFileSources'> | null`, then generalize and rename the carry-over:
```ts
/**
 * A reload re-reads the dataset's own files, which never contain remote (url-bearing) splat tiles,
 * and keeps the splat state on screen. Remote tiles carry over with any downloaded bytes. The splat
 * that was showing stays: a reloaded local source with its id or path (local files of the same path
 * win over a remote copy), or a carried remote tile (byte-less placeholders included). Nothing
 * showing stays nothing, even when the files contain splats; a splat that is no longer listed gives
 * way to the files' default.
 */
export function carryOverSplatState(
  current: LoadedFiles | null,
  reloaded: Pick<LoadedFiles, 'splatFile' | 'splatFiles' | 'splatFileSources'>
): Pick<LoadedFiles, 'splatFile' | 'splatFiles' | 'splatFileSources'> {
  const reloadedSources = reloaded.splatFileSources ?? [];
  const reloadedPaths = new Set(reloadedSources.map((source) => normalizeSplatSourceId(source.path)));
  const carried = (current?.splatFileSources ?? []).filter((source) =>
    Boolean(source.url) && !reloadedPaths.has(normalizeSplatSourceId(source.path)));
  const splatFile = getSplatFileKeptOnReload(current, reloadedSources, carried, reloaded.splatFile);
  if (!carried.length && splatFile === reloaded.splatFile) {
    return reloaded;
  }
  const sources = [...reloadedSources, ...carried];
  return {
    splatFileSources: sources,
    splatFiles: sources.map((source) => source.file).filter((file): file is File => Boolean(file)),
    splatFile,
  };
}

function getSplatFileKeptOnReload(
  current: LoadedFiles | null,
  reloadedSources: SplatFileSource[],
  carried: readonly SplatFileSource[],
  defaultFile: File | undefined
): File | undefined {
  if (!current) return defaultFile;
  const activeId = getActiveSplatSourceId(current);
  if (activeId === null) return undefined;
  if (carried.some((source) => source.id === activeId)) return current.splatFile;
  return findSplatSourceById({ splatFileSources: reloadedSources }, activeId)?.file ?? defaultFile;
}
```

**The workflow** (`src/hooks/fileDropzoneWorkflow.ts`). Rename the option to `reload`: the spec's "explicit option" stays explicit, and the name now matches its one caller.
```ts
import { carryOverSplatState } from '../utils/splatFileSourcePolicy';
...
  /**
   * Reload of the current dataset: the splat state on screen stays (remote tiles its files never
   * contained, the active splat or None), and saved settings never switch it.
   */
  reload?: boolean;
...
function withoutSplatChoice(state: PublishedViewerState): PublishedViewerState {   // moved from useFileDropzone.ts
  if (state.config.splat?.activeSourceId === undefined) return state;
  const splat = { ...state.config.splat };
  delete splat.activeSourceId;
  return { ...state, config: { ...state.config, splat } };
}
...
  const complete = async () => {
    load.assertCurrent();
    // Reload keeps the splat on screen: saved settings, the files' own included, never switch it.
    if (viewerState) await onViewerState?.(normalizedOptions.reload ? withoutSplatChoice(viewerState) : viewerState);
    load.assertCurrent();
    return true;
  };
...
    const splatState = normalizedOptions.reload
      ? carryOverSplatState(currentLoadedFiles, { splatFile, splatFiles, splatFileSources })
      : { splatFile, splatFiles, splatFileSources };
```

**The hook** (`src/hooks/useFileDropzone.ts`):
- delete `withoutSplatChoice` and its `PublishedViewerState` import;
- in the `processFiles` options `Pick`, replace `'preserveRemoteSplatSources'` with `'reload'`;
- pass `reload: options.reload ?? false`.
```ts
  /** Re-read the current dataset (discarding edits), keeping the splat state on screen. */
  const reloadFiles = useCallback((files: Map<string, File>) => {
    // A URL dataset's saved settings are not among its files; re-apply them like a project's own YAML.
    const retained = useReconstructionStore.getState().sourceViewerState;
    return processFiles(files, undefined, {
      reload: true,
      viewerState: retained?.files === files ? retained.state : undefined,
    });
  }, [processFiles]);
```

**Interplay, as verified:**
- **The hand-off decision** (`:562-567`, reading back the committed file) now sees the previously active file in every Reload except "no longer listed". So the renderer is handed nothing, and None commits `undefined`, with `keepLoadingForInitialSplat` false.
- **`setLoadedFiles`' re-pick** (`reconstructionStore.ts:316-319`). At a Reload commit, `requestedSplatSourceId` is either `null` or the same active source. It is set only by a pick or a restore, and None and cancel clear it. So the re-pick is a no-op.
- **The in-load choice** (`:534-538`) still affects only the default. A pick made during the Reload's parse is already in `current`, so the carry-over keeps it.

**Recommendation on the project YAML: keep the on-screen choice over the YAML's saved tile.**
- **Consistency.** It matches the URL path (the Task 8 ruling) and spec requirement 8 ("the active splat stays active").
- **What Reload is for.** Reload discards *edits* (the confirm text lists transforms, conversions and deletions), not the user's splat choice.
- **No surprise downloads.** A YAML-named tile would otherwise be switched back, and re-downloaded if it is remote (archive URL with an embedded YAML).
- **One place.** Stripping in the workflow, keyed on `reload`, covers both settings sources.

### Tests

**`src/utils/splatFileSourcePolicy.test.ts`.** Rename `carryOverRemoteSplatSources` → `carryOverSplatState` (import, describe, five calls). Add inside the describe:
```ts
  const a = new File(['aa'], 'a.spz');
  const b = new File(['b'], 'b.spz');
  const local = [{ id: 'a.spz', path: 'a.spz', file: a }, { id: 'b.spz', path: 'b.spz', file: b }];
  const reloadedLocal = { splatFile: a, splatFiles: [a, b], splatFileSources: local };

  it('keeps the local splat that was showing instead of the default', () => {
    const current = loaded({ splatFile: b, splatFiles: [a, b], splatFileSources: local });
    expect(carryOverSplatState(current, reloadedLocal).splatFile).toBe(b);
  });

  it('keeps COLMAP only when no splat was showing, even with local splats', () => {
    const current = loaded({ splatFiles: [a, b], splatFileSources: local });
    expect(carryOverSplatState(current, reloadedLocal).splatFile).toBeUndefined();
  });

  it('falls back to the default when the splat that was showing is gone', () => {
    const merged = new File(['m'], 'merged.spz');
    const current = loaded({ splatFile: merged, splatFiles: [merged], splatFileSources: [{ id: 'merged.spz', path: 'merged.spz', file: merged }] });
    expect(carryOverSplatState(current, reloadedLocal)).toBe(reloadedLocal);
  });
```

**`src/hooks/fileDropzoneWorkflow.test.ts`.** Change `preserveRemoteSplatSources: preserve` → `reload: preserve` (`:951`) and `preserveRemoteSplatSources: true` → `reload: true` (`:979`). Then add (store-backed, in the style of `:961`):
```ts
  function reloadFixture() {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    const a = new File(['aa'], 'a.spz');   // larger: the files' default pick
    const b = new File(['b'], 'b.spz');
    const files = new Map(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, file(name)]));
    files.set('a.spz', a);
    files.set('b.spz', b);
    useReconstructionStore.getState().setLoadedFiles(loadedFiles({ splatFile: a, splatFiles: [a, b],
      splatFileSources: [{ id: 'a.spz', path: 'a.spz', file: a }, { id: 'b.spz', path: 'b.spz', file: b }] }));
    const deps = createDeps({
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      setLoadedFiles: useReconstructionStore.getState().setLoadedFiles,
      parseFiles: vi.fn(async () => ({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false })),
      buildReconstruction: vi.fn(async () => ({ reconstruction: createReconstruction(), pointCount: 0 })),
    });
    return { a, b, files, deps };
  }

  it.each(['b.spz', ''])('keeps the splat state on screen (%j) across repeated reloads', async choice => {
    const { b, files, deps } = reloadFixture();
    try {
      await useReconstructionStore.getState().selectSplatSource(choice);
      for (let reload = 0; reload < 2; reload += 1) {
        await expect(processFileDropzoneFiles(files, deps, { reload: true })).resolves.toBe(true);
      }
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(choice ? b : undefined);
      expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(2);
      // Nothing new to load: the renderer is never handed the default splat.
      expect(deps.setUrlProgress).not.toHaveBeenCalledWith(expect.objectContaining({ currentFile: 'a.spz' }));
      expect(deps.setUrlLoading).toHaveBeenLastCalledWith(false);
    } finally { useReconstructionStore.getState().clear(); }
  });

  it("does not let the dataset's own settings switch the splat on reload", async () => {
    const { b, files, deps } = reloadFixture();
    const yaml = serializeDatasetViewerSettings({ version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'a.spz' }, ui: { backgroundColor: '#345678' } } });
    files.set('colmapview.yaml', Object.assign(file('colmapview.yaml'), { text: async () => yaml }));
    try {
      await useReconstructionStore.getState().selectSplatSource('b.spz');
      await expect(processFileDropzoneFiles(files, deps, { reload: true,
        onViewerState: viewerState => applySavedViewerState(viewerState, null) })).resolves.toBe(true);
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(b);
      expect(useUIStore.getState().backgroundColor).toBe('#345678');   // the rest still applies
    } finally { useReconstructionStore.getState().clear(); }
  });

  it('re-applies the saved alignment on reload but not the saved splat choice', async () => {
    const { b, files, deps } = reloadFixture();
    const transform = { ...createIdentityEuler(), translationX: 5 };
    const saved: PublishedViewerState = { version: 1, viewerVersion: 'test', viewState: null,
      config: { splat: { activeSourceId: 'a.spz', transform } } };
    try {
      await useReconstructionStore.getState().selectSplatSource('b.spz');
      await expect(processFileDropzoneFiles(files, deps, { reload: true, viewerState: saved,
        onViewerState: viewerState => applySavedViewerState(viewerState, null) })).resolves.toBe(true);
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(b);
      expect(useTransformStore.getState().splatTransform).toEqual(transform);
    } finally { useReconstructionStore.getState().clear(); }
  });
```
Plus the A3 Reload integration test.

Notes:
- `file()` creates empty Files. Keep `a` at 2 bytes and `b` at 1 byte, so `a` is the workflow's default (`findSplatFileSources` sorts by preference).
- jsdom `File` has no `text()`, which is why the YAML is attached via `Object.assign`, as at `:1006`.

**`src/hooks/useFileDropzone.test.ts`.**
- Change `preserveRemoteSplatSources: true/false` → `reload: true/false` (`:242`, `:245`).
- Replace the assertions of `'keeps the splat on screen when Reload re-applies saved source settings'` (`:265-280`); the stripping is now pinned at the workflow:
```ts
    // The settings go whole to the workflow, which keeps the splat on screen for a reload.
    expect(processFileDropzoneFilesMock).toHaveBeenLastCalledWith(files, expect.anything(),
      expect.objectContaining({ reload: true, viewerState: saved }));
    expect(useReconstructionStore.getState().sourceViewerState?.state).toBe(saved);
```

**Verification:**
- RED at 15f1b69: the 2 local policy cases, all 3 workflow tests (×2 for the `it.each`), and the retained-strip case. The fallback guard is GREEN today.
- On the copy, all of the above pass, and so do the three suites (88 tests).

### Risks/interactions

- **Non-COLMAP Reload paths are still unchanged** (residual gap, out of scope).
  - Splat-only scenes reload through `updateLoadedSplatFile(splatFiles[0], …)` (`fileDropzoneWorkflow.ts:438-445`).
  - Images-only scenes reload through `runImagesOnlyLoad({ splatFile: splatFiles[0] })` (`:453-475`).
  - Both still pick the default.
- **Splats from outside the file map.** A splat merged from elsewhere is not in `droppedFiles`, so after Reload the default applies, as before.
- **A pending pick.** A lazy remote pick still in flight during a Reload is cancelled by `setLoadedFiles` (pre-existing).
- **Saved explicit None.** A retained or YAML explicit None is no longer applied on Reload; the screen state wins. This resolves the Task 8 fix-round note: Reload no longer activates the default local splat after None.
- **A3.** Reload with None now relies on the A3 re-application rule for visible points.
- **A9.** The confirm wording reflects this.
- **CRLF test files.** `fileDropzoneWorkflow.test.ts`, `splatFileSourcePolicy.test.ts`, `useFileDropzone.test.ts` and `useTransformPanelStoreFacade.test.ts` use CRLF line endings. Keep them, or the diff covers the whole file.

---

## A9: The TransformPanel Reload skips confirmation, and the dialog text is inaccurate

### Verified

**The other three Reload paths confirm, then reset, then reload:**
- `ExportPanel.tsx:202-207`: `if (!await confirmReload()) return; resetTransform(); reloadFiles(droppedFiles);`
- `transformGizmoContextMenuExecutor.ts:23-27`
- `globalContextMenuActionExecutor.ts:285-289`

**`TransformPanel.tsx:171`** skips the confirmation:
```tsx
onClick={() => { if (droppedFiles) { resetTransform(); reloadFiles(droppedFiles); } }}
```

**`confirmReload`** (`store/actions/sessionActions.ts:36-44`) prompts only when `hasUnsavedReloadState()` is true. Its message is:
```
'Reloading will discard transforms, camera conversions, and pending or applied image deletions.'
```
Reload now re-applies the dataset's saved settings: alignment, view, display and navigation. The retained URL settings come from `useFileDropzone.ts:145-153`, and a project YAML is re-applied from the files.

**The facade boundary.**
- `componentStoreBoundary.test.ts` flags only `use*Store(` calls in components.
- The convention (ExportPanel, TransformGizmo, the context menu) routes `confirmReload` through the component's `*StoreFacade`.
- `useTransformPanelStoreFacade.ts:27-34,68-70` exposes only `applyTransformToData`, and its test pins the action keys exhaustively (`useTransformPanelStoreFacade.test.ts:48`).
- `useFileDropzone` is a plain hook, not a store hook, and stays as is, like ExportPanel's.

**RED:** `window.confirm` is never called, so the transform resets without asking.

### Fix

**`src/components/viewer3d/panels/useTransformPanelStoreFacade.ts`**
```ts
import { applyTransformToData, confirmReload, useReconstructionStore, useTransformStore, useUIStore,
  type TransformState, type UIState } from '../../../store';
...
  applyTransformToData: typeof applyTransformToData;
  /** Asked before Reload, like every other Reload entry point. */
  confirmReload: typeof confirmReload;
...
    actions: { applyTransformToData, confirmReload },
```

**`src/components/viewer3d/panels/TransformPanel.tsx`**
```tsx
    actions: {
      applyTransformToData,
      confirmReload,
    },
  } = useTransformPanelStoreFacade();
  const { reloadFiles } = useFileDropzone();
  const reload = async () => {
    if (!droppedFiles || !await confirmReload()) return;
    resetTransform();
    void reloadFiles(droppedFiles);
  };
...
            onClick={() => { void reload(); }}
```

**`src/store/actions/sessionActions.ts`.** The wording is static and accurate whether or not the dataset saved settings, so it needs no new imports.
```ts
    message: 'Reloading re-reads the dataset: transforms, camera conversions, and pending or applied image deletions '
      + 'are discarded, and any settings saved with the dataset (alignment, view and display) are applied again.',
```

A conditional variant is possible: show the second clause only when `sourceViewerState?.files === droppedFiles || findDatasetViewerSettingsEntry(droppedFiles)`. It would pull `datasetViewerSettings` into store/actions; static wording is enough.

### Tests

**`src/components/viewer3d/panels/TransformPanel.test.tsx`.** Add `waitFor` to the import, then:
```tsx
const { reloadFilesMock } = vi.hoisted(() => ({ reloadFilesMock: vi.fn(async () => undefined) }));
vi.mock('../../../hooks/useFileDropzone', () => ({ useFileDropzone: () => ({ reloadFiles: reloadFilesMock }) }));
...
  // in beforeEach: reloadFilesMock.mockClear();   in afterEach: vi.restoreAllMocks();
  it.each([false, true])('asks before Reload discards the transform, like the other Reload actions (confirmed: %s)', async confirmed => {
    const droppedFiles = new Map([['sparse/0/cameras.bin', new File([''], 'cameras.bin')]]);
    const transform = { ...createIdentityEuler(), scale: 1.5 };
    useReconstructionStore.setState({ droppedFiles });
    useTransformStore.setState({ transform });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(confirmed);
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    if (confirmed) {
      await waitFor(() => expect(reloadFilesMock).toHaveBeenCalledWith(droppedFiles));
      expect(useTransformStore.getState().transform).toEqual(createIdentityEuler());
    } else {
      expect(reloadFilesMock).not.toHaveBeenCalled();
      expect(useTransformStore.getState().transform).toEqual(transform);
    }
  });
```
With no `ConfirmationHost` mounted, `requestConfirmation` falls back to `window.confirm` (`utils/confirmation.ts:18-28`).

**`useTransformPanelStoreFacade.test.ts:48`.** Import `confirmReload` from `'../../../store'`, then:
```ts
    // The commit and the Reload confirmation; `applyTransformPreset` moved to Align.
    expect(Object.keys(result.current.actions)).toEqual(['applyTransformToData', 'confirmReload']);
    expect(result.current.actions.confirmReload).toBe(confirmReload);
```

**`sessionActions.test.ts:57-67`.** After the first `toHaveBeenCalledTimes(1)`:
```ts
    // Reload also brings back what the dataset saved; it does not only discard.
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('settings saved with the dataset'));
```

**Status:** the panel test is RED at 15f1b69 (`confirm` called 0 times). On the copy it is GREEN, and so are the facade and session suites (15 tests).

### Risks/interactions

- **Pre-existing false alarm.** `hasUnsavedReloadState()` treats any non-identity `splatTransform` as unsaved. So every URL dataset with a saved splat alignment prompts, even when Reload would restore exactly that alignment. Optional follow-up: compare against the retained saved alignment.
- **Wording depends on A1 and A8.** It assumes their semantics: saved settings come back, and the splat on screen stays.

---

## Recommended task grouping and order

1. **Task 1: Store, one COLMAP-only transition (A7 → A6 → A3's store part → A2).**
   - Files: `reconstructionStore.ts`, `optionalSettingsWarning.ts`, `urlLoaderViewerState.ts`; tests in `reconstructionStore.test.ts` plus three test-import updates.
   - RED first: the four new behaviour tests. A6 and A7 are refactors pinned by existing tests; add the A7 mutation check.
   - This task adds the `restorePointDisplayWithoutSplat` export.
2. **Task 2: Restoration order (A1 + A3's re-application line). This is the Important item.**
   - Files: `useUrlState.ts` and `store/index.ts`; tests in `useUrlState.test.ts` (5) and `useUrlLoader.test.ts` (the extended I1 test, which adds `onSceneReplaced` in its mock).
   - Depends on Task 1's export.
   - Apply the A1 code exactly as written. It is the one patch not executed in the scratchpad copy.
3. **Task 3: Reload keeps the splat state (A8, plus the A3 Reload integration test).**
   - Files: `splatFileSourcePolicy.ts`, `fileDropzoneWorkflow.ts`, `useFileDropzone.ts`; the three test files.
   - Its integration test needs Tasks 1 and 2.
4. **Task 4: The loader records settings only for its own scene (A4).**
   - Files: `useUrlLoader.ts`; `useUrlLoader.test.ts` (new test plus the two mocks).
5. **Task 5: The HF archive size check surfaces account answers (A5).**
   - Files: `zipValidation.ts`; `zipValidation.test.ts`, `zipLoader.test.ts`.
6. **Task 6: Reload confirms everywhere, with accurate wording (A9).**
   - Files: TransformPanel and its facade, `sessionActions.ts`, plus their tests.
   - The wording assumes Tasks 2–3.
7. **Verification:** full `vitest run`, `tsc -b --force`, `npm run lint`, `npm run build`, then the codex gate (per memory).

Tasks 4–6 are independent of each other and of Tasks 2–3. I suggest running them sequentially after Task 3 anyway:
- `useUrlLoader.test.ts` is edited by Tasks 1, 2 and 4;
- `useFileDropzone.test.ts` is edited by Tasks 1 and 3;

so sequential runs avoid conflicts in shared test files.

## Out-of-scope observations (no action proposed here)

- **Non-COLMAP Reload paths** (splat-only, images-only) still pick `splatFiles[0]` (see A8 Risks).
- **A sibling latent issue to A4.** `loadZipUrlSource` commits source info and the active archive even when the load only merged a splat (`urlLoaderZipSource.ts:101`).
- **Lazy tile failures may be invisible.** They set only `urlError` (`reconstructionStore.ts:557-566`). Its only reader is the landing-panel gate (`useDropZoneStoreFacade.ts:34`), so a failed tile download may show no message. Worth a UI check.
- **Reload false alarm.** `hasUnsavedReloadState()` prompts for every dataset with a saved splat alignment (see A9).
