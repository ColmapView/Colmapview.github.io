# Q2: Splat choice, Cancel and renderer callbacks — fix spec (F2, F4, F10, F11; X5, X7, X9, X11(a)–(c))

**Date:** 2026-10-07
**Branch:** `fix/final-review-gaps` at 1984de8 (equal to local `main`). Line numbers are at 1984de8.
**Inputs:** `findings.md` (same folder) and the reviewer's scratch evidence in `scratchpad/rev3/mirror/`:
- F2: `src/hooks/zz_VA1-3_1.test.ts`;
- F4: `src/hooks/zz_VF1-2_reloadCancel.test.ts`, `src/components/viewer3d/zz_VRe1_webgpuReload.test.tsx`;
- F10: `src/components/viewer3d/PointCloud/zz_F1_1.test.tsx`, `zz_VF1-1_overlap.test.tsx`;
- F11: `src/components/dropzone/zz_VA3-3_panelPickDuringDrop.test.tsx`, `src/hooks/zz_Simplify_1.test.ts`, `e2e/zz_VSi-1_reach.spec.ts`;
- X5: `src/components/dropzone/zz_A3_3.test.tsx`, `e2e/zz_VA3-1_dialogdrop.spec.ts`;
- X7: `src/components/modals/zz_VA3-5_helpEscape.test.tsx`; X9: `src/store/zz_VF1-4_failedSplatOnly.test.ts`; X11(b): `src/hooks/zz_Simplify_2.test.ts`.

## How this was verified

- **Scratch copies.** `scratchpad/rev4/q2/` holds `src/`, the configs, `e2e/` and `public/` with a `node_modules` junction, and carries the fixes. `scratchpad/rev4/q2-head/` holds HEAD for the browser RED runs.
- **RED.** Every new or changed test was run against HEAD code first: 25 failed in 11 files, each for the reason its item describes (recorded under each item).
- **GREEN.** With the fixes, those files plus the neighbouring suites (15 files, 522 tests) pass.
- **Full suite.** `npx vitest run` with all fixes: 577 of 580 files pass. The 3 failures are fixture gaps of the scratch copy (`tests/colmapFixturePaths`, `package-lock.json`, `vendor/`), unrelated to this spec.
- **Types and lint.** `tsc -p tsconfig.test.json --noEmit` (sources and tests) reports only the same two fixture-gap imports. `eslint` on every changed file is clean.
- **E2e.** See "E2e" near the end. The CI gate (`--project=chromium`) with all fixes: 88 passed, 1 failed, the known F1 test (Q1's), as at HEAD.

## Summary

| Item | Verdict | Disposition | Effort (implementer / reviewer) |
|---|---|---|---|
| F2 | Confirmed | Fix: the store records a None choice; share links, embeds, publications and the in-load reading record `''` only for it | high / high |
| F4 | Confirmed | Fix: the WebGPU layer yields the loading state like Spark (ownership by attempt start) | high / max |
| F10 | Confirmed, in Spark and WebGPU | Fix: renderer callbacks also yield to a pending tile download; `dropFailedSplat` drops the failed splat under it | high / max |
| F11 | Confirmed | Fix: the Point Cloud panel's splat select follows `n` and is ignored while a dataset load is pending | medium / medium |
| X5 | Confirmed | Fix: DropZone ignores files dropped on an open modal dialog | low / medium |
| X7 | Confirmed, pre-existing | Set aside | — |
| X9 | Confirmed, pre-existing | Fix: a splat-only scene whose only splat fails returns to the landing page, as a cancelled decode does | medium / high (F10's task) |
| X11(a) | Confirmed | Set aside: refactor-only | — |
| X11(b) | Confirmed | Fix, small: the workflow resolves an in-load pick by id, path or file name itself | low / medium (F11's task) |
| X11(c) | Confirmed | Set aside: refactor-only | — |

**Decision changes:** none.

**Refinements** (consistent with the deliberate decisions, which do not cover these cases):
1. **Ruling 5 reaches the WebGPU layer (F4), and tile downloads (F10).** Spark's ownership by attempt start now also governs the WebGPU layer. Both renderers also yield to a pending tile download, which the decision allows.
2. **`dropFailedSplat` under a tile download (F10).** R1 §E2 made it stand aside entirely. It now leaves only the loading state to the download and still drops the failed splat, exactly as it already does under a pending dataset load (ruling 5). R1's reason for standing aside, that the arriving tile would stay hidden in the plain display, is handled by deciding the activation display when the tile lands.
3. **A failure twin of the splat-only Cancel fallback (X9).** `dropFailedSplat` gains the `clear()` path that a cancelled decode already takes (f301242, G5). "Cancel loading never calls `clear()`" is untouched: this path is a renderer failure, not Cancel.
4. **X11(b).** "A pick that names an incoming splat by path or file name shows that splat" moves from the store's leftover re-pick into the workflow. Behaviour is unchanged.

**User decisions needed:** none. F2 names one product alternative for publications.

---

## F2: Share links force None when no splat is showing

### Verified

**The share function records None for every scene without a splat.**
- `src/utils/splatFileSourcePolicy.ts:260-263`: `getShareActiveSplatSourceId` returns `''` whenever a dataset is loaded and no splat is active.
- At v0.15.4 it returned `null` in every no-splat case (`git show v0.15.4:src/utils/splatFileSourcePolicy.ts`, `:260-271`). 5af7c3a changed it.

**Every writer uses it.**
- `src/hooks/useUrlState.ts:62-65` (`collectShareConfig`) writes it whenever it is not `null`. Share links, embed links (`generateEmbedUrl`, `:331`) and publication snapshots (`src/features/datasetPublishing/publicationSnapshot.ts:31`) all go through it.
- Publications have a second copy of the rule: `src/features/datasetPublishing/preparePublication.ts:206-207` writes `activeSourceId: input.activeSplatId === null ? '' : …`. v0.15.4 wrote the first published splat instead (`activeSourceId ?? splatPaths[0]`, only when splats were published).
- The in-load reading uses it too (`src/hooks/useFileDropzone.ts:108-111`). With nothing on screen it reports `''`, None, although the user chose nothing.

**What a recipient gets.** `requestSplatForLoad` (`src/hooks/useUrlLoader.ts:106-109`) records `''` before the commit. The commit shows None (`src/store/reconstructionStore.ts:373`), the restore applies None, and `offerSplatPicker` is skipped (`useUrlLoader.ts:211-213`). The dataset's own `colmapview.yaml` choice and the automatic pick never apply.

**No-splat states that are not a choice:**
- the sharer's splat list timed out, so nothing is listed;
- the splat failed to render (`dropFailedSplat`);
- a lazy download failed;
- the picker has not been answered.

The reviewer reproduced the first two end to end (`zz_VA1-3_1`).

**RED** (HEAD code):
- the policy test: `expected '' to be null`;
- the three `collectShareConfig` cases: `expected '' to be undefined`;
- the publication test: `expected '' to be 'splats/scene.ply'`;
- the six store tests read `splatNoneChosen` as `undefined`.

### Root cause

"No splat is showing" is treated as "None was chosen". The store keeps no record of a None choice, so the share function cannot tell an explicit or saved None from a failure, a timed-out list or an unanswered picker.

### Fix (code)

**Recommended: the store records a None choice for the files on screen** (`splatNoneChosen`). The share function returns `''` only with it, and `null` (no choice) otherwise.

**States that are a None choice:**
- **An explicit None:** the picker's None row, or closing it while nothing shows (G13); the Point Cloud panel's None; the decode branch of `cancelLoading` (R1 §G3: cancelling a decode is choosing None).
- **A saved None:** `selectSplatSource('', { restore: true })`, from a saved `colmapview.yaml`, published state or a link; and a link's None committed before its scene existed (G11, `requestedSplatSourceId === ''`).

**Lifecycle:**
- It is set by those paths.
- It is cleared when a splat shows: every activation, and a commit that shows one.
- It is cleared when another dataset's files are installed: `setDroppedFiles` with a different map, the pattern `sourceViewerState` already uses.
- It is kept over a Reload, which commits the same file map and keeps None on screen (`carryOverSplatState`).
- It is cleared by `clear()`.
- A failed splat (`dropFailedSplat`) never sets it. A splat was showing, so the flag is already false.

**Alternatives, rejected:**
- **Reuse `requestedSplatSourceId`, with `''` after a None.** That field means "the splat the next commit shows". G7 resets it at every load start and `setLoadedFiles` consumes it. Overloading it would deepen X11(b)'s hidden channel.
- **A flag inside `LoadedFiles`.** Every constructor and copy of `LoadedFiles` would have to handle it: the activations, the catalog merge, the Reload carry-over and four workflow commits.
- **Derive it from `splatSelectionRevision`.** A restore (a saved None) does not bump it, and every explicit choice bumps it, None or not.

`src/utils/splatFileSourcePolicy.ts`. The second parameter is required, so `tsc` finds every caller.
```diff
-export function getShareActiveSplatSourceId(loadedFiles: LoadedFiles | null): string | null {
-  // Empty is an explicit COLMAP-only choice; absence keeps legacy load defaults.
-  return loadedFiles ? getActiveSplatSourceId(loadedFiles) ?? '' : null;
+/**
+ * The splat a share link or a dataset load reads as the choice for the scene on screen: the one showing,
+ * '' when None was chosen, or null for no choice. A splat list that timed out, a splat that failed and a
+ * picker not answered yet are no choice, so a recipient keeps the dataset's own default.
+ */
+export function getShareActiveSplatSourceId(loadedFiles: LoadedFiles | null, noneChosen: boolean): string | null {
+  if (!loadedFiles) return null;
+  return getActiveSplatSourceId(loadedFiles) ?? (noneChosen ? '' : null);
 }
```

`src/store/reconstructionStore.ts`. These are Task A's edits. F10 edits the same `selectSplatSource` blocks later, in Task B.
```diff
@@ interface ReconstructionState
   /** Explicit source choices supersede pending startup restoration, including choosing None again. */
   splatSelectionRevision: number;
+  /**
+   * No splat shows because None was chosen for these files: by the user (the picker, the Point Cloud panel,
+   * Cancel of a decode) or by saved settings or a link. A splat that failed, or none loaded, is no choice.
+   */
+  splatNoneChosen: boolean;
   /**
    * Whether to show the "select a splat" popup. …
@@ initial state
   splatSelectionRevision: 0,
+  splatNoneChosen: false,
   showSplatPicker: false,
@@ setLoadedFiles, the final set
     set({
       loadedFiles: resolvedLoadedFiles,
       requestedSplatSourceId: requestedSplatSourceId === null ? get().requestedSplatSourceId : null,
+      // A Reload keeps None on screen; another dataset's files arrive with no choice (setDroppedFiles).
+      splatNoneChosen: !hasSplatFile && (requestedSplatSourceId === '' || get().splatNoneChosen),
     });
   },
 
   setDroppedFiles: (droppedFiles) => set({
     droppedFiles,
-    // Settings belong to the files they came with; another dataset must not inherit them.
+    // Settings and a None choice belong to the files they came with; another dataset must not inherit them.
     ...(get().sourceViewerState?.files === droppedFiles ? {} : { sourceViewerState: null }),
+    ...(get().droppedFiles === droppedFiles ? {} : { splatNoneChosen: false }),
   }),
@@ selectSplatSource, the None branch
     if (!source) {
-      showColmapOnly(set, loadedFiles);
+      showColmapOnly(set, loadedFiles, { splatNoneChosen: true });
       return;
     }
@@ selectSplatSource, the downloaded branch
       set({
         requestedSplatSourceId: source.id,
         loadedFiles: applyActiveSplatFile(loadedFiles, source.id, source.file),
+        splatNoneChosen: false,
         ...withoutSplatFailureError(get()),
@@ selectSplatSource, the byte-less branch
         set({
           requestedSplatSourceId: source.id,
           loadedFiles: applyActiveSplatPlaceholder(latest, source.id, placeholder),
+          splatNoneChosen: false,
           // Download AND decode are done; unlike the retaining path there is no
@@ selectSplatSource, the fetched branch
       set({
         requestedSplatSourceId: source.id,
         loadedFiles: applyActiveSplatFile(latest, source.id, file),
+        splatNoneChosen: false,
         ...withoutSplatFailureError(get()),
       });
@@ cancelLoading, the decode branch
-      showColmapOnly(set, loadedFiles, { splatSelectionRevision: splatSelectionRevision + 1 });
+      showColmapOnly(set, loadedFiles, { splatSelectionRevision: splatSelectionRevision + 1, splatNoneChosen: true });
       return;
@@ clear
       requestedSplatSourceId: null,
+      splatNoneChosen: false,
       showSplatPicker: false,
```
**Why `setLoadedFiles` needs both terms:**
- `requestedSplatSourceId === ''` is a link's None committed before its scene existed (G11). The restore applies None again right after, but the commit records it in case the load is cancelled first.
- `get().splatNoneChosen` keeps a Reload's None. A new dataset's commit calls `setDroppedFiles(files)` first (`src/hooks/fileDropzoneWorkflow.ts:209`, `:252`, `:507`, `:609`), which has already cleared it.

`src/hooks/useUrlState.ts` (`collectShareConfig`):
```diff
-  const activeSplatSourceId = getShareActiveSplatSourceId(useReconstructionStore.getState().loadedFiles);
+  const { loadedFiles, splatNoneChosen } = useReconstructionStore.getState();
+  const activeSplatSourceId = getShareActiveSplatSourceId(loadedFiles, splatNoneChosen);
   if (activeSplatSourceId !== null) {
```

`src/hooks/useFileDropzone.ts` (`getSplatSelectionState`, the in-load reading):
```diff
         getSplatSelectionState: () => {
-          const { splatSelectionRevision, loadedFiles } = useReconstructionStore.getState();
-          return { revision: splatSelectionRevision, sourceId: getShareActiveSplatSourceId(loadedFiles) ?? undefined };
+          const { splatSelectionRevision, loadedFiles, splatNoneChosen } = useReconstructionStore.getState();
+          return { revision: splatSelectionRevision, sourceId: getShareActiveSplatSourceId(loadedFiles, splatNoneChosen) ?? undefined };
         },
```
**Effect on the in-load rule** (`fileDropzoneWorkflow.ts:582-599`):
- A None chosen during the load still reads `''` and is honoured.
- A pick that leaves nothing showing without a None now reads `undefined`: a lazy tile still downloading from a no-choice scene, or a splat that failed meanwhile. That re-bases the restore revision, so the incoming dataset's saved splat restores. Before, it read `''` and committed None.

`src/features/datasetPublishing/preparePublication.ts`. The snapshot's `config` already carries the choice, from `collectShareConfig`.
```diff
   const config: ShareConfig = sanitizeShareConfig(structuredClone(input.config));
   config.transform = createIdentityEuler();
+  // With no splat showing, COLMAP only is saved just when the publisher chose None; else the first splat.
+  const chosenSourceId = input.activeSplatId !== null ? activeSourceId ?? splatPaths[0] ?? ''
+    : input.config.splat?.activeSourceId === '' ? '' : splatPaths[0];
   config.splat = { transform: sim3dToEuler(composeSim3d(createSim3dFromEuler(input.transform), createSim3dFromEuler(input.splatTransform))),
-    activeSourceId: input.activeSplatId === null ? '' : activeSourceId ?? splatPaths[0] ?? '' };
+    ...(chosenSourceId === undefined ? {} : { activeSourceId: chosenSourceId }) };
```
- **A splat shows:** unchanged.
- **None chosen:** `''`, as now.
- **No choice:** v0.15.4's rule, the first published splat. When no splat is published, nothing is written. Drive packages only the active splat, so a Drive publication writes nothing in this case.
- **Product alternative:** always omit `activeSourceId` when no splat shows, and let each viewer's automatic pick decide. v0.15.4 parity is recommended, so no user decision is needed. In practice "no choice with splats published" means the publisher's own splat failed to render; the first splat then still reaches recipients whose devices can draw it.

### Tests (code)

**`src/utils/splatFileSourcePolicy.test.ts`.** Replace the two tests of `describe('share splat source selection')`:
```ts
  it('records COLMAP only when None was chosen, and no choice when nothing shows for another reason', () => {
    const lazy = loaded({ splatFileSources: [{ id: 'lazy', path: 'lazy.ply', url: 'u/lazy' }] });
    expect(getShareActiveSplatSourceId(null, false)).toBeNull();
    expect(getShareActiveSplatSourceId(lazy, true)).toBe('');
    // A listing that timed out, a failed splat or an unanswered picker: recipients keep the dataset's default.
    expect(getShareActiveSplatSourceId(lazy, false)).toBeNull();
    expect(getShareActiveSplatSourceId(loaded({}), false)).toBeNull();
  });

  it('uses source identity for a byte-less active placeholder in a lazy catalog', () => {
    const source: SplatFileSource = { id: 'model/b.ply', path: 'model/b.ply', url: 'u/b' };
    const catalog = loaded({ splatFileSources: [source, { id: 'model/a.ply', path: 'model/a.ply', url: 'u/a' }] });
    expect(getShareActiveSplatSourceId(applyActiveSplatPlaceholder(catalog, source.id, new File([], 'b.ply')), false))
      .toBe('model/b.ply');
  });
```

**`src/store/reconstructionStore.test.ts`.** A new `describe`, inserted before `describe('reconstruction store settings timeout warning'`. It uses the file's existing imports.
```ts
describe('reconstruction store None choice', () => {
  const a = new File(['a'], 'a.spz');
  const listed = () => baseLoadedFiles({ splatFile: a, splatFiles: [a], splatFileSources: [
    { id: 'splats/a.spz', path: 'splats/a.spz', file: a },
    { id: 'splats/b.spz', path: 'splats/b.spz', url: 'https://x/ds/splats/b.spz', size: 20 }] });

  beforeEach(() => {
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useReconstructionStore.getState().setDroppedFiles(new Map([['splats/a.spz', a]]));
    useReconstructionStore.getState().setLoadedFiles(listed());
    useReconstructionStore.setState({ reconstruction: buildReconstruction() });
  });

  afterEach(() => {
    useReconstructionStore.getState().clear();
  });

  it.each([
    ['the picker or the Point Cloud panel', () => useReconstructionStore.getState().selectSplatSource('')],
    ['saved settings or a link', () => useReconstructionStore.getState().selectSplatSource('', { restore: true })],
    ['Cancel of its decode', () => {
      useReconstructionStore.setState({ urlLoading: true, urlProgress: getSplatLoadingProgress(a, { startPercent: 60 }) });
      useReconstructionStore.getState().cancelLoading();
    }],
  ])('records None chosen through %s until a splat shows again', async (_how, chooseNone) => {
    expect(useReconstructionStore.getState().splatNoneChosen).toBe(false);

    await chooseNone();

    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useReconstructionStore.getState().splatNoneChosen).toBe(true);
    await useReconstructionStore.getState().selectSplatSource('splats/a.spz');
    expect(useReconstructionStore.getState().splatNoneChosen).toBe(false);
  });

  it('records no choice when the splat failed or the dataset loads without one', () => {
    useReconstructionStore.getState().dropFailedSplat(a);
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useReconstructionStore.getState().splatNoneChosen).toBe(false);

    useReconstructionStore.getState().setDroppedFiles(new Map());
    useReconstructionStore.getState().setLoadedFiles(baseLoadedFiles({}));
    expect(useReconstructionStore.getState().splatNoneChosen).toBe(false);
  });

  it('records a None a link asked for before its scene existed', () => {
    useReconstructionStore.getState().clear();
    useReconstructionStore.getState().setRequestedSplatSourceId('');
    useReconstructionStore.getState().setDroppedFiles(new Map([['splats/a.spz', a]]));
    useReconstructionStore.getState().setLoadedFiles(listed());

    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(useReconstructionStore.getState().splatNoneChosen).toBe(true);
  });

  it('keeps None over a Reload of the same files and forgets it for another dataset', async () => {
    const files = useReconstructionStore.getState().droppedFiles!;
    await useReconstructionStore.getState().selectSplatSource('');

    // A Reload commits the same file map again, keeping None on screen.
    useReconstructionStore.getState().setDroppedFiles(files);
    useReconstructionStore.getState().setLoadedFiles({ ...listed(), splatFile: undefined });
    expect(useReconstructionStore.getState().splatNoneChosen).toBe(true);

    useReconstructionStore.getState().setDroppedFiles(new Map([['splats/a.spz', a]]));
    useReconstructionStore.getState().setLoadedFiles({ ...listed(), splatFile: undefined });
    expect(useReconstructionStore.getState().splatNoneChosen).toBe(false);
  });
});
```

**`src/hooks/useUrlState.test.ts`.**
- In "round trips COLMAP only and overrides a saved splat without downloading it", the sharer now chooses None explicitly. After `installSavedSplatSources();` add:
```ts
    // The sharer chose None in the picker or the Point Cloud panel.
    await useReconstructionStore.getState().selectSplatSource('');
```
- Add after that test:
```ts
  it.each([
    ['none are listed', () => { useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles()); }],
    ['the listed splats still wait for a choice', () => { installSavedSplatSources(); }],
    ['the splat on screen failed to render', async () => {
      const alternate = installSavedSplatSources();
      await useReconstructionStore.getState().selectSplatSource('splats/alternate.spz');
      useReconstructionStore.getState().dropFailedSplat(alternate);
    }],
  ])('leaves the splat to the dataset when no splat shows because %s', async (_why, setUp) => {
    await setUp();
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(collectShareConfig().splat?.activeSourceId).toBeUndefined();
  });
```

**`src/features/datasetPublishing/preparePublication.test.ts`.**
- In "publishes available splats while preserving COLMAP only in the saved viewer settings", the publisher now chooses None. After `source.activeSplatId = null;` add:
```ts
    // The publisher chose None, which the snapshot's share settings record.
    source.config = { splat: { activeSourceId: '' } };
```
- Add after that test:
```ts
  it('records no None the publisher never chose', async () => {
    const source = input();
    const splat = new File(['available splat'], 'scene.ply');
    source.dataset.loadedFiles!.splatFileSources = [{ id: 'scene', path: splat.name, file: splat }];
    const signal = new AbortController().signal;
    // Nothing shows, for example after the splat failed to render: the first published splat, as before.
    expect((await preparePublication(source, signal, deps())).viewerState.config.splat?.activeSourceId).toBe('splats/scene.ply');
    // Without splats there is nothing to choose.
    expect((await preparePublication(input(), signal, deps())).viewerState.config.splat?.activeSourceId).toBeUndefined();
  });
```

**Test helpers that read the in-load choice.** Five copies of `getSplatSelectionState` call the share function: `src/hooks/useUrlLoader.test.ts:94` and `:507`, and `src/hooks/fileDropzoneWorkflow.test.ts:378`, `:409` and `:462`. Without the flag, `tsc` fails and the in-load None tests ("lets None chosen during the load win…", "retains a user None choice…") fail at runtime. In each, pass the flag:
```ts
        sourceId: getShareActiveSplatSourceId(useReconstructionStore.getState().loadedFiles,
          useReconstructionStore.getState().splatNoneChosen) ?? undefined }),
```

**RED/GREEN record:**

| Test | HEAD | With the fix |
|---|---|---|
| policy: "records COLMAP only when None was chosen…" | RED: `expected '' to be null` | GREEN |
| store: "records None chosen through %s…" ×3, "records no choice…", "records a None a link asked for…", "keeps None over a Reload…" | RED: `splatNoneChosen` is `undefined` | GREEN |
| `useUrlState`: "leaves the splat to the dataset when no splat shows because %s" ×3 | RED: `expected '' to be undefined` | GREEN |
| publication: "records no None the publisher never chose" | RED: `expected '' to be 'splats/scene.ply'` | GREEN |
| the two edited tests and the five helpers | pass | pass |

### Risks and interactions

- **G11 is kept.** `requestSplatForLoad` still records a link's `''` before any decode, and `setLoadedFiles` still commits it as None (`:373`). In addition the flag records it, so a recipient who shares the scene on keeps None. The pinned tests pass: store "commits a None requested before its scene existed…", and the loader's "commits a startup link's None without handing the archive's default splat to the renderer".
- **R1 §G3 and G13.** The decode-Cancel branch and closing the picker while nothing shows are None choices, and they now set the flag.
- **Recipients of links without a choice** get v0.15.4's behaviour: the dataset's saved splat, the automatic pick, or the picker (`useUrlLoader.ts:211-215`).
- **Old links.** Only unpushed builds produced `''` for a no-choice scene, so no published link depends on the old reading.
- **Other areas' files.**
  - `preparePublication.ts` and its test are Q3's (F13 edits `:164-172` and `:197`). The hunks differ, but the tasks must not run at the same time.
  - `useUrlState.ts` is Q1's too (F9 edits `applySavedViewerState`'s `restorationConfig`, `:131-144`). This spec edits `collectShareConfig`, `:62-63`.
  - `useFileDropzone.ts` is Q1's too (F15 pins `:40`, `:115` and `:121`; X6 edits `beginLocalLoad`). This spec edits `:108-111`.
  - `useUrlLoader.test.ts` is Q1's too (F1 edits `:1084`). This spec edits the helpers at `:94` and `:507`.
- **E2e.**
  - `hugging-face-publish.spec.ts` publishes a dataset without splats. Its `colmapview.yaml` now omits `activeSourceId` instead of writing `''`. The spec checks only `background_color:`, and it passes.
  - `dataset-viewer-settings.spec.ts` restores no splat choice. It passes, apart from Q1's F1 case.

### Effort
**high / high.** A new piece of store state whose lifecycle crosses the commit, Reload, restore and G11 paths, plus the publication rule. The review has to walk every path that hides a splat.

---
## F4: A decode Cancel no longer stops a pending Reload under WebGPU

### Verified

**What Cancel does while a renderer's progress shows.** `src/store/reconstructionStore.ts:667-680`: the decode branch of `cancelLoading` chooses None and returns. It no longer calls `cancelPendingReconstructionLoad()` or `urlLoadController.abort()` (847992a, R1 §G3). Which branch runs depends on the progress on screen (`rendererOwnsSplatProgress`, `:58-60`).

**Spark yields; WebGPU does not.**
- Spark leaves the loading state to a dataset load that began after its attempt (`src/components/viewer3d/PointCloud/SplatLayer.tsx:236-241`, used at `:249`, `:301`, `:325` and `:346`; ruling 5).
- `WebGpuSplatCanvasLayer.tsx` has no such rule. While a dataset load is pending it still writes:
  - `startSplatLoadingNotification` (`:133-163`): `setUrlLoading(true)` and its progress, on every attempt, on every adapter retry (`:420`) and when reporting turns on (`:187-215`);
  - `setSplatPhaseProgress`, `setSplatLoadProgress` and `setSplatUploadProgress` (`:176-185`, `:217-261`): every read, decode, pack and upload event;
  - `finishSplatLoadingNotification` (`:277-290`): `Complete`, then `setUrlLoading(false)`;
  - `failSplatLoadingNotification` (`:292-309`) and `clearSplatLoadingNotification` (`:125-131`): `setUrlLoading(false)`.

**The scenario, with the real layer, store and workflow:**
1. Desktop WebGPU, a local dataset with two splats and unsaved edits (scale 3, one pending deletion). `n` switches splat, and WebGPU decodes the new one under the overlay.
2. The user clicks Reload in the Transform panel (portaled at `z-tooltip` 2000, above the overlay's 500) and confirms.
3. The Reload shows "Parsing COLMAP files...". WebGPU's next decode event replaces it with "Decoding splat..." (`splatRenderer: 'webgpu'`).
4. Cancel loading now takes the decode branch: None, overlay hidden, `isReconstructionLoadPending()` still true. The Reload commits invisibly: scale 3 → 1, deletions 1 → 0.
5. Without a Cancel, WebGPU's first frame (`finishSplatLoadingNotification`) hides the Reload's overlay and Cancel while it still parses, and reopens `handleDrop`'s gate.

**RED** (HEAD code, the new layer tests below):
- "keeps a Reload's progress…": `expected 'Decoding splat...' to be 'Parsing COLMAP files...'`;
- "keeps a Reload's overlay and Cancel when the old splat finishes decoding": `urlLoading` is false.

### Root cause

Ruling 5 was implemented in the Spark layer only. The WebGPU layer, the default on desktop, treats every write of the loading state as its own, so it takes over a load that began after its attempt. `cancelLoading` reads the progress on screen to decide what Cancel means, so it cancels the wrong thing.

### Fix (code)

**Recommended: the WebGPU layer yields the way Spark does** (the brief's first option).
- An attempt records whether a dataset load was pending when it began (`attemptRef`). It is set once per decode attempt, in the main effect, so adapter retries and a reporting flip keep it.
- `yieldsLoadingState(file)` is true when a tile download is pending (F10's term), or when a dataset load is pending and this attempt did not begin during it.
- Every write of `urlLoading` or `urlProgress` checks it: start, the three progress setters, finish, fail and clear. The notifications ("Loading splat…", "Loaded splat…") are unchanged.
- Scene3D passes the two checks from its store facade as optional props. Without them, as in the existing tests and harnesses, nothing changes.

**Why not the second option** (`cancelLoading`'s decode branch also cancels a pending dataset load it does not belong to):
- The store cannot tell whether the decoding splat belongs to the pending load. A local load restores inside `processFiles`, so the splat it committed decodes while the load is still pending, and Cancel there must stay None (R1 §G3's rule for a load settling its scene).
- It would fix only half of F4: WebGPU's progress would still replace the Reload's, and its first frame would still hide the Reload's overlay and Cancel.

**How R1 §G3 is kept.** `cancelLoading` is unchanged.
- **G3's window**, a URL load settling after `processFiles` returned (for example awaiting the settings beside a merged splat archive): no dataset load is pending then (`load.finish()` has run), so the WebGPU layer does not yield. Its progress shows, `rendererOwnsSplatProgress` holds, and Cancel is None while the URL load goes on. The pinned tests pass unchanged: `useUrlLoader.test.ts:894` "applies the settings beside a splat archive after %s stops its decode over the open scene", and the store's `:1731` "lets a URL load that is still settling its scene run on…".
- **A splat a pending load committed** (a local load restoring inside `processFiles`) began decoding during that load, so it is the load's own. Its progress shows and Cancel is None (guard test below).
- **A URL load's pre-commit settle** (G6, pending): an old scene's WebGPU decode yields, so Cancel stops the URL load. That is what Spark already does.

`src/components/viewer3d/WebGpuSplatCanvasLayer.tsx`:
```diff
@@ props
   setUrlLoading,
   setUrlProgress,
   reportLoadingProgress = true,
+  isDatasetLoadPending,
+  isSplatDownloadPending,
   onRuntimeReady,
@@ prop types
   reportLoadingProgress?: boolean;
+  /** A dataset load is pending: unless this splat began decoding during it, the loading state is its own. */
+  isDatasetLoadPending?: () => boolean;
+  /** A tile download is pending: the loading state is its own. */
+  isSplatDownloadPending?: () => boolean;
   onRuntimeReady?: () => void;
@@ refs
   const reportLoadingProgressRef = useRef(reportLoadingProgress);
+  // Whether this splat began decoding while a dataset load was pending, which makes it that load's own.
+  const attemptRef = useRef<{ file: File; startedDuringDatasetLoad: boolean } | null>(null);
   const shouldMount = mounted ?? visible;
 
+  // A tile download, or a dataset load that began after this splat began decoding, owns the overlay,
+  // progress and URL error, although the splat still belongs to the scene on screen until replaced.
+  const yieldsLoadingState = useCallback((file: File) => {
+    const attempt = attemptRef.current;
+    return Boolean(isSplatDownloadPending?.())
+      || (Boolean(isDatasetLoadPending?.()) && !(attempt?.file === file && attempt.startedDuringDatasetLoad));
+  }, [isDatasetLoadPending, isSplatDownloadPending]);
+
   const dismissSplatLoadingNotification = useCallback((file?: File): SplatLoadingNotification | null => {
@@ clearSplatLoadingNotification
     const dismissed = dismissSplatLoadingNotification(file);
-    if (isSplatLoadingProgressForRenderer(getUrlProgress?.(), dismissed?.file, 'webgpu')) {
+    if (dismissed && !yieldsLoadingState(dismissed.file)
+      && isSplatLoadingProgressForRenderer(getUrlProgress?.(), dismissed.file, 'webgpu')) {
       setUrlLoading?.(false);
     }
     return Boolean(dismissed);
-  }, [dismissSplatLoadingNotification, getUrlProgress, setUrlLoading]);
+  }, [dismissSplatLoadingNotification, getUrlProgress, setUrlLoading, yieldsLoadingState]);
@@ startSplatLoadingNotification
     if (!reportLoadingProgressRef.current) {
       return;
     }
 
-    setUrlLoading?.(true);
     progressStartRef.current = {
       file,
       percent: getSplatProgressStartPercent(getUrlProgress?.()),
     };
-    setUrlProgress?.(getSplatLoadingProgress(file, {
-      startPercent: progressStartRef.current.percent,
-      renderer: 'webgpu',
-    }));
+    if (!yieldsLoadingState(file)) {
+      setUrlLoading?.(true);
+      setUrlProgress?.(getSplatLoadingProgress(file, {
+        startPercent: progressStartRef.current.percent,
+        renderer: 'webgpu',
+      }));
+    }
 
     if (!addNotification || !removeNotification) {
 …
-  }, [addNotification, getUrlProgress, removeNotification, setUrlLoading, setUrlProgress]);
+  }, [addNotification, getUrlProgress, removeNotification, setUrlLoading, setUrlProgress, yieldsLoadingState]);
@@ setSplatPhaseProgress, setSplatLoadProgress and setSplatUploadProgress: the same two edits in each
-    if (!reportLoadingProgressRef.current) {
+    if (!reportLoadingProgressRef.current || yieldsLoadingState(file)) {
       return;
     }
 …
-  }, [getProgressStartPercent, setUrlProgress]);
+  }, [getProgressStartPercent, setUrlProgress, yieldsLoadingState]);
@@ finishSplatLoadingNotification
+    const yieldsLoading = yieldsLoadingState(file);
     const hadNotification = clearSplatLoadingNotification(file);
-    setUrlProgress?.(getSplatLoadedProgress(file, { renderer: 'webgpu' }));
-    setUrlLoading?.(false);
+    if (!yieldsLoading) {
+      setUrlProgress?.(getSplatLoadedProgress(file, { renderer: 'webgpu' }));
+      setUrlLoading?.(false);
+    }
     if (!hadNotification || !reportLoadingProgressRef.current) {
       return;
     }
 
     addNotification?.('info', `Loaded splat: ${file.name}`, 3000);
-  }, [addNotification, clearSplatLoadingNotification, ownsWebGpuSplatLoading, setUrlLoading, setUrlProgress]);
+  }, [addNotification, clearSplatLoadingNotification, ownsWebGpuSplatLoading, setUrlLoading, setUrlProgress, yieldsLoadingState]);
@@ failSplatLoadingNotification
+    const yieldsLoading = yieldsLoadingState(file);
     const ownsExplicitWebGpuProgress = isSplatLoadingProgressForRenderer(getUrlProgress?.(), file, 'webgpu');
     const hadNotification = clearSplatLoadingNotification(file);
     if (!reportLoadingProgressRef.current && !ownsExplicitWebGpuProgress) {
       return;
     }
 
-    setUrlLoading?.(false);
+    if (!yieldsLoading) {
+      setUrlLoading?.(false);
+    }
     if (!hadNotification || !reportLoadingProgressRef.current) {
       return;
     }
 
     addNotification?.('warning', `Failed to load splat: ${file.name}`);
-  }, [addNotification, clearSplatLoadingNotification, getUrlProgress, ownsWebGpuSplatLoading, setUrlLoading]);
+  }, [addNotification, clearSplatLoadingNotification, getUrlProgress, ownsWebGpuSplatLoading, setUrlLoading, yieldsLoadingState]);
@@ the main effect
     const sourceFile = splatFile;
     rendererRef.current = null;
     readyReportedRef.current = false;
+    attemptRef.current = { file: sourceFile, startedDuringDatasetLoad: isDatasetLoadPending?.() ?? false };
     let cancelled = false;
 …
   }, [
     clearSplatLoadingNotification,
     failSplatLoadingNotification,
+    isDatasetLoadPending,
     onAdapterUnavailable,
```
Moving `setUrlLoading(true)` below the `progressStartRef` assignment changes nothing: `setUrlLoading` does not touch `urlProgress`, which the start percent reads.

`src/components/viewer3d/useScene3DStoreFacade.ts`:
```diff
 import { shouldHideSceneAutoHideElement } from './scene3dViewModel';
+import { isSplatDownloadPending } from '../../store/reconstructionStore';
+import { isReconstructionLoadPending } from '../../wasm/reconstructionLoadLifecycle';
@@ interface SceneContainerActionsFacade
   setUrlProgress: ReturnType<typeof useReconstructionStore.getState>['setUrlProgress'];
+  /** A dataset load is pending: unless the splat began decoding during it, the loading state is its own. */
+  isDatasetLoadPending: () => boolean;
+  /** A tile download is pending: the loading state is its own. */
+  isSplatDownloadPending: () => boolean;
 }
@@ useSceneContainerStoreFacade, actions
       getUrlProgress: getCurrentUrlProgress,
       setUrlLoading,
       setUrlProgress,
+      isDatasetLoadPending: isReconstructionLoadPending,
+      isSplatDownloadPending,
     },
```

`src/components/viewer3d/Scene3D.tsx`:
```diff
       getUrlProgress,
       setUrlLoading,
       setUrlProgress,
+      isDatasetLoadPending,
+      isSplatDownloadPending,
     },
   } = useSceneContainerStoreFacade();
@@ <WebGpuSplatCanvasLayer
         reportLoadingProgress={webGpuSplatCanvasReportsLoading}
+        isDatasetLoadPending={isDatasetLoadPending}
+        isSplatDownloadPending={isSplatDownloadPending}
         onRuntimeReady={handleWebGpuSplatRuntimeReady}
```
Both checks are stable module functions, so `yieldsLoadingState` and the callbacks built on it keep their identity, and no effect re-runs.

### Tests (code)

**`src/components/viewer3d/WebGpuSplatCanvasLayer.test.tsx`** (LF line endings). Replace
```ts
import { appLogger } from '../../utils/logger';
import { useSplatBackendStore } from '../../store';
```
with
```ts
import { appLogger, noopLogger } from '../../utils/logger';
import { useDeletionStore, useNotificationStore, useReconstructionStore, useSplatBackendStore, useTransformStore } from '../../store';
import { isSplatDownloadPending } from '../../store/reconstructionStore';
import { beginReconstructionLoad, isReconstructionLoadPending } from '../../wasm/reconstructionLoadLifecycle';
import { processFileDropzoneFiles } from '../../hooks/fileDropzoneWorkflow';
import type { GaussianCloudLoadProgress } from '../../splat/gaussianCloudLoader';
import { getSplatLoadingProgress } from '../../utils/splatLoadingProgressPolicy';
import { createIdentityEuler } from '../../utils/sim3dTransforms';
import { buildReconstruction } from '../../test/builders';
```
Insert before `describe('waitForWebGpuSplatViewIdle'`. The last test is F10's, for the WebGPU layer.
```tsx
/** Scene3D's wiring: the store's loading state and active splat, with the ownership checks it passes. */
function StoreWiredLayer() {
  const splatFile = useReconstructionStore((s) => s.loadedFiles?.splatFile);
  const setUrlLoading = useReconstructionStore((s) => s.setUrlLoading);
  const setUrlProgress = useReconstructionStore((s) => s.setUrlProgress);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const removeNotification = useNotificationStore((s) => s.removeNotification);
  const getUrlProgress = useCallback(() => useReconstructionStore.getState().urlProgress, []);
  return (
    <WebGpuSplatCanvasLayer mounted visible splatFile={splatFile} addNotification={addNotification}
      removeNotification={removeNotification} getUrlProgress={getUrlProgress} setUrlLoading={setUrlLoading}
      setUrlProgress={setUrlProgress} isDatasetLoadPending={isReconstructionLoadPending}
      isSplatDownloadPending={isSplatDownloadPending} />
  );
}

describe('WebGpuSplatCanvasLayer decoding a splat that another load or download overtakes', () => {
  const originalGpu = (navigator as Navigator & { gpu?: unknown }).gpu;
  const old = new File(['old splat'], 'old.spz');
  const colmap = () => new Map(['cameras.bin', 'images.bin', 'points3D.bin'].map(name => [name, new File([name], name)] as [string, File]));
  let decode: { resolve: (loaded: LoadedGaussianCloud) => void; onProgress?: (progress: GaussianCloudLoadProgress) => void } | undefined;
  let firstFrame: (() => void) | undefined;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(appLogger, 'info').mockImplementation(() => undefined);
    installWebGpuPreflightProvider();
    decode = undefined;
    firstFrame = undefined;
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    useDeletionStore.setState(useDeletionStore.getInitialState(), true);
    useTransformStore.setState(useTransformStore.getInitialState(), true);
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    vi.mocked(loadGaussianCloudFromFile).mockImplementation((_file, options) => new Promise(resolve => {
      decode = { resolve, onProgress: options?.onProgress };
    }));
    vi.mocked(createLoadedVisibleWebGpuSplatRendererAdapter).mockImplementation(async (_canvas, _cloud, _options, deps) => {
      firstFrame = deps?.onFirstFrame;
      return { loadCloud: vi.fn(), setFrameSnapshot: vi.fn(), render: vi.fn(), dispose: vi.fn(),
        captureFrame: vi.fn(async () => document.createElement('canvas')) } as unknown as VisibleWebGpuSplatRendererAdapter;
    });
  });

  afterEach(() => {
    useReconstructionStore.getState().clear();
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: originalGpu });
  });

  async function finishOldDecode() {
    await act(async () => { decode!.resolve({ file: old, format: 'spz', byteLength: 1, cloud: makeCloud() }); });
    await waitFor(() => expect(firstFrame).toBeDefined());
    act(() => firstFrame!());
  }

  /** The old splat decodes with unsaved edits on screen; a Reload of the same files then starts parsing. */
  async function reloadWhileOldSplatDecodes() {
    const store = useReconstructionStore.getState;
    const files = colmap();
    files.set('old.spz', old);
    store().setDroppedFiles(files);
    store().setLoadedFiles({ camerasFile: files.get('cameras.bin'), imagesFile: files.get('images.bin'),
      points3DFile: files.get('points3D.bin'), imageFiles: new Map(), hasMasks: false, splatFile: old, splatFiles: [old],
      splatFileSources: [{ id: 'old.spz', path: 'old.spz', file: old }] });
    store().setReconstruction(buildReconstruction());
    render(<StoreWiredLayer />);
    await waitFor(() => expect(decode).toBeDefined());
    expect(store().urlProgress).toMatchObject({ currentFile: 'old.spz', splatRenderer: 'webgpu' });
    useTransformStore.getState().setTransform({ ...createIdentityEuler(), scale: 3 });
    useDeletionStore.getState().markForDeletion(7);

    let releaseParse!: () => void;
    const reloading = processFileDropzoneFiles(files, {
      addNotification: vi.fn(), clearCaches: vi.fn(), delay: async () => undefined, logger: noopLogger,
      getLoadedFiles: () => store().loadedFiles, getMinTrackLength: () => 1,
      getSourceInfo: () => ({ sourceType: 'local', imageUrlBase: null }), getUrlLoading: () => store().urlLoading,
      resetView: vi.fn(), shouldPreloadSplatRuntime: () => false,
      parseFiles: ({ signal }) => new Promise((resolve, reject) => {
        releaseParse = () => resolve({ cameras: new Map(), images: new Map(), points3D: new Map(), wasmWrapper: null, usedWasmPath: false });
        signal?.addEventListener('abort', () => reject(signal.reason));
      }),
      buildReconstruction: async () => ({ reconstruction: buildReconstruction(), pointCount: 0 }),
      setDroppedFiles: store().setDroppedFiles, setLoadedFiles: store().setLoadedFiles,
      setReconstruction: store().setReconstruction, setWasmReconstruction: store().setWasmReconstruction,
      setUrlLoading: store().setUrlLoading, setUrlProgress: store().setUrlProgress, setError: store().setError,
    }, { reload: true });
    await waitFor(() => expect(store().urlProgress?.message).toBe('Parsing COLMAP files...'));
    expect(isReconstructionLoadPending()).toBe(true);
    return { reloading, releaseParse: () => releaseParse() };
  }

  it("keeps a Reload's progress over the old splat's, so Cancel loading stops the Reload and the edits stay", async () => {
    const { reloading, releaseParse } = await reloadWhileOldSplatDecodes();

    act(() => decode!.onProgress?.({ phase: 'decoding' } as GaussianCloudLoadProgress));
    expect(useReconstructionStore.getState().urlProgress?.message).toBe('Parsing COLMAP files...');

    act(() => useReconstructionStore.getState().cancelLoading());
    expect(isReconstructionLoadPending()).toBe(false);
    releaseParse();
    expect(await reloading).toBe(false);
    expect(useTransformStore.getState().transform.scale).toBe(3);
    expect(useDeletionStore.getState().pendingDeletions.size).toBe(1);
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(old);
  });

  it("keeps a Reload's overlay and Cancel when the old splat finishes decoding", async () => {
    const { reloading, releaseParse } = await reloadWhileOldSplatDecodes();

    await finishOldDecode();

    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true,
      urlProgress: expect.objectContaining({ message: 'Parsing COLMAP files...' }) });
    releaseParse();
    expect(await reloading).toBe(true);
  });

  it("reports a splat that began decoding during a dataset load as that load's own", async () => {
    // The splat the load committed, decoding before the load has restored its settings.
    const load = beginReconstructionLoad();
    try {
      useReconstructionStore.getState().setLoadedFiles({ imageFiles: new Map(), hasMasks: false, splatFile: old,
        splatFiles: [old], splatFileSources: [{ id: 'old.spz', path: 'old.spz', file: old }] });
      useReconstructionStore.setState({ urlLoading: true, urlProgress: getSplatLoadingProgress(old, { startPercent: 60 }) });
      render(<StoreWiredLayer />);
      await waitFor(() => expect(decode).toBeDefined());

      act(() => decode!.onProgress?.({ phase: 'decoding' } as GaussianCloudLoadProgress));

      expect(useReconstructionStore.getState().urlProgress).toMatchObject({ message: 'Decoding splat...', splatRenderer: 'webgpu' });
    } finally {
      load.finish();
    }
  });

  it('leaves a tile download picked with n its overlay when the old splat finishes decoding', async () => {
    useReconstructionStore.getState().setLoadedFiles({ imageFiles: new Map(), hasMasks: false, splatFile: old, splatFiles: [old],
      splatFileSources: [{ id: 'old.spz', path: 'old.spz', url: 'https://x/old.spz', file: old },
        { id: 'next.spz', path: 'next.spz', url: 'https://x/next.spz', size: 9 }] });
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    })));
    render(<StoreWiredLayer />);
    await waitFor(() => expect(decode).toBeDefined());
    act(() => { void useReconstructionStore.getState().selectSplatSource('next.spz'); });
    const downloadProgress = useReconstructionStore.getState().urlProgress;
    expect(downloadProgress).toMatchObject({ currentFile: 'next.spz' });

    await finishOldDecode();

    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true, urlProgress: downloadProgress });
  });
});
```
The Reload runs through the real `processFileDropzoneFiles` with `{ reload: true }` and the store's own setters; only parsing is held. `setReconstruction`'s scene-load branch is what would discard the edits if the Reload committed.

**`src/components/viewer3d/useScene3DStoreFacade.test.ts`** (LF line endings).
- Change the vitest import to `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';`.
- Add `import { beginReconstructionLoad } from '../../wasm/reconstructionLoadLifecycle';`.
- Inside `describe('useScene3DStoreFacade'`, before its `beforeEach`, add:
```ts
  afterEach(() => {
    vi.unstubAllGlobals();
  });
```
- Insert before "exposes point-layer auto-hide visibility for the outer WebGPU canvas":
```ts
  it('tells the WebGPU canvas when a dataset load or a tile download owns the loading state', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    })));
    useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({
      splatFileSources: [{ id: 'tile.spz', path: 'tile.spz', url: 'https://x/tile.spz', size: 1 }] }) });
    const { result } = renderHook(() => useSceneContainerStoreFacade());
    expect(result.current.actions.isDatasetLoadPending()).toBe(false);
    expect(result.current.actions.isSplatDownloadPending()).toBe(false);

    const load = beginReconstructionLoad();
    expect(result.current.actions.isDatasetLoadPending()).toBe(true);
    load.finish();

    const download = useReconstructionStore.getState().selectSplatSource('tile.spz');
    expect(result.current.actions.isSplatDownloadPending()).toBe(true);
    useReconstructionStore.getState().cancelLoading();
    await download;
    expect(result.current.actions.isSplatDownloadPending()).toBe(false);
  });
```

**RED/GREEN record:**

| Test | HEAD | With the fix |
|---|---|---|
| "keeps a Reload's progress over the old splat's…" | RED: `expected 'Decoding splat...' to be 'Parsing COLMAP files...'` | GREEN |
| "keeps a Reload's overlay and Cancel when the old splat finishes decoding" | RED: `urlLoading` false | GREEN |
| "leaves a tile download picked with n its overlay…" (F10) | RED: `urlLoading` false, progress `Complete` | GREEN |
| "reports a splat that began decoding during a dataset load as that load's own" | guard: passes at HEAD | GREEN; RED under the mutation "yield to every pending load" (`&& Boolean(attempt)`) |
| facade: "tells the WebGPU canvas when…" | RED: `isDatasetLoadPending is not a function` | GREEN |
| the file's other 34 tests (no ownership props) | pass | pass |

### Risks and interactions

- **The early window.** From the Reload's start until its first own progress ('Scanning image files...', `fileDropzoneWorkflow.ts:481`), the overlay still shows the renderer's last progress: `processFiles` writes 'Starting...' only when nothing is loading (`:421-424`). A Cancel inside those milliseconds is still None, as with Spark today. It is not reachable by hand: Reload asks for confirmation when edits exist, and the window is the time to scan the dropped files. Optional hardening, not recommended now: write the start progress for a Reload too (`if (!deps.getUrlLoading() || normalizedOptions.reload)` at `:421`).
- **A WebGPU failure during a Reload.** In auto mode the old splat then falls back to Spark, whose attempt begins during the Reload and so counts as its own (ruling 5's rule), and Spark's progress can take over. This needs a WebGPU failure inside the Reload's window.
- **"During a load" is not "during this load".** An attempt that began during load A is still treated as an owner during a later load B. Spark has the same limit; a load generation would close it. It needs a Reload started while the splat a previous load committed is still decoding.
- **After a Reload that keeps the same splat,** the decode writes its progress again once the Reload ends, but `processFiles` has already cleared `urlLoading`, so the overlay stays down until the decode finishes. That is Spark's behaviour and HEAD's.
- **The forced `?splatBackend=webgpu`** (E2 residual 1): unchanged.
- **E2e.** The WebGPU specs are not in the CI gate (`playwright.config.ts`: the `chromium` project ignores `*webgpu*`). `--project=chromium-webgpu` with the fix: 16 passed, 1 failed. At HEAD: 16 passed, 1 failed, the same flaky test ("repeats selected-image PSNR without leaking WebGPU resources", a baseline counter read). A serial run of `webgpu-psnr-app.spec.ts` fails "keeps selected-image PSNR off the visible viewer surface" at HEAD and with the fix alike.

### Effort
**high / max.** Asynchronous renderer ownership across a store, the load lifecycle and a large component. The review has to hold it against G3, ruling 5 and the Spark layer.

---
## F10: Spark callbacks don't yield to a pending tile download

### Verified

**The yield rule covers only dataset loads.** `SplatLayer.tsx:238-241` yields only while `isDatasetLoadPending()`.

**The old splat keeps decoding under the download.** A lazy pick with `n` or the panel shows its download progress at once (`reconstructionStore.ts:517-521`), but the old splat stays on screen until the tile lands (`:597-602`). So Spark keeps decoding the old splat under the download's overlay.

**What Spark's callbacks then do:**
- `finishSplatLoading` (`SplatLayer.tsx:320-339`) writes `Complete` and `setUrlLoading(false)`. The download goes on with no overlay and no Cancel.
- `failSplatLoading` (`:341-361`) writes `setUrlLoading(false)`, then calls `dropFailedSplat`, which stands aside for the download (`reconstructionStore.ts:636`).
- If the download then fails (`:606-625`), the failed splat stays active with the splat point preset (size 1, opacity 0.2): the E2 symptom.

**The WebGPU layer does the same** (F4's list). `finishSplatLoadingNotification` claims the old file through its notification (`WebGpuSplatCanvasLayer.tsx:273-274`) and clears the download's overlay.

**Reproduced** with the real layer and store: `zz_F1_1` (3/3 RED), and the tests below.

**RED** (HEAD code):
- SplatLayer: `urlLoading` is false after the old splat finishes, and after it fails;
- store: `splatFile` stays the failed `a`, under the download and after it fails too;
- WebGPU: F4's "leaves a tile download picked with n its overlay…";
- facade: `isSplatDownloadPending is not a function`.

### Root cause

Ruling 5 named only dataset loads as owners of the loading state. A lazy tile download is another owner. `dropFailedSplat`'s stand-aside also leaves the failed splat in place when the download fails, because the "newer choice" it waited for never arrives.

### Fix (code)

- **Renderer callbacks yield to a pending tile download** (`isSplatDownloadPending`, already exported for G12). Spark gets one predicate; the WebGPU predicate (F4) has the same term.
- **`dropFailedSplat` acts under a download too.** The failed splat leaves the scene and the points show again, while the download keeps its overlay, progress and Cancel.
- **The activation decides "fresh activation" when the tile lands, not when the pick started.** A fresh activation switches to the splat display; a tile-to-tile switch keeps the user's. So a tile that arrives after the failed splat left still shows. That was R1 §E2's reason to stand aside.
- X9 (below) changes the same function.

`src/components/viewer3d/PointCloud/SplatLayerStoreFacade.ts`:
```diff
 import { isReconstructionLoadPending } from '../../../wasm/reconstructionLoadLifecycle';
+import { isSplatDownloadPending } from '../../../store/reconstructionStore';
@@ interface SplatLayerActionsFacade
   /** A dataset load is pending: its overlay, progress and URL error are its own. */
   isDatasetLoadPending: () => boolean;
+  /** A tile download is pending: the overlay, progress and URL error are its own. */
+  isSplatDownloadPending: () => boolean;
 }
@@ actions
       isDatasetLoadPending: isReconstructionLoadPending,
+      isSplatDownloadPending,
     },
```

`src/components/viewer3d/PointCloud/SplatLayer.tsx`. The predicate is renamed, because it is no longer only about dataset loads.
```diff
       dropFailedSplat,
       isDatasetLoadPending,
+      isSplatDownloadPending,
     },
   } = useSplatLayerStoreFacade();
@@
-  // A dataset load that began after this splat began loading owns the overlay, progress and URL error,
-  // although the splat still belongs to the scene on screen until that load commits its own.
-  const yieldsLoadingStateToDatasetLoad = useCallback((file: File) => {
+  // A tile download, or a dataset load that began after this splat began loading, owns the overlay,
+  // progress and URL error, although the splat still belongs to the scene on screen until replaced.
+  const yieldsLoadingState = useCallback((file: File) => {
     const current = loadingNotificationRef.current;
-    return isDatasetLoadPending() && !(current?.file === file && current.startedDuringDatasetLoad);
-  }, [isDatasetLoadPending]);
+    return isSplatDownloadPending()
+      || (isDatasetLoadPending() && !(current?.file === file && current.startedDuringDatasetLoad));
+  }, [isDatasetLoadPending, isSplatDownloadPending]);
```
Then rename its four users and their dependency lists. The locals that shadowed the old name become `yieldsLoading`:
```diff
@@ clearSplatLoadingNotification
-    const yieldsLoadingState = yieldsLoadingStateToDatasetLoad(current.file);
+    const yieldsLoading = yieldsLoadingState(current.file);
     removeNotification(current.id);
     loadingNotificationRef.current = null;
-    if (!yieldsLoadingState && isSplatLoadingProgressForRenderer(getUrlProgress(), current.file, 'spark')) {
+    if (!yieldsLoading && isSplatLoadingProgressForRenderer(getUrlProgress(), current.file, 'spark')) {
       setUrlLoading(false);
     }
-  }, [getUrlProgress, removeNotification, setUrlLoading, yieldsLoadingStateToDatasetLoad]);
+  }, [getUrlProgress, removeNotification, setUrlLoading, yieldsLoadingState]);
@@ setSplatPhaseProgress
-    if (isSplatProgressOwnedByAnotherRenderer(file) || yieldsLoadingStateToDatasetLoad(file)) {
+    if (isSplatProgressOwnedByAnotherRenderer(file) || yieldsLoadingState(file)) {
 …
-  }, [getProgressStartPercent, isSplatProgressOwnedByAnotherRenderer, setUrlProgress, yieldsLoadingStateToDatasetLoad]);
+  }, [getProgressStartPercent, isSplatProgressOwnedByAnotherRenderer, setUrlProgress, yieldsLoadingState]);
@@ finishSplatLoading and failSplatLoading, the same edit in each
-    const yieldsLoadingState = yieldsLoadingStateToDatasetLoad(file);
+    const yieldsLoading = yieldsLoadingState(file);
     clearSplatLoadingNotification(file);
-    if (!yieldsLoadingState) {
+    if (!yieldsLoading) {
 …
-    yieldsLoadingStateToDatasetLoad,
+    yieldsLoadingState,
   ]);
```

`src/store/reconstructionStore.ts`, after Task A's edits:
```diff
@@ selectSplatSource
     const rendererDecoding = rendererOwnsSplatProgress(get());
     cancelPendingSplatLoad();
-    // Whether a splat was already showing: a fresh activation (COLMAP-only -> splat)
-    // switches the viewer into a splat display mode; a tile-to-tile switch keeps the
-    // user's current mode.
-    const hadSplatBefore = Boolean(loadedFiles.splatFile);
 
@@ the downloaded branch
         ...(rendererOwnsProgress ? {} : { urlLoading: false, urlProgress: null, urlError: null }),
       });
-      if (!hadSplatBefore) {
+      // A fresh activation switches the viewer into a splat display mode; a tile-to-tile switch keeps the user's.
+      if (!loadedFiles.splatFile) {
         applySplatActivationVisuals();
       }
@@ the byte-less branch
           ...withoutSplatFailureError(get()),
         });
-        if (!hadSplatBefore) {
+        // Read now: a splat that failed while this tile downloaded has already left the scene.
+        if (!latest.splatFile) {
           applySplatActivationVisuals();
         }
@@ the fetched branch
         ...withoutSplatFailureError(get()),
       });
-      if (!hadSplatBefore) {
+      // Read now: a splat that failed while this tile downloaded has already left the scene.
+      if (!latest.splatFile) {
         applySplatActivationVisuals();
       }
@@ dropFailedSplat (with X9)
   dropFailedSplat: (file) => {
     const { loadedFiles } = get();
-    // A newer choice, on screen or still downloading, supersedes the splat that failed.
-    if (!loadedFiles || loadedFiles.splatFile !== file || activeSplatController !== null) return;
-    // A dataset load in progress owns the overlay, progress and URL error, even before its scene replaces this one.
-    showColmapOnly(set, loadedFiles, {}, { keepLoadingState: isReconstructionLoadPending() });
+    // A newer choice on screen supersedes the splat that failed.
+    if (!loadedFiles || loadedFiles.splatFile !== file) return;
+    // A dataset load, or a tile download replacing this splat, owns the overlay, progress and URL error.
+    const loadingStateOwned = isReconstructionLoadPending() || activeSplatController !== null;
+    // A splat-only scene with nothing else to show would be left empty, with the landing page hidden.
+    if (!loadingStateOwned && !hasSceneBesidesSplats(loadedFiles) && !hasOtherSplatToShow(loadedFiles)) {
+      get().clear();
+      clearUrlLoadRequestFromLocation();
+      return;
+    }
+    showColmapOnly(set, loadedFiles, {}, { keepLoadingState: loadingStateOwned });
   },
```
**Why reading `latest.splatFile` is safe.** While a tile downloads, only `dropFailedSplat` can change the splat on screen. A None, another pick, a commit and `clear()` all cancel the download first (`cancelPendingSplatLoad`). So for every other path the value is the same as at the pick.

### Tests (code)

**`src/components/viewer3d/PointCloud/SplatLayer.test.tsx`.**
- In `createFacade`'s `actions`, after `isDatasetLoadPending: vi.fn(() => false),` add `isSplatDownloadPending: vi.fn(() => false),`.
- Append a new `describe` after `describe('SplatLayer while a new dataset load settles before replacing the scene'`:
```tsx
describe('SplatLayer while a tile picked with n downloads', () => {
  const oldSplat = new File(['splat'], 'old.ply');
  const notices = () => useNotificationStore.getState().notifications.map(notification => notification.message);
  let download: { signal?: AbortSignal; fail: (error: Error) => void } | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    download = undefined;
    getSplatMeshSourceOptionsMock.mockResolvedValue({ file: oldSplat });
    // The real facade and stores: the overlay, progress and Cancel under test are the store's.
    const actual = await vi.importActual<typeof import('./SplatLayerStoreFacade')>('./SplatLayerStoreFacade');
    useSplatLayerStoreFacadeMock.mockImplementation(actual.useSplatLayerStoreFacade);
    useReconstructionStore.setState(useReconstructionStore.getInitialState(), true);
    usePointCloudStore.setState(usePointCloudStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useNotificationStore.setState(useNotificationStore.getInitialState(), true);
    useSplatBackendStore.setState(useSplatBackendStore.getInitialState(), true);
    useSplatBackendStore.getState().setRequestedBackend('spark');
    useSplatBackendStore.getState().setSparkBackendAvailable(true);
    // A remote dataset: the old tile was downloaded and is active, the next one is listed lazily.
    useReconstructionStore.getState().setLoadedFiles(buildLoadedFiles({
      camerasFile: new File([''], 'cameras.bin'), imagesFile: new File([''], 'images.bin'),
      points3DFile: new File([''], 'points3D.bin'), splatFile: oldSplat, splatFiles: [oldSplat],
      splatFileSources: [
        { id: 'tiles/old.ply', path: 'tiles/old.ply', url: 'https://x/tiles/old.ply', file: oldSplat, size: 5 },
        { id: 'tiles/next.ply', path: 'tiles/next.ply', url: 'https://x/tiles/next.ply', size: 100 },
      ],
    }));
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      download = { signal: init?.signal ?? undefined, fail: reject };
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    })));
  });

  afterEach(() => {
    cleanup();
    useReconstructionStore.getState().clear();
    useSplatLayerStoreFacadeMock.mockReset();
    vi.unstubAllGlobals();
  });

  /** Spark decodes the old tile, then `n` starts downloading the next one, with its own overlay and Cancel. */
  async function pickNextWhileOldDecodes() {
    let settleInit!: { resolve: () => void; reject: (error: Error) => void };
    const initialized = new Promise<void>((resolve, reject) => { settleInit = { resolve, reject }; });
    const SparkRenderer = vi.fn(function SparkRenderer(this: { dispose: () => void }) { this.dispose = vi.fn(); });
    const { SplatMesh } = createSplatMeshConstructor(initialized);
    preloadSparkModuleMock.mockResolvedValue({ SparkRenderer, SplatMesh });
    render(<SplatLayer />);
    await waitFor(() => expect(SplatMesh).toHaveBeenCalledTimes(1));
    act(() => { void useReconstructionStore.getState().selectSplatSource('tiles/next.ply'); });
    await waitFor(() => expect(download).toBeDefined());
    const progress = useReconstructionStore.getState().urlProgress;
    expect(progress).toMatchObject({ currentFile: 'next.ply' });
    return { settleInit, progress };
  }

  it('keeps the download overlay when the old splat finishes', async () => {
    // React DOM does not know R3F's <primitive>.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { settleInit, progress } = await pickNextWhileOldDecodes();

      await act(async () => { settleInit.resolve(); });

      await waitFor(() => expect(notices()).toContain('Loaded splat: old.ply'));
      expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true, urlProgress: progress });
      expect(download?.signal?.aborted).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('keeps the download overlay when the old splat fails, and shows the points again', async () => {
    const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => undefined);
    try {
      const { settleInit, progress } = await pickNextWhileOldDecodes();

      await act(async () => { settleInit.reject(new Error('decode failed')); });

      await waitFor(() => expect(notices()).toContain('Failed to load splat: old.ply'));
      expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true, urlProgress: progress });
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
      expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'rgb', pointSize: 2, pointOpacity: 1 });

      // The download fails as well: nothing is left with the near-invisible splat point display.
      await act(async () => { download!.fail(new TypeError('network down')); });
      await waitFor(() => expect(useReconstructionStore.getState().urlLoading).toBe(false));
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
      expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'rgb', pointSize: 2, pointOpacity: 1 });
    } finally {
      warn.mockRestore();
    }
  });
});
```

**`src/components/viewer3d/PointCloud/SplatLayerStoreFacade.test.ts`.**
- Change the vitest import to `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';`.
- Inside `describe('useSplatLayerStoreFacade'`, before its `beforeEach`, add:
```ts
  afterEach(() => {
    vi.unstubAllGlobals();
  });
```
- Insert before "routes splat loading notifications to the notification store":
```ts
  it('says whether a tile download is pending, which then owns the loading state', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    })));
    useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({
      splatFileSources: [{ id: 'tile.ply', path: 'tile.ply', url: 'https://x/tile.ply', size: 1 }] }) });
    const { result } = renderHook(() => useSplatLayerStoreFacade());
    expect(result.current.actions.isSplatDownloadPending()).toBe(false);

    const download = useReconstructionStore.getState().selectSplatSource('tile.ply');
    expect(result.current.actions.isSplatDownloadPending()).toBe(true);
    useReconstructionStore.getState().cancelLoading();
    await download;
    expect(result.current.actions.isSplatDownloadPending()).toBe(false);
  });
```
- X9 changes the meaning of "leaves the scene without a splat the renderer could not draw": its splat-only scene would now return to the landing page. Give it a COLMAP file:
```diff
-    useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({ splatFile,
-      splatFileSources: [{ id: 'scene.ply', path: 'scene.ply', file: splatFile }] }) });
+    // A COLMAP scene stays on screen without it (a splat-only one would go back to the landing page).
+    useReconstructionStore.setState({ loadedFiles: buildLoadedFiles({ splatFile, camerasFile: buildFile('cameras.bin'),
+      splatFileSources: [{ id: 'scene.ply', path: 'scene.ply', file: splatFile }] }) });
```

**`src/store/reconstructionStore.test.ts`**, in `describe('reconstruction store splat the renderer could not draw')`. Replace "leaves a tile download in flight to replace the splat that failed" with a helper and four tests; the last two are X9's.
```ts
  /** `n` picked the lazy tile b while a decoded: b downloads, held until the test answers it. */
  async function downloadNextTile() {
    let answer!: { respond: (response: Response) => void; fail: (error: Error) => void };
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      answer = { respond: resolve, fail: reject };
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    })));
    const download = useReconstructionStore.getState().selectSplatSource('splats/b.ply');
    await vi.waitFor(() => expect(useReconstructionStore.getState().urlLoading).toBe(true));
    return { download, answer, progress: useReconstructionStore.getState().urlProgress };
  }

  it('drops it under a tile download, which keeps its overlay and then shows as a fresh splat', async () => {
    const { download, answer, progress } = await downloadNextTile();

    useReconstructionStore.getState().dropFailedSplat(a);

    // The points show again while b downloads; its overlay, progress and Cancel stay.
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'rgb', showSplats: false, pointSize: 2, pointOpacity: 1 });
    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true, urlProgress: progress });

    answer.respond(new Response(new Blob(['b'])));
    await download;
    expect(useReconstructionStore.getState().loadedFiles?.splatFile?.name).toBe('b.ply');
    expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'splatPoints', showSplats: true });
  });

  it('leaves the points shown when the tile download that was to replace it fails too', async () => {
    const { download, answer } = await downloadNextTile();
    useReconstructionStore.getState().dropFailedSplat(a);

    answer.fail(new TypeError('network down'));
    await download;

    expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: false, error: expect.stringContaining('b.ply') });
    expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBeUndefined();
    expect(usePointCloudStore.getState()).toMatchObject({ colorMode: 'rgb', pointSize: 2, pointOpacity: 1 });
  });

  it('returns a splat-only scene with nothing else to show to the landing page, as a cancelled decode does', () => {
    window.history.replaceState(null, '', '/?url=https%3A%2F%2Fhost%2Fscene.sog');
    const sog = new File(['x'], 'scene.sog');
    useReconstructionStore.getState().setLoadedFiles({ imageFiles: new Map(), hasMasks: false, splatFile: sog, splatFiles: [sog],
      splatFileSources: [{ id: 'scene.sog', path: 'scene.sog', file: sog }] });
    useReconstructionStore.setState({ reconstruction: buildReconstruction() });

    useReconstructionStore.getState().dropFailedSplat(sog);

    expect(useReconstructionStore.getState()).toMatchObject({ reconstruction: null, loadedFiles: null });
    expect(hasUrlToLoad()).toBe(false);
  });

  it('keeps a splat-only scene that lists another splat, and one a dataset load is replacing', () => {
    const only = new File(['x'], 'scene.spz');
    const splatOnly = (sources: LoadedFiles['splatFileSources']) => {
      useReconstructionStore.getState().setLoadedFiles({ imageFiles: new Map(), hasMasks: false, splatFile: only,
        splatFiles: [only], splatFileSources: sources });
      useReconstructionStore.setState({ reconstruction: buildReconstruction() });
    };
    splatOnly([{ id: 'scene.spz', path: 'scene.spz', file: only }, { id: 'b.spz', path: 'b.spz', url: 'https://x/b.spz', size: 1 }]);
    useReconstructionStore.getState().dropFailedSplat(only);
    expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(2);

    splatOnly([{ id: 'scene.spz', path: 'scene.spz', file: only }]);
    const load = beginReconstructionLoad();
    try {
      useReconstructionStore.getState().dropFailedSplat(only);
      expect(useReconstructionStore.getState().loadedFiles?.splatFileSources).toHaveLength(1);
      expect(load.signal.aborted).toBe(false);
    } finally {
      load.finish();
    }
  });
```
The describe's `afterEach` already calls `clear()` and `vi.unstubAllGlobals()`. `hasUrlToLoad`, `LoadedFiles`, `buildReconstruction` and `beginReconstructionLoad` are already imported.

**RED/GREEN record:**

| Test | HEAD | With the fix |
|---|---|---|
| SplatLayer: "keeps the download overlay when the old splat finishes" | RED: `urlLoading` false, progress `Complete` | GREEN |
| SplatLayer: "keeps the download overlay when the old splat fails, and shows the points again" | RED: `urlLoading` false | GREEN |
| facade: "says whether a tile download is pending…" | RED: not a function | GREEN |
| store: "drops it under a tile download, which keeps its overlay and then shows as a fresh splat" | RED: `splatFile` is still `a` | GREEN; RED again under the partial fix that keeps the call-time `hadSplatBefore` (the tile arrives in the plain display) |
| store: "leaves the points shown when the tile download that was to replace it fails too" | RED: `splatFile` is still `a` | GREEN |
| X9: "returns a splat-only scene with nothing else to show to the landing page…" | RED: the empty scene stays | GREEN |
| X9: "keeps a splat-only scene that lists another splat, and one a dataset load is replacing" | guard: passes at HEAD | GREEN; RED under the mutation that drops the two conditions |
| WebGPU: "leaves a tile download picked with n its overlay…" | see F4 | GREEN |
| existing: "shows the points again without it, as None does…", "leaves the overlay, progress and Cancel to a dataset load settling…", and the three "…new dataset load settles…" SplatLayer tests | pass | pass |

### Risks and interactions

- **Spark's start still writes under a download.** `startSplatLoadingNotification` does not yield: by ruling 5 an attempt that starts during a load is that load's own. Only a backend switch or the WebGPU → Spark fallback starts a Spark attempt for the old splat during a download. Its "Preparing splat renderer…" then shows until the tile lands. Cancel still cancels the download, because `rendererOwnsSplatProgress` is false while a download is pending. Left as is.
- **G12** (`runLoad`'s `finally` keeps the overlay for a pending download): unchanged.
- **The failed splat's bytes.** `showColmapOnly` offloads a re-fetchable splat's bytes, as None does. The download's activation reads `get().loadedFiles` (`latest`), so it sees the dropped state.
- **R1 §E2's display rule holds.** The failed splat leaves the splat display; the tile that replaces it gets one; a tile-to-tile switch keeps the user's display mode.
- **E2e.** `sog-splats.spec.ts` "explain why a damaged SOG cannot open and keep the scene usable" goes through `failSplatLoading` → `dropFailedSplat` on a COLMAP scene with no download: unchanged, and it passes.

### Effort
**high / max**, as one task with F4 and X9. The two renderers must follow one ownership rule, and the stand-aside rule of R1 §E2 changes.

---

## X9: A splat-only scene whose only splat fails is left empty with the landing page hidden — Fix

### Verified
- `dropFailedSplat` (`reconstructionStore.ts:633-639`) runs `showColmapOnly`. A splat-only scene keeps its empty reconstruction, the address bar keeps `?url=`/`#d=`, and the landing panels stay gated off (`DropZone.tsx:231`, `:247`: `!reconstruction && !urlLoading && !hasUrlLoadRequest`). The only exits are a new drop or editing the address.
- A cancelled decode of the same scene returns to the landing page (`:671-677`; f301242, refined by G5 to keep a scene that lists another splat).
- Reproduced: `zz_VF1-4_failedSplatOnly`. It predates the range: it exists since E2 added the drop.

### Fix (code)
In `dropFailedSplat` (diff under F10): the same fallback as the decode Cancel, when
- no dataset load and no tile download owns the loading state. `clear()` would cancel the load replacing this scene, and a download means another splat is on its way;
- the scene has nothing besides splats (`hasSceneBesidesSplats`); and
- no other listed splat can be shown (`hasOtherSplatToShow`).

The renderer's "Failed to load splat …" warning stays on screen above the landing page. `clear()` clears only the store's error toast.

### Tests (code)
The two X9 tests above, and the facade test's COLMAP file.

### Risks and interactions
- A URL load still in its restore (after `processFiles` returned) is aborted by `clear()`, as the decode-Cancel fallback does. Its `catch` is silent, because the load is no longer current.
- `sog-splats.spec.ts` loads its damaged SOG together with the COLMAP test dataset, so the scene stays.

### Effort
**medium / high**, in F10's task: the same function, and the review has to rule out a `clear()` under any load.

---
## F11: A splat chosen in the panel during a load hides the overlay and Cancel

### Verified

**Only `n` is gated.** `n` is ignored while a dataset load is pending (`src/components/viewer3d/useViewerControlsController.ts:164-174`, 8c27a8b). The Point Cloud panel's select goes straight to the store (`:378`, `onSelectSplatSource: splats.selectSplatSource`).

**What a pick does to a pending load's overlay:**
- None: `showColmapOnly` clears `urlLoading`, `urlProgress` and `urlError` (`reconstructionStore.ts:82-86`, `:490-492`).
- A downloaded tile: the same clear (`:497-508`).
- A lazy tile: its download progress replaces the load's (`:521`).

**What follows:**
- The overlay and Cancel vanish, and `handleDrop`'s gate reopens (`src/hooks/useFileDropzone.ts:174-179`). A second drop is accepted and silently aborts the first load, because `beginReconstructionLoad` aborts the active job.
- Reproduced with the real DropZone, panel and workflow (`zz_VA3-3_panelPickDuringDrop`).
- Reproduced in real Chromium with this spec's probe at HEAD: the in-load pick moves the revision 0 → 1, and the overlay shows "Downloading splat: lazy.spz" instead of the load's own message.

**Reach.** Touch mode keeps the panel open, portaled at `z-tooltip` 2000 above the overlay's 500. With a keyboard, Tab reaches the trigger and ArrowDown opens it.

**The in-load reading.** `useFileDropzone.ts:108-111` reads what is on screen, so a lazy pick still downloading at the commit reads as the old splat or as None (`zz_Simplify_1`).

**RED:** the controller test sees `urlLoading` false and the revision moved.

### Root cause

8c27a8b gated the hotkey only. The panel's select is a second entry point to the same choice and stayed open.

### Fix (code)

**Recommended: the panel follows `n`'s rule.** One controller callback gates both. It is the smallest consistent rule and needs no store change. The deliberate in-load rule stays in force for the one remaining source of in-load choices, the splat picker.

**Alternative, rejected: honour the pick without clearing the load's overlay.**
- A downloaded tile would start a renderer attempt during the load, which ruling 5 then treats as that load's own, so it would take over the overlay anyway.
- A lazy tile's download would need a mode without progress.
- The commit would have to read a pending download's id.
- That is several files for a contrived interaction.

`src/components/viewer3d/useViewerControlsController.ts`:
```diff
-  const cycleSplatFile = useCallback(() => {
-    // These tiles belong to the scene a dataset load is replacing; switching one would take over
-    // the load's progress overlay and read as a splat choice for the incoming dataset.
+  // `n` and the Point Cloud panel act on the splats of the scene on screen. While a dataset load is
+  // replacing that scene, a switch would take over the load's progress overlay and its Cancel, and read
+  // as a splat choice for the incoming dataset.
+  const selectSceneSplatSource = useCallback((sourceId: string) => {
     if (isDatasetLoadPending()) {
       return;
     }
+    selectSplatSource(sourceId);
+  }, [isDatasetLoadPending, selectSplatSource]);
+
+  const cycleSplatFile = useCallback(() => {
     const nextSourceId = getNextSplatSourceId(splatFileSources, activeSplatSourceId);
     if (nextSourceId) {
-      selectSplatSource(nextSourceId);
+      selectSceneSplatSource(nextSourceId);
     }
-  }, [activeSplatSourceId, isDatasetLoadPending, selectSplatSource, splatFileSources]);
+  }, [activeSplatSourceId, selectSceneSplatSource, splatFileSources]);
@@ pointCloudPanel
-      onSelectSplatSource: splats.selectSplatSource,
+      onSelectSplatSource: selectSceneSplatSource,
```

**The in-load reading (`useFileDropzone.ts:110`) needs no further change:**
- Once `n` and the panel are gated, a choice can be made during a load from only two places:
  - the splat picker, left open while a Reload runs (the Reload is started from a portaled panel);
  - the decode branch of Cancel (None), in a Reload's first milliseconds (F4's early window).
- A Reload keeps the on-screen splat state whatever is read: `carryOverSplatState` decides the commit, and `withoutSplatChoice` stops the restore from switching it. The only effect left is that a lazy tile picked during the Reload is cancelled at its commit (`setLoadedFiles` → `cancelPendingSplatLoad`).
- No UI can choose during a new dataset's load. With a scene open, the landing panel is hidden and the picker's overlay blocks drops; the picker sits outside DropZone's React tree.
- F2's flag already corrects the reading's one wrong answer: a scene with nothing chosen no longer reads as None.

### Tests (code)

**`src/components/viewer3d/useViewerControlsController.test.ts`.** Append to the `describe`, after "ignores N while a dataset load replaces the scene and cycles again once it ends":
```ts
  it.each([['None', ''], ['another splat', 'b.spz']])(
    'ignores %s picked in the Point Cloud panel while a dataset load replaces the scene', (_label, sourceId) => {
      const first = buildFile('a.spz', 'a');
      const second = buildFile('b.spz', 'b');
      useReconstructionStore.setState({
        reconstruction: buildReconstruction(),
        loadedFiles: buildLoadedFiles({ splatFile: first, splatFiles: [first, second], splatFileSources: [
          { id: 'a.spz', path: 'a.spz', file: first }, { id: 'b.spz', path: 'b.spz', file: second }] }),
      });
      const { result } = renderHook(() => useViewerControlsController(), { wrapper: hotkeyWrapper });
      const revision = useReconstructionStore.getState().splatSelectionRevision;
      const parsing = { percent: 20, message: 'Parsing COLMAP files...' };
      const load = beginReconstructionLoad();
      try {
        useReconstructionStore.setState({ urlLoading: true, urlProgress: parsing });
        act(() => result.current.pointCloudPanel.onSelectSplatSource(sourceId));
        // The load keeps its overlay and Cancel, and the scene it replaces keeps its splat.
        expect(useReconstructionStore.getState()).toMatchObject({ urlLoading: true, urlProgress: parsing,
          splatSelectionRevision: revision });
        expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(first);
      } finally {
        load.finish();
      }
      act(() => result.current.pointCloudPanel.onSelectSplatSource(sourceId));
      expect(useReconstructionStore.getState().loadedFiles?.splatFile).toBe(sourceId ? second : undefined);
    });
```

**RED/GREEN record:**

| Test | HEAD | With the fix |
|---|---|---|
| "ignores None picked in the Point Cloud panel…" | RED: `urlLoading` false, revision moved | GREEN |
| "ignores another splat picked in the Point Cloud panel…" | RED: the same, and `b.spz` shows | GREEN |
| "ignores N while a dataset load replaces the scene…" | pass | pass |
| Chromium probe `zz_q2_probes.spec.ts` › F11 (scratch only) | RED: revision 0 → 1, overlay "Downloading splat: lazy.spz" | GREEN: revision unchanged, overlay "Computing statistics...", Cancel visible |

### Risks and interactions
- **The select snaps back.** It is controlled (`value={activeSplatSourceValue}`, `PointCloudPanel.tsx:129-135`), so an ignored change returns to the active value on the next render.
- **During a URL load's download phase,** before `processFiles` begins its job, no dataset load is pending and picks still apply. Only a URL load over a visible scene reaches that phase with a panel open, and X5 closes the known UI path to one.
- **E2e.** `viewer-controls.spec.ts` "Point Cloud button should show point controls when hovered" runs with no load pending: unaffected, and it passes.

### Effort
**medium / medium.** One controller callback, and the review checks that the in-load rule keeps its meaning.

---

## X11(b): The in-load pick rule rides on `requestedSplatSourceId`'s leftover — Fix (small)

### Verified
- Every activation leaves `requestedSplatSourceId` set (`reconstructionStore.ts:500`, `:578`, `:599`).
- The in-load rule (`fileDropzoneWorkflow.ts:585-599`) depends on that leftover. A pick that names an incoming splat by path or file name is neither honoured in the workflow nor re-based. The store re-picks it at the commit (`setLoadedFiles`, `:371-375`) only because the activation left its id requested.
- Without the leftover, the incoming default shows and the saved choice is skipped (`zz_Simplify_2`, "no leftover" case).
- The with-scene, non-null branch of `setRequestedSplatSourceId` (`:450-453`) has no production caller left:
  - `applyShareConfig` sends a non-empty id only before a scene exists, because `restorationConfig` and `viewConfig` strip it;
  - `requestSplatForLoad` and `beginLocalLoad` send `null` when a scene exists.

### Fix (code)
The workflow resolves the pick itself, the hardening G7's spec named (R2 §G7, "Risks and interactions"):
```diff
       // A choice made during the load carries over only when it fits these files: None, or one of
-      // their sources. A tile of the scene being replaced keeps the default, and saved settings
-      // restore as if it had not been made, unless it names one of these splats by path or file
-      // name: the store re-picks that splat at commit.
-      if (currentSelection.sourceId === '') {
-        splatFile = undefined;
-      } else {
-        const chosen = splatFileSources.find(source => source.id === currentSelection.sourceId);
-        if (chosen) splatFile = chosen.file;
-        else if (currentSelection.sourceId === undefined
-          || !findSplatSourceById({ splatFileSources }, currentSelection.sourceId)) {
-          ignoredSplatSelectionRevision = currentSelection.revision;
-        }
-      }
+      // their sources by id, path or file name. A tile of the scene being replaced keeps the default,
+      // and saved settings restore as if it had not been made.
+      const { sourceId } = currentSelection;
+      const chosen = sourceId ? splatFileSources.find(source => source.id === sourceId)
+        ?? findSplatSourceById({ splatFileSources }, sourceId) : undefined;
+      if (sourceId === '') splatFile = undefined;
+      else if (chosen) splatFile = chosen.file;
+      else ignoredSplatSelectionRevision = currentSelection.revision;
```
- Behaviour is unchanged while the leftover exists: the store's re-pick at the commit then finds the splat already active.
- For a Reload, `getSplatState` still overrides `splatFile` with the carry-over (`:600-602`), as before.

**Set aside, refactor-only:** activations still record their id, which a Reload's commit re-picks redundantly, and the dead with-scene branch stays. Removing either touches the store, `useUrlState.ts` and their tests, with no change a user can see.

### Tests (code)
`src/hooks/fileDropzoneWorkflow.test.ts`:
- Give the helper an option. Change its signature to `async function replaceSceneWhileChoosing(choice: string, { withoutStoreRequest = false } = {}) {`.
- After `await state.selectSplatSource(choice);` add:
```ts
      // The activation leaves its id requested; the commit must not depend on that leftover.
      if (withoutStoreRequest) useReconstructionStore.setState({ requestedSplatSourceId: null });
```
- Replace "keeps the incoming splat named like the picked tile over the incoming colmapview.yaml" with:
```ts
  it.each([false, true])('keeps the incoming splat named like the picked tile over the incoming colmapview.yaml (store request cleared: %s)', async withoutStoreRequest => {
    // The pick names splats/b.spz by its file name, so the commit shows that splat.
    const { incoming, shown } = await replaceSceneWhileChoosing('b.spz', { withoutStoreRequest });
    expect(shown).toBe(incoming.b);
  });
```
RED at HEAD for `true`: the commit shows `default.spz`. GREEN with the fix; `false` passes either way.

### Effort
**low / medium**, in F11's task: three lines, and the review checks that the leftover's two jobs stay equivalent.

---
## X5: Files dropped while the Load URL dialog is open start a load under it — Fix

### Verified
- `UrlInputModal` renders inside `DropZone` (`src/components/dropzone/DropZone.tsx:312-317`) and portals to `document.body` (`src/components/ui/ModalDialogShell.tsx:130`). React bubbles the portal's `drop` to DropZone's `onDrop` (`DropZone.tsx:185-188`), which starts a local load under the dialog.
- While that load runs, the dialog cannot be closed: its X and Cancel are disabled while `loading` (`UrlInputModal.tsx:93`, `:141`), and Escape does nothing. It also covers "Cancel loading" (`Z_INDEX.modalOverlay` 1100 over `overlay` 500, `src/theme/zIndex.ts`).
- After the load the dialog is still open over the new scene, and Load starts a URL load over a visible scene. The code assumes that has no UI entry point (`fileDropzoneWorkflow.ts:69-74`).
- The Hugging Face and Drive publish dialogs and the account dialogs also render inside DropZone, so a drop on them starts a load under them the same way.
- Reproduced in jsdom (`zz_A3_3`) and in Chromium (`zz_VA3-1_dialogdrop`). This spec's Chromium probe at HEAD: a `scene.spz` dropped on the dialog loads a splat-only scene underneath.

**RED** (HEAD code): the drag overlay "Drop dataset folder or ZIP here" appears over the dialog, and `handleDrop` is called.

### Root cause
DropZone accepts file drops from every descendant in its React tree, and that tree includes portaled modal dialogs.

### Fix (code)
`src/components/dropzone/DropZone.tsx`:
```diff
 interface DropZoneProps {
   children: React.ReactNode;
 }
 
+/** An open dialog covers the page: files dropped on it are not a dataset for the scene underneath. */
+function isOverModalDialog(target: EventTarget): boolean {
+  return target instanceof Element && target.closest('[aria-modal="true"]') !== null;
+}
+
 export function DropZone({ children }: DropZoneProps) {
@@ onDragEnter
     // Only respond to file drags, not internal UI drags (e.g., dragging in popup panels)
-    if (e.dataTransfer.types.includes('Files')) {
+    if (e.dataTransfer.types.includes('Files') && !isOverModalDialog(e.target)) {
       setIsDragOver(true);
     }
@@ onDrop
   const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
     setIsDragOver(false);
+    if (isOverModalDialog(e.target)) {
+      // Prevented, so the browser does not open the file in place of the viewer either.
+      e.preventDefault();
+      e.stopPropagation();
+      return;
+    }
     await handleDrop(e);
   }, [handleDrop]);
```
- **The default stays prevented.** Chrome otherwise opens a dropped file in place of the app. `onDragOver` (`handleDragOver`) is unchanged and still accepts the drag.
- **Every modal is covered.** `aria-modal="true"` marks every `ModalDialogShell` dialog, `ConfirmationHost` and the touch gallery drawer. Help and the splat picker render outside DropZone's React tree (`App.tsx:89-90`), so drops on them never reached it; that is unchanged.
- **Alternative, rejected:** close the URL dialog and accept the drop. For the publish dialogs, a dataset change would invalidate the job they show.

### Tests (code)
`src/components/dropzone/DropZone.test.tsx`:
- Hoist the `handleDrop` mock:
```diff
 const selectedUrl = 'https://drive.google.com/file/d/1DpE-bfPPIVp7TwZeMyhmisfEwCrJ0QDd/view?resourcekey=shared-key';
+const { handleDropMock } = vi.hoisted(() => ({ handleDropMock: vi.fn() }));
 
 vi.mock('../../hooks/useFileDropzone', () => ({
-  useFileDropzone: () => ({ handleDrop: vi.fn(), handleDragOver: vi.fn(), handleBrowse: vi.fn() }),
+  useFileDropzone: () => ({ handleDrop: handleDropMock, handleDragOver: vi.fn(), handleBrowse: vi.fn() }),
 }));
```
- Give the desktop panel mock a way to open the dialog:
```diff
-  DesktopDropZonePanel: ({ onLoadGoogleDriveArchive }: { onLoadGoogleDriveArchive: (url: string) => void }) =>
-    <button type="button" onClick={() => onLoadGoogleDriveArchive(selectedUrl)}>Select desktop Drive archive</button>,
+  DesktopDropZonePanel: ({ onLoadGoogleDriveArchive, onOpenUrlModal }: {
+    onLoadGoogleDriveArchive: (url: string) => void; onOpenUrlModal: () => void;
+  }) => <>
+    <button type="button" onClick={() => onLoadGoogleDriveArchive(selectedUrl)}>Select desktop Drive archive</button>
+    <button type="button" onClick={onOpenUrlModal}>Load URL</button>
+  </>,
```
- Insert before `describe('DropZone loading overlay'`. The file's `afterEach` already calls `vi.clearAllMocks()`.
```tsx
describe('DropZone drops over an open dialog', () => {
  it('ignores files dropped on the Load URL dialog, without letting the browser open them', () => {
    vi.mocked(useUrlLoader).mockReturnValue({
      loadFromUrl: vi.fn(), loadFromManifest: vi.fn(), urlLoading: false, urlProgress: null,
      urlError: null, clearUrlError: vi.fn(), setUrlLoading: vi.fn(), setUrlProgress: vi.fn(),
    });
    render(<DropZone><div>Viewer</div></DropZone>);
    fireEvent.click(screen.getByRole('button', { name: 'Load URL' }));
    const dialog = screen.getByRole('dialog', { name: 'Load from URL' });
    const dataTransfer = { types: ['Files'], files: [new File(['x'], 'cameras.bin')], items: [] };

    fireEvent.dragEnter(dialog, { dataTransfer });
    expect(screen.queryByText('Drop dataset folder or ZIP here')).not.toBeInTheDocument();
    // false: the default was prevented, so the browser does not open the dropped file either.
    expect(fireEvent.drop(dialog, { dataTransfer })).toBe(false);

    // A load started under the dialog would hide Cancel loading behind it, and leave it open over the scene.
    expect(handleDropMock).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Load from URL' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.drop(screen.getByTestId('drop-zone'), { dataTransfer });
    expect(handleDropMock).toHaveBeenCalledOnce();
  });
});
```

**RED/GREEN record:**

| Test | HEAD | With the fix |
|---|---|---|
| "ignores files dropped on the Load URL dialog…" | RED: the drag overlay shows; `handleDrop` is called | GREEN |
| the file's 7 other tests | pass | pass |
| Chromium probe `zz_q2_probes.spec.ts` › X5 (scratch only) | RED: `hasScene: true`, a splat-only scene loaded under the dialog | GREEN: no load, default prevented, the dialog can still be closed |

### Risks and interactions
- **The touch gallery drawer** (`TouchGalleryDrawer.tsx:107-110`) is `aria-modal`. Drops on the drawer panel are now ignored; drops on its backdrop still load. File drags rarely happen in touch mode.
- **E2e.** Every drop in the suite is dispatched on `[data-testid="drop-zone"]` itself (`e2e/fixtures/load-test-data.ts:130-152`, `e2e/dataset-viewer-settings.spec.ts:39`), never on a dialog, so it is unaffected. `drop-zone.spec.ts` and `modals.spec.ts` (the URL dialog without drops) pass.
- **X11(a)** is set aside, so the facade stays as it is; this change uses no store.

### Effort
**low / medium.** A small DOM-event guard; the review checks portal event bubbling and that the default stays prevented.

---

## X7: Escape in Help also closes the image viewer and tool windows — Set aside
Pre-existing and harmless: the windows it closes reopen with one action, and nothing is lost. G13's single-listener stack arbitrates only between `ModalDialogShell` dialogs. The windows underneath answer Escape through their own document listeners: `react-hotkeys-hook` bindings in `ImageDetailModal.tsx:174-190`, `DeletionModal.tsx:115` and the other tool windows, and context menus. A fix needs one Escape arbitration across about 15 non-shell components (for example a capture-phase `stopPropagation` in the shell, which also changes key delivery inside every dialog). That is not small, and it belongs in its own change with a Playwright pass.

## X11(a): `DropZone.prepareUrlLoad` reads the store through `getState()` — Set aside
Refactor-only. `DropZone.tsx:50-74` is the only component with direct `getState()` calls (five), and `componentStoreBoundary.test.ts:6` matches only hook calls. The drift from `runLoad` changes nothing a user sees: `prepareUrlLoad` hands ownership to `runLoad` in the same tick (`finishUrlLoad`, then `load()`), and `runLoad` redoes the full protocol. Moving the protocol into `useDropZoneStoreFacade` would rewrite the facade mock in every `DropZone.test.tsx` test, which rely on the real store's `tryStartUrlLoad`. Worth a cleanup pass that also teaches the boundary test about `use*Store.getState()` in components.

## X11(c): The four Reload entry points are copies — Set aside
Refactor-only, and no fix here needs them. The copies are `TransformPanel.tsx:63-66`, `ExportPanel.tsx:201-205`, `globalContextMenuActionExecutor.ts:285-288` and `transformGizmoContextMenuExecutor.ts:23-26`. Since G2 each is the same two lines (`droppedFiles` and `await confirmReload()`, then `reloadFiles(droppedFiles)`), wired through four facades. They read `droppedFiles` before the confirmation's `await` (Si-6's latent note): a dataset load that commits while the confirmation is open would make the Reload re-read the previous files. Reaching that needs Reload clicked in a portaled panel during a pending load and the load committing before the answer. Merging the copies (and reading the map after the `await`) touches four components, two executors and their tests.

---
## E2e

**Specs the fixes could affect** (all in the CI gate, `--project=chromium`, unless noted):

| Item | Specs | Why |
|---|---|---|
| F2 | `hugging-face-publish.spec.ts`, `dataset-viewer-settings.spec.ts` | The published `colmapview.yaml` and restored settings |
| F4 | `webgpu-psnr-app.spec.ts`, `webgpu-sog.spec.ts` (`chromium-webgpu`, not in the gate) | WebGPU splat loading |
| F10, X9 | `sog-splats.spec.ts` | A damaged SOG goes through `failSplatLoading` → `dropFailedSplat` |
| F11 | `viewer-controls.spec.ts` | The Point Cloud panel |
| X5 | `drop-zone.spec.ts`, `modals.spec.ts`, and every spec that drops a dataset (`dataset-viewer-settings`, `gallery`, `hugging-face-publish`, `mask-export`, `object-context-menu`, `reconstruction-worker`, `sog-splats`, `ui-polish`) | Drops and the URL dialog |
| X11(b) | none | — |

**No existing e2e spec pins a behaviour these fixes change**, so none needs a RED/GREEN pair. Results in the scratch copy, on port 5312:
- **The CI gate** (`npx playwright test --project=chromium --reporter=list`) with all fixes: 88 passed, 1 failed. The failure is `dataset-viewer-settings.spec.ts:14` "restores colmapview.yaml from a remote archive" (`sidecarRequests` 1 vs 0), which is F1 (Q1's). It fails the same way at HEAD.
- **`--project=chromium-webgpu`:** 16 passed, 1 failed with the fixes and at HEAD alike. The failure is the same flaky test, "repeats selected-image PSNR without leaking WebGPU resources", which reads `activePsnrImageJobs: 1` at its baseline. A serial run of `webgpu-psnr-app.spec.ts` fails "keeps selected-image PSNR off the visible viewer surface" at HEAD and with the fixes alike.
- **Browser probes** for F11 and X5 (`scratchpad/rev4/q2/e2e/zz_q2_probes.spec.ts`, run with `zz_q2.playwright.config.ts`): RED at HEAD (`q2-head`), GREEN with the fixes. They import `/src/...` modules through the dev server and fake a pending load, which is too brittle for the gate, so they stay in the scratchpad.

---

## Residual risks (not fixed here)

1. **F4's early window.** A Cancel within the milliseconds before a Reload writes its own progress is still None, as with Spark today. Optional hardening is in F4.
2. **A WebGPU → Spark fallback during a pending load.** The Spark attempt counts as that load's own (ruling 5's attempt-start rule) and can take over the overlay.
3. **"During a load" is not "during this load".** Spark and WebGPU both record only whether some load was pending when an attempt began. A load generation would close this.
4. **Spark's start under a tile download.** A backend switch or fallback mid-download shows Spark's "Preparing splat renderer…" until the tile lands. Cancel still cancels the download.
5. **A lazy tile picked in the splat picker during a Reload** is cancelled at the Reload's commit (F11's reading).
6. **The touch gallery drawer** ignores dropped files (X5).
7. **The forced `?splatBackend=webgpu`:** failures are still not dropped (R1's E2 residual 1).

---

## File ownership

Working-tree line endings from `git ls-files --eol`; the index is LF throughout. Keep each file's working-tree endings.

| File | Items | Task | EOL |
|---|---|---|---|
| `src/utils/splatFileSourcePolicy.ts` | F2 | A | CRLF |
| `src/utils/splatFileSourcePolicy.test.ts` | F2 | A | CRLF |
| `src/store/reconstructionStore.ts` | F2; F10, X9 | A; B | CRLF |
| `src/store/reconstructionStore.test.ts` | F2; F10, X9 | A; B | CRLF |
| `src/hooks/useUrlState.ts` | F2 (`collectShareConfig`) | A | CRLF |
| `src/hooks/useUrlState.test.ts` | F2 | A | CRLF |
| `src/hooks/useFileDropzone.ts` | F2 (`getSplatSelectionState`) | A | CRLF |
| `src/features/datasetPublishing/preparePublication.ts` | F2 | A | CRLF |
| `src/features/datasetPublishing/preparePublication.test.ts` | F2 | A | CRLF |
| `src/hooks/useUrlLoader.test.ts` | F2 (helpers at `:94`, `:507`) | A | CRLF |
| `src/hooks/fileDropzoneWorkflow.test.ts` | F2 (helpers at `:378`, `:409`, `:462`); X11(b) | A; C | CRLF |
| `src/components/viewer3d/WebGpuSplatCanvasLayer.tsx` | F4, F10 | B | LF |
| `src/components/viewer3d/WebGpuSplatCanvasLayer.test.tsx` | F4, F10 | B | LF |
| `src/components/viewer3d/useScene3DStoreFacade.ts` | F4 | B | CRLF |
| `src/components/viewer3d/useScene3DStoreFacade.test.ts` | F4 | B | LF |
| `src/components/viewer3d/Scene3D.tsx` | F4 | B | CRLF |
| `src/components/viewer3d/PointCloud/SplatLayer.tsx` | F10 | B | CRLF |
| `src/components/viewer3d/PointCloud/SplatLayer.test.tsx` | F10 | B | CRLF |
| `src/components/viewer3d/PointCloud/SplatLayerStoreFacade.ts` | F10 | B | CRLF |
| `src/components/viewer3d/PointCloud/SplatLayerStoreFacade.test.ts` | F10, X9 | B | CRLF |
| `src/components/viewer3d/useViewerControlsController.ts` | F11 | C | CRLF |
| `src/components/viewer3d/useViewerControlsController.test.ts` | F11 | C | CRLF |
| `src/hooks/fileDropzoneWorkflow.ts` | X11(b) | C | CRLF |
| `src/components/dropzone/DropZone.tsx` | X5 | D | CRLF |
| `src/components/dropzone/DropZone.test.tsx` | X5 | D | CRLF |

---

## Recommended task grouping and order

| Task | Items | Commit subject | Effort (implementer / reviewer) | Depends on |
|---|---|---|---|---|
| **A** | F2 | Keep the dataset's own splat in share links and publications unless None was chosen | high / high | — |
| **B** | F4, F10, X9 | Keep a Reload's or tile download's overlay and Cancel while an earlier splat finishes decoding | high / max | A (`reconstructionStore.ts` and its test) |
| **C** | F11, X11(b) | Ignore splat picks in the Point Cloud panel while a dataset load replaces the scene | medium / medium | A (`fileDropzoneWorkflow.test.ts`) |
| **D** | X5 | Ignore files dropped on an open dialog instead of loading them underneath | low / medium | — |

- **Order:** A first, then B and C in parallel. D can run at any time.
- **Task B's body** should also say the X9 change: "A splat-only scene whose only splat fails returns to the landing page, as cancelling its decode does."
- **Why these groups.**
  - B puts both renderers' ownership rule and `dropFailedSplat` before one reviewer, who can hold Spark, WebGPU, the stand-aside change and G3 together.
  - C keeps the in-load pick rule's two edits, the gate and the explicit resolution, in one review.
- **Before each commit:** the full `npx vitest run`, `npx tsc -b --force`, `npm run lint`, and for B also `npx playwright test --project=chromium` (the CI gate).

---

## Cross-area notes

**Q1 (URL load lifecycle and restore)** (`Q1-url-load-restore.md`):
- `src/hooks/useUrlState.ts` and its test: Q1-C (F9) edits `applySavedViewerState`'s `restorationConfig` (`:131-144`); Task A edits `collectShareConfig` (`:62-63`). The hunks are disjoint, as Q1 also notes; land the tasks one after the other.
- `src/hooks/useFileDropzone.ts`: Q1-E (X6) edits `beginLocalLoad` (`:30-44`); Task A edits `getSplatSelectionState` (`:108-111`). Disjoint; sequential.
- `src/hooks/useUrlLoader.test.ts`: Q1's F1 task replaces `:1084-1109`; Task A edits the two `getSplatSelectionState` helpers (`:94`, `:507`). Sequential.
- `src/hooks/fileDropzoneWorkflow.test.ts`:
  - Q1-E (F15) adds a point-cloud `it.each`; Tasks A and C edit the helpers and the in-load tests.
  - Task C also edits `fileDropzoneWorkflow.ts:582-599`, which no Q1 task touches.
- **Q1-E's F15 test "keeps None picked while a dropped folder is still being read" stays green under Q2.** It picks None through the store, not the panel, so F11's gate does not apply. F2's flag makes the in-load reading return `''`, so the None is honoured. Q1's spec asks for exactly this.
- **F2's reading change** (a scene with nothing chosen now reads `undefined`, not `''`) is visible to any Q1 test that asserts the in-load reading for such a scene. None in Q1's spec does.
- `src/store/reconstructionStore.ts`: Q1-D (F7) only imports `clearUrlLoadRequestFromLocation`. Contrary to Q1's note, F4 does not edit `cancelLoading`; Task A adds one field to its decode branch.
- Q1's note that X11(b) "may touch `useUrlLoader.ts:106-109`": it does not; X11(b) edits only `fileDropzoneWorkflow.ts`.

**Q3 (publishing and Drive)** (`Q3-publishing-drive.md`): `src/features/datasetPublishing/preparePublication.ts` and its test.
- Q3's T3 (F5) and T4 (F13) edit `:38-45`, `:141-148`, `:170-176` and `:193-199`. Task A edits `:203-207`, next to T4's splat-branch hunk; it also edits the file's first test and adds one after it.
- No semantic overlap, as Q3 also notes: land them one after the other and re-run `preparePublication.test.ts`.
- Drive (`prepareArchive.ts:157`, `splats: 'active'`) inherits Task A's rule with no change.

**Q4 (release, deploy and docs):** no shared files. No doc describes the share-link splat semantics; `CHANGELOG.md`'s Unreleased section is Q4's.

---

## Verification log

Scratch copy: `scratchpad/rev4/q2/` (fixes); `scratchpad/rev4/q2-head/` (HEAD). Logs are in `scratchpad/rev4/`.
- RED, HEAD code with the new tests: `npx vitest run <the 12 test files>` → 25 failed in 11 files (`q2_red_run.log`).
- GREEN: the same files plus `useFileDropzone.test.ts`, `SplatPickerModal.test.tsx` and `componentStoreBoundary.test.ts` → 15 files, 522 tests passed. Full `npx vitest run` → 577/580 files; the 3 failures are scratch fixture gaps (`q2_full_green.log`).
- Mutations, each reverted:
  - WebGPU ownership dropped (`&& Boolean(attempt)`) → the guard "reports a splat that began decoding during a dataset load…" fails;
  - `dropFailedSplat`'s two X9 conditions dropped → the guard "keeps a splat-only scene…" fails;
  - the activation display read at the pick → "drops it under a tile download…" fails at its last assertion.
- `npx tsc -p tsconfig.test.json --noEmit` → only the two fixture-gap imports. `npx eslint <changed files>` → clean.
- `COLMAP_WEBVIEW_E2E_PORT=5312 npx playwright test --project=chromium --reporter=list` → 88 passed, 1 failed (F1) (`q2_e2e_green_full.log`).
- `--project=chromium-webgpu` at both copies → 16/1 each, the same flaky test (`q2_e2e_webgpu_green.log`, `q2_e2e_webgpu_head.log`).
- `npx playwright test --config=zz_q2.playwright.config.ts --reporter=list` → 2 failed at HEAD, 2 passed with the fixes (`q2_probes_red.log`, `q2_probes_green.log`).
