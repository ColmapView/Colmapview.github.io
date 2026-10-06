# R5-ui — D1 (Load URL cancels a pending sign-in) and D3 (`n` during a replacement load drops the incoming splat)

Repo `colmap-webview`, branch `fix/load-path-review-findings` @ `15f1b69`. Line numbers are from that head.

**Both findings are real.**
- **D1:** disable "Load URL" while a sign-in is pending, for both providers.
- **D3:** two parts, and both are needed:
  - **Part A, workflow fix:** at commit, honor only None or a source of the incoming files.
  - **Part B, hotkey guard:** `n` does nothing while a dataset load is in flight. Three hotkey failures survive Part A alone, and each was observed (see "Should the hotkey act during a load?").

**How this was checked.** The repo was never edited.
- Tests ran from a scratch harness against the current modules and against patched scratch copies of them.
- `tsc` was run with the app tsconfig on the patched copies.
- `eslint --stdin-filename <real path>` was run on the patched copies.
- See the Verification log at the end.

---

## D1 — "Load URL" silently cancels a pending Hugging Face / Google sign-in

### Verified

`src/components/dropzone/DatasetAccountButtons.tsx`

`close()` at `:71-78`:
```ts
const close = () => {
  cancelPicker();
  if (auth.status === 'connecting') {
    if (provider === 'google') googleDriveAuth.disconnect();
    else hfAuth.disconnect();
  }
  setProvider(null);
};
```

Every "Load URL" calls `close()` before opening the URL dialog. None of them is disabled while connecting.
- Google: `:185-186`
- HF connected/connecting branch: `:194-199`
- HF signed-out branch: `:201-202`

```tsx
{canLoadGoogleDriveUrl && <button type="button" className={getButtonClass(clientId ? 'ghost' : 'primary', 'sm')}
  onClick={() => { close(); onOpenUrlModal(); }}>Load URL</button>}
...
</> : connected || connecting ? <>
  <button type="button" className={getButtonClass('ghost', 'sm')} onClick={disconnect}>
    {connected ? 'Disconnect' : 'Cancel sign-in'}
  </button>
  <button type="button" className={getButtonClass(connecting ? 'secondary' : 'primary', 'sm')}
    onClick={() => { close(); onOpenUrlModal(); }}>Load URL</button>
```

Contrast: "Choose archive from Drive" at `:191-193` is already `disabled={(!connected && !sdk) || connecting || pickerLoading}`.

**How the pending sign-in state is exposed**

| Provider | State and setter | What `disconnect()` does |
|---|---|---|
| Hugging Face (`hfAuth`) | `HfAuthState.status: 'disconnected' \| 'connecting' \| 'connected'` (`src/features/huggingface/auth.ts:7`). `connect()` sets `'connecting'` (`:126`). | `:111-114`: aborts the pending controller and sets `{status:'disconnected', error:null}`. The connect task's `finally` then closes the popup (`:148`). |
| Google (`googleDriveAuth`) | Same union (`src/features/googleDrive/auth.ts:23`). `'connecting'` is set at `:110`. | `:79-84`: bumps `generation`, so a late token callback is dropped (`:117`). |

In the component:
- Both stores are read via `useSyncExternalStore` (`:31-32`).
- `auth` is the open provider's state, and `connecting = auth.status === 'connecting'` (`:39-41`).
- Google also has local `pickerLoading` and `signInUnsubscribeRef`, which form the sign-in→picker chain (`:101-122`). `cancelPicker()` (`:58-66`) tears that chain down.

**Observed on current code** (scratch test `d1.evidence.test.tsx`):
- **HF**, real `hfAuth` with a fake popup. After clicking Load URL during "Waiting for sign-in…":
  - auth state is `{"status":"disconnected","identity":null,"error":null}`
  - `popup.close` was called
  - `onOpenUrlModal` was called once
  - no message was shown
- **Google**, real `googleDriveAuth` with the `configureDrive()` mock SDK. After clicking Load URL during "Waiting for sign-in…" and a later `oauth.authorize()`:
  - auth state is `{"status":"disconnected","error":null}`
  - the picker never opened
  - `onOpenUrlModal` was called once

**Existing tests.** None presses Load URL while `connecting`. Load URL is only exercised while disconnected or connected: tests at `:93`, `:111`, `:135`, `:147`, `:221`, `:312`, `:340`.

The documented private-HF flow is exactly "Sign in", then "Load URL" (`docs/hugging-face-loading.md` steps 2–3). The connecting branch shows Load URL (as `secondary`), so the silent cancel sits on the main private-dataset path.

### Root cause

`close()` does two jobs:
1. It dismisses the dialog.
2. It abandons an in-flight sign-in. Once the dialog is gone, nothing shows the pending state or offers "Cancel sign-in". For Google, `cancelPicker()` has already dropped the sign-in→picker subscription.

The Load URL handlers reuse `close()` only for job 1, so they also get job 2. The button also stays enabled while connecting.

### Fix (code) — recommended: disable "Load URL" while a sign-in is pending

**Why not keep the sign-in alive instead** (`cancelPicker(); setProvider(null); onOpenUrlModal();` with no disconnect):
- **HF:**
  - The popup stays pending behind the URL dialog with no visible status.
  - Pasting a private URL before approving still fails the access check, so the race remains.
  - Timeout and decline errors land in `hf.error`, which is only visible after reopening the dialog.
- **Google:**
  - Sign-in exists only to open the Picker (the `drive.file` scope covers picked files).
  - With the picker chain dropped, a completed sign-in grants nothing useful for a pasted URL.
  - Without dropping the chain, the Picker would pop up over the URL dialog.
- **Disabling** matches the existing "Choose archive" pattern. "Cancel sign-in" is right next to Load URL, and the status line already says "Waiting for sign-in…".

Changes in `src/components/dropzone/DatasetAccountButtons.tsx`. The third argument of `getButtonClass` adds the existing `buttonStyles.disabled` (`src/theme/buttonStyles.ts:81-95`), exactly as at `:192`. No new CSS classes.

```diff
   const close = () => {
     cancelPicker();
+    // Closing abandons a pending sign-in, so Load URL (which closes this dialog) waits for it to settle.
     if (auth.status === 'connecting') {
       if (provider === 'google') googleDriveAuth.disconnect();
       else hfAuth.disconnect();
     }
     setProvider(null);
   };
```
```diff
-            {canLoadGoogleDriveUrl && <button type="button" className={getButtonClass(clientId ? 'ghost' : 'primary', 'sm')}
-              onClick={() => { close(); onOpenUrlModal(); }}>Load URL</button>}
+            {canLoadGoogleDriveUrl && <button type="button" disabled={connecting}
+              className={getButtonClass(clientId ? 'ghost' : 'primary', 'sm', connecting)}
+              onClick={() => { close(); onOpenUrlModal(); }}>Load URL</button>}
```
```diff
           </> : connected || connecting ? <>
             <button type="button" className={getButtonClass('ghost', 'sm')} onClick={disconnect}>
               {connected ? 'Disconnect' : 'Cancel sign-in'}
             </button>
-            <button type="button" className={getButtonClass(connecting ? 'secondary' : 'primary', 'sm')}
-              onClick={() => { close(); onOpenUrlModal(); }}>Load URL</button>
+            <button type="button" disabled={connecting}
+              className={getButtonClass(connecting ? 'secondary' : 'primary', 'sm', connecting)}
+              onClick={() => { close(); onOpenUrlModal(); }}>Load URL</button>
```

Leave the signed-out HF branch (`:201-202`) unchanged: it cannot render while connecting. The desktop and touch panels share this component (`DropZonePanels.tsx:140`, `:261`).

### Tests (code)

File: `src/components/dropzone/DatasetAccountButtons.test.tsx`. No new imports are needed.

Fixtures to reuse:
- `createProps()`
- `configureDrive()` and its `oauth.authorize()`
- `selectedArchive`
- the HF env stubs from "keeps configured Hugging Face sign-in separate from the Drive picker" (`:324-338`)
- the fake-popup pattern from `src/features/huggingface/auth.test.ts:147-148`

The file's `afterEach` already handles cleanup: it calls `googleDriveAuth.disconnect(); hfAuth.disconnect();`, `vi.unstubAllEnvs()` and `vi.restoreAllMocks()` (which restores the `window.open` spy).

Do **not** stub `BroadcastChannel`. The `afterEach` doesn't unstub globals, and the test doesn't need the stub.

Insert after "keeps connected Hugging Face identity, disconnect, and URL controls" (`:340-354`):
```tsx
  it('keeps a pending Hugging Face sign-in instead of letting Load URL cancel it', () => {
    vi.stubEnv('VITE_HF_AUTH_ENABLED', 'true');
    vi.stubEnv('VITE_HF_OAUTH_CLIENT_ID', 'hf-test-client');
    vi.stubEnv('VITE_HF_OAUTH_REDIRECT_URI', `${window.location.origin}/hf-callback.html`);
    const popup = { location: { href: '' }, closed: false, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const props = createProps();
    render(<DatasetAccountButtons {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hugging Face account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Hugging Face' }));
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for sign-in');
    expect(screen.getByRole('button', { name: 'Load URL' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Load URL' }));
    expect(hfAuth.getSnapshot().status).toBe('connecting');
    expect(popup.close).not.toHaveBeenCalled();
    expect(props.onOpenUrlModal).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Hugging Face');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sign-in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Load URL' }));
    expect(props.onOpenUrlModal).toHaveBeenCalledOnce();
  });
```

Insert after "cancels a pending sign-in without opening the picker on a late authorization callback" (`:233-246`):
```tsx
  it('keeps a pending Google sign-in on Load URL and still opens the picker when it completes', async () => {
    const oauth = configureDrive();
    vi.mocked(chooseGoogleDriveArchive).mockResolvedValue(selectedArchive);
    const props = createProps();
    render(<DatasetAccountButtons {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Google Drive account' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose archive from Drive' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Choose archive from Drive' }));
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for sign-in');
    expect(screen.getByRole('button', { name: 'Load URL' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Load URL' }));
    expect(googleDriveAuth.getSnapshot().status).toBe('connecting');
    expect(props.onOpenUrlModal).not.toHaveBeenCalled();
    oauth.authorize();
    await waitFor(() => expect(props.onLoadGoogleDriveArchive).toHaveBeenCalledExactlyOnceWith(selectedArchive.url));
  });
```

Notes:
- React ignores clicks on a disabled button, so the "click anyway" step proves that nothing fires.
- The HF test uses the real `hfAuth.connect()`, which dynamically imports `@huggingface/hub`. "Cancel sign-in" (and the `afterEach` disconnect) aborts it.
- In the scratch runs there were no unhandled rejections and no stderr output.

Results:
- **Current code:** both new tests fail at `toBeDisabled()` (RED). The 20 existing tests pass.
- **Patched copy:** the whole file passes, 22/22.

### Risks

- **Two clicks to switch to a public URL.** To abandon a sign-in and load a public URL, the user now presses "Cancel sign-in" and then "Load URL". The status line plus the adjacent cancel button explain the disabled state.
- **HF can stay "connecting" for up to 180 s.** When `BroadcastChannel` exists, a popup the user closed by hand is not detected (`auth.ts:76` polls `popup.closed` only without a channel). So `'connecting'`, and now the disabled Load URL, lasts until the timeout unless the user presses "Cancel sign-in".
  - The long pending state already existed. This change only makes it visible on the Load URL button.
  - Google settles promptly, because GIS reports a closed popup via `error_callback` (`googleDrive/auth.ts:132-133`).
- **Other close paths are unchanged.** X, Escape and the backdrop still abandon a pending sign-in through `close()`, as intended.
- **Out of scope:** Load URL stays enabled while the Drive picker is still opening after sign-in completed (`connected && pickerLoading`). Pressing it cancels the picker, which is an explicit switch to URL loading and does not lose a sign-in.

---

## D3 — pressing `n` during a replacement load commits the new dataset without a splat

### Verified

**The hotkey path:**
- `src/config/hotkeys.ts:166-171`: `cycleSplatFile`, key `'n'`, scope `'viewer'`
- → `src/components/viewer3d/useViewerControlHotkeys.ts:145-150`
- → `src/components/viewer3d/useViewerControlsController.ts:163-168`:

```ts
const cycleSplatFile = useCallback(() => {
  const nextSourceId = getNextSplatSourceId(splatFileSources, activeSplatSourceId);
  if (nextSourceId) {
    selectSplatSource(nextSourceId);
  }
}, [activeSplatSourceId, selectSplatSource, splatFileSources]);
```

- The sources come from the facade's `loadedFiles` (`useViewerControlsStoreFacade.ts:144-145`), which is the scene on screen. No load check exists anywhere on this path.
- The hotkey is live during loads:
  - `ViewerControls` is always mounted (`Scene3D.tsx:507`).
  - The `viewer` scope is enabled unless the image-detail modal is open (`useHotkeyScope.ts:17-25`).
  - The loading overlay (`DropZone.tsx:257`, `absolute inset-0 … z-overlay`) blocks only the pointer, not the keyboard.

**The revision counter:**
- `selectSplatSource` bumps `splatSelectionRevision` on every non-restore pick (`reconstructionStore.ts:418`).
- The workflow captures the starting revision at load start (`fileDropzoneWorkflow.ts:283`). Local loads capture it in `beginLocalLoad` (`useFileDropzone.ts:30-41`).

**The commit decision** at `fileDropzoneWorkflow.ts:534-538`:
```ts
const currentSelection = deps.getSplatSelectionState?.();
if (currentSelection && initialSplatSelectionRevision !== undefined
  && currentSelection.revision !== initialSplatSelectionRevision) {
  splatFile = splatFileSources.find(source => source.id === currentSelection.sourceId)?.file;
}
```

- `getSplatSelectionState` reports the active id of the scene on screen (`useFileDropzone.ts:113-116` → `getShareActiveSplatSourceId`, where `''` means "no active splat").
- Incoming ids are the incoming file paths (`fileClassification.ts:128-136`), so an id from the replaced scene finds nothing and `splatFile` becomes `undefined`.
- The store's later re-pick by `requestedSplatSourceId` (`reconstructionStore.ts:316-319`) doesn't rescue it, because the old id doesn't match any incoming source either.

**Observed on current code** (scratch `d3.test.ts` case A):
- Scene on screen: tiles `old/a.spz` (active) and `old/b.spz`.
- Incoming files: `splats/default.spz`.
- `selectSplatSource('old/b.spz')` while `buildReconstruction` is still pending → after the commit, `loadedFiles.splatFile === undefined`.
- Failure message: "expected undefined to be File".

**Reachable paths:** a local drop, folder browse or ZIP over an open scene, and Reload. All of them reach this COLMAP commit block.

URL replacement loads over a visible scene have no UI entry point:
- The DropZone panels render only when `!reconstruction` (`DropZone.tsx:231`, `:247`).
- The App's startup load has no previous scene.

**Should the hotkey act during a load? No.** All three failures below were observed against a *patched* workflow copy, so the workflow fix alone does not cure them:

1. **The overlay disappears mid-load.**
   - Switching to a local or already-downloaded tile goes through `selectSplatSource`'s local branch. That branch clears `urlLoading`, `urlProgress` and `urlError`, because the renderer doesn't own the progress (`reconstructionStore.ts:444-450`).
   - Observed during a replacement load: `{ urlLoading: false, urlProgress: null }`. The loading overlay (`urlLoading && urlProgress`) and its "Cancel loading" button vanish for the rest of the load.
   - The "already loading" guards (`useFileDropzone.ts:160`, `:182`, `:191`, `:216`) stop blocking a second drop.
   - A lazy tile instead starts a download that competes with the load and overwrites the progress (`:468`). If that download fails, it reports "Failed to load splat" and clears `urlLoading`.
2. **A pending pick reads as an explicit None.**
   - Case: the scene on screen shows no splat, and `n` picks a lazy tile that is still downloading at commit. The workflow then reports `sourceId: ''`.
   - That is read as an explicit None, so the new dataset loads with no splat.
   - Observed with both the current and the patched workflow (case C).
3. **The saved splat choice is skipped.**
   - For a dataset with a `colmapview.yaml` that names a splat, the bumped revision makes `applySavedViewerState` skip restoration (`canRestoreSplatSelection`, `useUrlState.ts:110`, `:130`, `:134`).
   - Observed: the patched workflow commits `default.spz` instead of the saved `saved.spz`. Without the `n` press it commits `saved.spz` (case D).

### Root cause

- `splatSelectionRevision` is a single global counter.
- The commit block treats any bump during the load as a choice for the incoming dataset.
- The `n` hotkey only knows the scene on screen. It bumps the counter for a scene that is about to be replaced, with an id that cannot resolve in the incoming files.
- The block then maps "not found" to `undefined`, which looks exactly like an explicit None.

### Fix (code) — Part A (workflow) and Part B (hotkey guard)

#### Part A — `src/hooks/fileDropzoneWorkflow.ts:534-538`

This fixes the commit decision for any stale selection, whatever its source:
- the hotkey
- a `SplatPickerModal` left open above the overlay (z 1100 > 500)
- future callers

```diff
     const currentSelection = deps.getSplatSelectionState?.();
     if (currentSelection && initialSplatSelectionRevision !== undefined
       && currentSelection.revision !== initialSplatSelectionRevision) {
-      splatFile = splatFileSources.find(source => source.id === currentSelection.sourceId)?.file;
+      // A choice made during the load carries over only when it fits these files: None, or one of
+      // their sources. A tile of the scene being replaced keeps the default.
+      if (currentSelection.sourceId === '') {
+        splatFile = undefined;
+      } else {
+        const chosen = splatFileSources.find(source => source.id === currentSelection.sourceId);
+        if (chosen) splatFile = chosen.file;
+      }
     }
```

Interaction with existing behavior:
- The intended carry-overs are preserved: an explicit None, and a same-id tile (the existing None/alternate tests).
- With `preserveRemoteSplatSources` (Reload), the carry-over step that follows (`:540-543`) still runs unchanged.
- The `committedSplatFile` read-back (`:563`) still decides the renderer handoff.

#### Part B — make `n` a no-op while a dataset load is in flight

Three small edits.

`src/wasm/reconstructionLoadLifecycle.ts`, next to the other exports:
```ts
/** A dataset is being scanned, parsed or committed; the scene on screen is the one it replaces. */
export function isReconstructionLoadPending(): boolean {
  return active !== null;
}
```

`src/components/viewer3d/useViewerControlsStoreFacade.ts`:
```diff
 import { reconstructionHasSplatMetricCapableCamera } from '../../splat/splatMetricCapability';
+import { isReconstructionLoadPending } from '../../wasm/reconstructionLoadLifecycle';
 ...
 interface ViewerControlsSplatFacade {
   ...
   setActiveSplatFile: (file: File) => void;
   selectSplatSource: (sourceId: string) => void;
+  /** Whether a dataset load is replacing the scene these splats belong to. */
+  isDatasetLoadPending: () => boolean;
 }
 ...
     splats: {
       activeSplatFile,
       splatFiles,
       splatFileSources,
       activeSplatSourceId,
       hasSplatData: loadedFilesHaveSplatData(loadedFiles),
       setActiveSplatFile,
       selectSplatSource,
+      isDatasetLoadPending: isReconstructionLoadPending,
     },
```

`src/components/viewer3d/useViewerControlsController.ts`:
```diff
   const {
     splatFileSources,
     activeSplatSourceId,
     selectSplatSource,
+    isDatasetLoadPending,
   } = splats;
 ...
   const cycleSplatFile = useCallback(() => {
+    // These tiles belong to the scene a dataset load is replacing; switching one would take over
+    // the load's progress overlay and read as a splat choice for the incoming dataset.
+    if (isDatasetLoadPending()) {
+      return;
+    }
     const nextSourceId = getNextSplatSourceId(splatFileSources, activeSplatSourceId);
     if (nextSourceId) {
       selectSplatSource(nextSourceId);
     }
-  }, [activeSplatSourceId, selectSplatSource, splatFileSources]);
+  }, [activeSplatSourceId, isDatasetLoadPending, selectSplatSource, splatFileSources]);
```

**Why this signal**
- `active` is set by `beginReconstructionLoad()`. It is cleared by the current job's `finish()`, or by `cancelPendingReconstructionLoad()` (called from `clear` / `cancelLoading`).
- Every `begin` is paired with `finish()` in a `finally`: `fileDropzoneLocalSources.ts:165`, `:209`, `:262`; `fileDropzoneWorkflow.ts:613`; `useFileDropzone.ts:131`.
- The flag therefore covers the exact window in which the revision is compared:
  - local drop, browse and ZIP, from scan through the commit and saved-settings restoration
  - Reload's re-parse

**Rejected alternatives**
- `urlLoading`: also true while a tile downloads or the renderer decodes. Gating on it would block the latest-wins tile cycling that `selectSplatSource` supports.
- `urlLoadActive`:
  - Local loads never set it.
  - For URL loads it also spans the post-commit restoration, where a choice for the **new** dataset is meant to win (`useUrlState.ts:131`).
- A guard inside the store's `selectSplatSource`: this would break the intended in-load choices pinned by existing tests:
  - "retains a user None/alternate choice…" (`fileDropzoneWorkflow.test.ts:330`)
  - "retains None chosen during archive download/outer preparation…" (`useUrlLoader.test.ts:444`)

**Project rules**
- The controller reaches the lifecycle module through its facade. The `componentStoreBoundary` rule only checks `use*Store(` calls, and this is a plain module, not a Zustand store, but routing it through the facade keeps the controller free of app-state imports.
- No CSS changes.

### Tests (code)

**1) Workflow.** File: `src/hooks/fileDropzoneWorkflow.test.ts`. Insert after the None/alternate test (ends `:359`).

Reuse `workerLoadFixture()`, `loadedFiles()`, `createDeps()`, and the `getSplatSelectionState` wiring from `:345-346`. Use the store reset from the first test in the file (`:156-160`).

```ts
  it('keeps the default splat when parsing ends after a tile of the replaced scene was chosen', async () => {
    useReconstructionStore.getState().clear();
    const fixture = workerLoadFixture();
    const state = useReconstructionStore.getState();
    const replacedA = new File(['old-a'], 'a.spz');
    const replacedB = new File(['old-b'], 'b.spz');
    state.setLoadedFiles(loadedFiles({ splatFile: replacedA, splatFiles: [replacedA, replacedB], splatFileSources: [
      { id: 'old/a.spz', path: 'old/a.spz', file: replacedA }, { id: 'old/b.spz', path: 'old/b.spz', file: replacedB }] }));
    const incomingDefault = new File(['incoming-default'], 'default.spz');
    fixture.files.set('splats/default.spz', incomingDefault);
    let finishBuild!: (result: { reconstruction: Reconstruction; pointCount: number }) => void;
    const buildReconstruction = vi.fn(() => new Promise<{ reconstruction: Reconstruction; pointCount: number }>(resolve => { finishBuild = resolve; }));
    const deps = createDeps({
      parseFiles: vi.fn(async () => fixture.parseResult), buildReconstruction,
      getLoadedFiles: () => useReconstructionStore.getState().loadedFiles,
      getSplatSelectionState: () => ({ revision: useReconstructionStore.getState().splatSelectionRevision,
        sourceId: getShareActiveSplatSourceId(useReconstructionStore.getState().loadedFiles) ?? undefined }),
      setLoadedFiles: state.setLoadedFiles, setWasmReconstruction: state.setWasmReconstruction,
      setReconstruction: state.setReconstruction,
    });
    try {
      const pending = processFileDropzoneFiles(fixture.files, deps);
      await vi.waitFor(() => expect(buildReconstruction).toHaveBeenCalledOnce());
      // What the `n` hotkey does to the scene on screen: switch it to its next tile.
      await state.selectSplatSource('old/b.spz');
      finishBuild({ reconstruction: fixture.reconstruction, pointCount: 0 });
      expect(await pending).toBe(true);
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(incomingDefault);
      expect(useReconstructionStore.getState().requestedSplatSourceId).toBeNull();
      expect(deps.setUrlProgress).toHaveBeenCalledWith(expect.objectContaining({ message: 'Preparing splat renderer...' }));
    } finally {
      fixture.service.dispose();
      useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
      useTransformStore.setState(useTransformStore.getInitialState(), true);
      useUIStore.setState(useUIStore.getInitialState(), true);
      usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    }
  });
```
All the imports this test needs are already in the file.

**2) Hotkey guard.** File: `src/components/viewer3d/useViewerControlsController.test.ts`.

Add the wrapper and key-press pattern from `useViewerControlHotkeys.test.ts:12-14,47-49`. Reuse `buildFile`, `buildLoadedFiles` and `buildReconstruction`, which are already imported. The `beforeEach` (`:33-41`) already resets the stores.

New imports:
```ts
import { createElement, type ReactNode } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { beginReconstructionLoad } from '../../wasm/reconstructionLoadLifecycle';
```

Helpers, placed at module scope above the `describe`:
```ts
function hotkeyWrapper({ children }: { children: ReactNode }) {
  return createElement(HotkeysProvider, { initiallyActiveScopes: ['viewer'] }, children);
}

function pressKey(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, code: `Key${key.toUpperCase()}`, bubbles: true }));
  });
}
```

The test, at the end of the `describe`:
```ts
  it('ignores N while a dataset load replaces the scene and cycles again once it ends', () => {
    const first = buildFile('a.spz', 'a');
    const second = buildFile('b.spz', 'b');
    useReconstructionStore.setState({
      reconstruction: buildReconstruction(),
      loadedFiles: buildLoadedFiles({ splatFile: first, splatFiles: [first, second], splatFileSources: [
        { id: 'a.spz', path: 'a.spz', file: first }, { id: 'b.spz', path: 'b.spz', file: second }] }),
    });
    renderHook(() => useViewerControlsController(), { wrapper: hotkeyWrapper });
    const revision = useReconstructionStore.getState().splatSelectionRevision;
    const load = beginReconstructionLoad();
    try {
      pressKey('n');
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(first);
      expect(useReconstructionStore.getState().splatSelectionRevision).toBe(revision);
    } finally {
      load.finish();
    }
    pressKey('n');
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(second);
  });
```

**3) Lifecycle unit test.** File: `src/wasm/reconstructionService.test.ts`.
- Extend the import at `:7` to `{ beginReconstructionLoad, cancelPendingReconstructionLoad, isReconstructionLoadPending }`.
- Add the test after "invalidates dataset load generations on replacement and clear" (`:203-213`). The file's `afterEach` (`:57`) already calls `cancelPendingReconstructionLoad()`.

```ts
  it('reports a dataset load as pending until the current one finishes or is cancelled', () => {
    expect(isReconstructionLoadPending()).toBe(false);
    const first = beginReconstructionLoad();
    const second = beginReconstructionLoad();
    first.finish();
    expect(isReconstructionLoadPending()).toBe(true);
    second.finish();
    expect(isReconstructionLoadPending()).toBe(false);
    beginReconstructionLoad();
    cancelPendingReconstructionLoad();
    expect(isReconstructionLoadPending()).toBe(false);
  });
```

**Existing tests that must stay green** (all verified green against the patched workflow):
- `fileDropzoneWorkflow.test.ts:330` (None/alternate)
- `useUrlLoader.test.ts:375`, `:411`, `:444`, `:486`

**Results**

| Test | Current code | Patched copies |
|---|---|---|
| (1) Workflow | Fails: `expected undefined to be File` | Passes; whole suite 41/41 |
| `fileDropzoneWorkflow` + `useUrlLoader` suites with the patched workflow | n/a | 98/98 |
| (2) Controller | Fails: the splat switches during the load | Passes; whole suite 9/9 |
| Facade suite with the patched facade | n/a | 8/8 |
| (3) Lifecycle | n/a | Passes |

**Suggested commits.** Test first for each:
1. D1
2. D3 Part A
3. D3 Part B

### Risks

- **No feedback on an ignored `n`.** During a load, `n` silently does nothing. The overlay is up at that point, so this seems acceptable.
- **Reload behavior changes.** `n` during Reload's re-parse is now ignored. Before, the tile it picked existed in the reloaded files and was honored at commit.
- **URL replacement loads** (not reachable from the UI today):
  - During the download phase, before the files reach `processFiles`, no reconstruction job is active, so `n` still acts on the old scene.
  - Part A keeps the default at commit.
  - But the restoration gate (`useUrlState.ts:110`) and the picker gate (`useUrlLoader.ts:171`) would still skip restoration and the picker.
  - If such loads become reachable, also guard the URL download phase. Do not use `urlLoadActive` as-is (see Rejected alternatives).
- **`''` is still ambiguous for non-hotkey sources.** A lazy tile picked in a `SplatPickerModal` left open over a replacement load still reads as None if its download hasn't finished at commit. This is rare. Telling it apart would need a "pending pick" signal in the store.
- **Id matching is unchanged.** The workflow keeps strict `source.id` equality. The store's re-pick (`getLoadedFilesWithActiveSplatSource`, `splatFileSourcePolicy.ts:209-230`) also matches by path or file name, so a same-named incoming tile can still win after commit. This behavior already existed and fits "names an incoming source".
- **Module-level state.** The guard relies on every `beginReconstructionLoad()` being paired with `finish()` in a `finally`. A future caller that forgets this would leave `n` dead until the next load, clear or cancel. Test (3) pins the finish/cancel semantics.

---

## Verification log

- **Repo untouched.** `git status` stays clean at `15f1b69`, and nothing was written under the repo.
- **Scratch harness.** `scratchpad/gaps/vt/vitest.scratch.config.ts`:
  - It merges the repo's `vite.config`, sets `server.fs.strict: false`, and points `test.dir` at the scratch directory.
  - It was run from the repo with `NODE_PATH=<repo>/node_modules npx vitest run --config <scratch config> <filter>`.
  - Scratch files with bare imports needed a temporary junction `vt/node_modules → repo node_modules`, which was removed afterwards. Recreate it to re-run them.
- **Scratch files** in `scratchpad/gaps/vt/src/`:
  - `patched/` holds the patched copies with absolute imports.
  - `d1.evidence.test.tsx` — the current-code observations.
  - `d1.current.test.tsx` and `d1.existing.patched.test.tsx` — the D1 suite against the current and patched component.
  - `d3.test.ts` — cases A–D, current vs patched.
  - `wf.final.*.test.ts`, `ctrl.final.*.test.ts`, `lifecycle.test.ts`, `hotkey.test.ts`.
  - `wf.patched.test.ts` and `url.patched.test.ts` — the existing suites run against the patched workflow.
- **Type check.** `tsc -p` with `tsconfig.app.json` over the five patched files: exit 0.
- **Lint.** `npx eslint --stdin --stdin-filename <real repo path>` for each patched file: no findings.
